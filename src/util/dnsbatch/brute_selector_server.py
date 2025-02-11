from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, disconnect
from flask_cors import CORS
import time
import requests
import jsonpickle 
import concurrent.futures
from dsp_onetime_batch import resolve_qname
import multiprocessing
from multiprocessing import Manager
from typing import List, Set, Union, Optional
import threading
import subprocess
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

manager = Manager()
active_sessions = manager.dict()
ARCHIVE_API_URL = "http://localhost:3000/api/dsp"

class DKIMResolver:
    def __init__(self, block_size: int = 100, session_id: str = None):
        self.PROCESS_COUNT = multiprocessing.cpu_count() - 1
        self.BLOCK_SIZE = block_size
        self.session_id = session_id
        
    def _process_block(self, args: tuple, http: bool) -> List[str]:
        block_lines, block_id, domain = args
        start_time = time.time()
        results = []
        
        # print(f"Block {block_id}: Starting to process {len(block_lines)} lines")
        seen_selectors = []
        
        for line in block_lines:
            selector = line.strip()
            if selector not in seen_selectors:
                seen_selectors.append(selector)
                try:
                    value = resolve_qname(domain, selector)
                    if value:
                        # self._add_to_database(domain, selector)
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            executor.submit(self._add_to_database, domain, selector)
                        if not http and self.session_id in active_sessions:
                            print(f"Found valid selector: {selector}")
                            active_sessions[self.session_id].append({"domain": domain, "selector": selector, "value": value })
                            self._emit_results_background()
                        results.append({"domain": domain, "selector": selector, "value": value })
                except Exception as e:
                    print(f"Error resolving {selector}: {e}")
        
        time_taken = time.time() - start_time
        # print(f"Block {block_id}: Completed in {time_taken:.2f} seconds ({len(results)} valid)")
        return results

    def _emit_results_background(self):
        if self.session_id not in active_sessions:
            return
        # while True: 
        if self.session_id in active_sessions:
            results = active_sessions[self.session_id]
            if len(results) > 0:
                selectorResult = results.pop(0)                
                socketio.emit("bruteDomainResponse", selectorResult, room=self.session_id)
                time.sleep(0.1)
            # else:
                # break
                
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
        
        if not http:
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
        
        if verbose:
            print(f"Split into {len(blocks)} blocks")
            
        block_args = [(block, idx, domain) for idx, block in enumerate(blocks)]
        valid_selectors = []
        
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
                    if len(valid_selectors) == 0 :
                        if self.session_id in active_sessions:
                            # socketio.disconnect(session_id)
                            disconnect(self.session_id)
                            del active_clients[session_id]
                            print(f"Disconnected client with session ID: {session_id}")
                    
                    completed += 1
                    if verbose:
                        print(f"Progress: {completed}/{len(blocks)} blocks completed")
                except Exception as e:
                    print(f"Block processing error: {e}")
        
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
    return session_id

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    if session_id in active_sessions:
        del active_sessions[session_id]
    print(f"Client disconnected: {session_id}")

@socketio.on('bruteDomain')
def handle_brute_domain_ws(data):
    session_id = request.sid
    domain = data.get('domain')
    if not domain:
        socketio.emit('error', {'message': 'Domain parameter is required'}, room=session_id)
        return
    print(f"Received domain via WebSocket for session {session_id}: {domain}")
    
    resolver = DKIMResolver(block_size=100, session_id=session_id)
    resolver.find_valid_selectors(
        domain=domain,
        selectors="dkim_selectors.txt",
        verbose=False,
        http=False,
    )

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)