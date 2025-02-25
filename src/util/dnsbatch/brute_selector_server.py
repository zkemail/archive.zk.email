from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, disconnect
from flask_cors import CORS
import time
import requests
import jsonpickle 
import concurrent.futures
import multiprocessing
from multiprocessing import Manager
from typing import List, Set, Union, Optional
import threading
import subprocess
import dns.exception
import dns.resolver
import dns.rdatatype
 
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

manager = Manager()
active_sessions = manager.dict()
# ARCHIVE_API_URL = "http://localhost:3000/api/dsp"
ARCHIVE_API_URL = "https://archive.prove.email/api/dsp"

def parse_tags(txtData: str) -> dict[str, str]:
    dkimData: dict[str, str] = {}
    for tag in txtData.split(';'):
        tag = tag.strip()
        if not tag:
            continue
        try:
            key, value = tag.split('=', maxsplit=1)
            dkimData[key] = value
        except ValueError:
            #print(f'warning: invalid tag: {tag}, {txtData}')
            continue
        dkimData[key] = value
    return dkimData

def resolve_qname(domain: str, selector: str):
    qname = f"{selector}._domainkey.{domain}"

    try:
        response = dns.resolver.resolve(qname, dns.rdatatype.TXT)
        if len(response) == 0:
            #print(f'warning: no records found for {qname}')
            return
        txtData = ""
        for i in range(len(response)):
            txtData += b''.join(response[i].strings).decode()
            txtData += ";"
        tags = parse_tags(txtData)
        if 'p' not in tags:
            #print(f'warning: no p= tag found for {qname}, {txtData}')
            return
        if tags['p'] == "":
            #print(f'warning: empty p= tag found for {qname}, {txtData}')
            return
        if tags['p'] in ["reject", "none"]:
            #print(f'info: p=reject found for {qname}, {txtData}')
            return
        if len(tags['p']) < 10:
            print(f'# short p= tag found for {qname}, {txtData}\n')
            return
        return txtData
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, dns.exception.Timeout) as _e:
        #print(f'warning: dns resolver error: {e}')
        pass

