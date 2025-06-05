# type: ignore
import functions_framework
import gmpy2
import requests
import json
from typing import Dict, Any


mpz = gmpy2.mpz
gcd = gmpy2.gcd
pow_int = lambda base, exp: base**exp

E = mpz(65537)  # The public exponent

def send_callback(callback_url: str, result_data: Dict[str, Any], max_retries: int = 3):
    """
    Send the result back to the callback URL with retry logic.
    """
    for attempt in range(max_retries):
        try:
            response = requests.post(
                callback_url,
                json=result_data,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code == 200:
                print(f"Successfully sent callback to {callback_url}")
                return True
            else:
                print(f"Callback failed with status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"Callback attempt {attempt + 1} failed: {e}")
            
        if attempt < max_retries - 1:
            print(f"Retrying callback in {2 ** attempt} seconds...")
            import time
            time.sleep(2 ** attempt)
    
    print(f"Failed to send callback after {max_retries} attempts")
    return False

@functions_framework.http
def calculate_gcd(request):
    """
    HTTP Cloud Function to calculate n = gcd(pow_int(s1,e)-em1, pow_int(s2,e)-em2).
    Sends result back to callback URL.
    
    Args:
        request (flask.Request): The request object.
        Expects JSON body with s1, s2, em1, em2, callbackUrl, taskId, and optional metadata.
    
    Returns:
        A success message (result is sent via callback).
    """
    request_json = request.get_json(silent=True)
    
    if not request_json:
        return ("Missing JSON payload.", 400)

    # Extract parameters
    s1_str = request_json.get('s1')
    s2_str = request_json.get('s2')
    em1_str = request_json.get('em1')
    em2_str = request_json.get('em2')
    callback_url = request_json.get('callbackUrl')
    task_id = request_json.get('taskId')
    metadata = request_json.get('metadata', {})

    # Validate required parameters
    if not all([s1_str, s2_str, em1_str, em2_str]):
        error_data = {
            'success': False,
            'error': 'Missing one or more required parameters: s1, s2, em1, em2',
            'taskId': task_id,
            'metadata': metadata
        }
        if callback_url:
            send_callback(callback_url, error_data)
        return (error_data['error'], 400)

    if not callback_url:
        return ("Missing callbackUrl parameter.", 400)

    try:
        # Convert string inputs to gmpy2.mpz integers
        s1 = mpz(s1_str)
        s2 = mpz(s2_str)
        em1 = mpz(em1_str)
        em2 = mpz(em2_str)
        
    except ValueError as e:
        error_data = {
            'success': False,
            'error': f"Invalid input: one or more parameters are not valid integers. Error: {e}",
            'taskId': task_id,
            'metadata': metadata
        }
        send_callback(callback_url, error_data)
        return (error_data['error'], 400)

    try:
        # Perform the calculation
        print(f"Starting calculation for task {task_id}")
        
        term1 = pow_int(s1, E) - em1
        term2 = pow_int(s2, E) - em2
        n = gcd(term1, term2)

        # Remove small prime factors for cleanup
        for p_val in [2, 3, 5, 17, 257, 65537]:
            p = mpz(p_val)
            while n % p == 0 and n > p:
                n //= p

        print(f"Calculation completed for task {task_id}")

        # Prepare success result
        result_data = {
            'success': True,
            'result': str(n),
            'taskId': task_id,
            'metadata': metadata,
            'timestamp': request_json.get('timestamp') or None
        }

        # Send result to callback URL
        callback_success = send_callback(callback_url, result_data)
        
        if callback_success:
            return ("Calculation completed and result sent to callback URL.", 200)
        else:
            return ("Calculation completed but failed to send callback.", 500)
            
    except Exception as e:
        print(f"Calculation error for task {task_id}: {e}")
        
        error_data = {
            'success': False,
            'error': f"Calculation failed: {str(e)}",
            'taskId': task_id,
            'metadata': metadata
        }
        
        send_callback(callback_url, error_data)
        return (f"Calculation failed: {str(e)}", 500)