class DKIMResolver:
    def __init__(self, block_size: int = 100, session_id: str = None):
        self.PROCESS_COUNT = multiprocessing.cpu_count() - 1
        self.BLOCK_SIZE = block_size
        self.session_id = session_id
        self.total_blocks = 0
        
    def _process_block(self, args: tuple, http: bool) -> List[str]:
        block_lines, block_id, domain = args
        start_time = time.time()
        results = []
        
        if not http and self.session_id in active_sessions:
            socketio.emit("blockProcessingStarted", {
                "domain": domain,
                "blockId": block_id,
                "totalLines": len(block_lines)
            }, room=self.session_id)
            
        print(f"Block {block_id}: Starting to process {len(block_lines)} lines")
        seen_selectors = []
        
        for line in block_lines:
            selector = line.strip()
            if selector not in seen_selectors:
                seen_selectors.append(selector)
                try:
                    value = resolve_qname(domain, selector)
                    if value:
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            executor.submit(self._add_to_database, domain, selector)
                        
                        if not http and self.session_id in active_sessions:
                            print(f"Found valid selector: {selector}")
                            result_data = {"domain": domain, "selector": selector, "value": value}
                            active_sessions[self.session_id].append(result_data)
                            results.append(result_data)
                        elif http:
                            results.append({"domain": domain, "selector": selector, "value": value})
                except Exception as e:
                    print(f"Error resolving {selector}: {e}")
        
        time_taken = time.time() - start_time
        print(f"Block {block_id}: Completed in {time_taken:.2f} seconds ({len(results)} valid)")
        
        if not http and self.session_id in active_sessions:
            socketio.emit("blockProcessingCompleted", {
                "domain": domain,
                "blockId": block_id,
                "timeTaken": time_taken,
                "validCount": len(results)
            }, room=self.session_id)
            
        return results

    def _emit_results_background(self):
        if self.session_id not in active_sessions:
            return
            
        while self.session_id in active_sessions:
            results = active_sessions[self.session_id]
            if len(results) > 0:
                selectorResult = results.pop(0)                
                try:
                    socketio.emit("bruteDomainResponse", selectorResult, room=self.session_id)
                except Exception as e:
                    print(f"Error emitting result: {e}")
                    break
                time.sleep(0.1)
            else:
                time.sleep(0.5)
                
    def _add_to_database(self, domain, selector):
        data = {
            "domain": domain,
            "selector": selector,
            }
        try:
            response = requests.post(ARCHIVE_API_URL, json=data)
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")

    def find_valid_selectors(self, 
                           domain: str,
                           selectors: Union[List[str], str],
                           verbose: bool = False,
                           http: bool = True) -> List[str]:
        start_time = time.time()
        
        emitter_thread = None
        if not http and self.session_id in active_sessions:
            emitter_thread = threading.Thread(target=self._emit_results_background)
            emitter_thread.daemon = True
            emitter_thread.start()

        if isinstance(selectors, str):
            with open(selectors, 'r') as file:
                selector_list = [line.strip() for line in file.readlines()]
        else:
            selector_list = selectors
        unique_selectors = list(set(selector for selector in selector_list if selector))
        
        if verbose:
            print(f"Using {self.PROCESS_COUNT} processes")
            print(f"Found {len(unique_selectors)} unique selectors to check")
            
        blocks = []
        for i in range(0, len(unique_selectors), self.BLOCK_SIZE):
            blocks.append(unique_selectors[i:i + self.BLOCK_SIZE])
        
        self.total_blocks = len(blocks)
        
        if not http and self.session_id in active_sessions:
            socketio.emit("processingStarted", {
                "domain": domain,
                "totalSelectors": len(unique_selectors),
                "totalBlocks": self.total_blocks
            }, room=self.session_id)
            
        if verbose:
            print(f"Split into {len(blocks)} blocks")
            
        block_args = [(block, idx, domain) for idx, block in enumerate(blocks)]
        valid_selectors = []
        
        try:
            with concurrent.futures.ProcessPoolExecutor(max_workers=self.PROCESS_COUNT) as executor:
                futures = [
                    executor.submit(self._process_block, args, http) 
                    for args in block_args
                ]
                
                completed = 0
                for future in concurrent.futures.as_completed(futures):
                    try:
                        block_results = future.result()
                        valid_selectors.extend(block_results)
                        
                        completed += 1
                        if verbose:
                            print(f"Progress: {completed}/{len(blocks)} blocks completed")
                    except Exception as e:
                        print(f"Block processing error: {e}")
        finally:
            if not http and self.session_id in active_sessions:
                socketio.emit("processingComplete", {
                    "domain": domain, 
                    "count": len(valid_selectors),
                    "totalBlocksProcessed": self.total_blocks
                }, room=self.session_id)
        
        if verbose:
            total_time = time.time() - start_time
            print(f"\nProcessing completed in {total_time:.2f} seconds")
            print(f"Total valid selectors found: {len(valid_selectors)}")
            
        return valid_selectors

@app.route('/bruteDomain', methods=['GET'])
def brute_domain():
    domain = request.args.get('domain')
    if not domain:
        return jsonify({'error': 'Domain parameter is required'}), 400
    print(f"Received domain: {domain}")
    
    resolver = DKIMResolver(block_size=100)
    results = resolver.find_valid_selectors(
        domain=domain,
        selectors="dkim_selectors.txt",
        verbose=False,
        http=True,
    )
    print(results)
    json_result = jsonpickle.encode(results)
    return json_result, 200

@socketio.on('connect')
def handle_connect():
    session_id = request.sid
    active_sessions[session_id] = manager.list()
    print(f"Client connected with session ID: {session_id}")
    emit('connected', {'session_id': session_id})
    return session_id

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    if session_id in active_sessions:
        del active_sessions[session_id]
        print(f"Client disconnected: {session_id}")
    else:
        print(f"Client disconnect event for unknown session: {session_id}")

@socketio.on('bruteDomain')
def handle_brute_domain_ws(data):
    session_id = request.sid
    domain = data.get('domain')
    
    if not domain:
        emit('error', {'message': 'Domain parameter is required'}, room=session_id)
        return
        
    if session_id not in active_sessions:
        emit('error', {'message': 'Invalid session'}, room=session_id)
        return
        
    print(f"Received domain via WebSocket for session {session_id}: {domain}")
    
    def process_domain():
        try:
            resolver = DKIMResolver(block_size=100, session_id=session_id)
            results = resolver.find_valid_selectors(
                domain=domain,
                selectors="dkim_selectors.txt",
                verbose=False,
                http=False,
            )
        except Exception as e:
            print(f"Error processing domain {domain}: {e}")
            if session_id in active_sessions:
                socketio.emit("error", {'message': f'Processing error: {str(e)}'}, room=session_id)
    
    processing_thread = threading.Thread(target=process_domain)
    processing_thread.daemon = True
    processing_thread.start()

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000)) 
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)