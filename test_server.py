import requests
import base64
import os

# The URL of the live server
SERVER_URL = 'https://alttextserver.symm.app/generate-alt-text'

# A small, 1x1 black pixel JPEG image as a base64 string
base64_image = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAf/Z'

def test_alt_text_server():
    print(f"Testing alt text server at: {SERVER_URL}")

    try:
        request_body = {
            'mimeType': 'image/jpeg',
            'base64Data': base64_image,
        }

        print('Sending request to server...')
        response = requests.post(SERVER_URL, json=request_body, headers={
            'Content-Type': 'application/json',
            'Origin': 'https://alttext.symm.app'  # A valid origin
        })

        print(f"Response Status: {response.status_code}")
        response_data = response.json()

        if not response.ok:
            print('Test Failed: Server returned an error.')
            print(f'Response: {response_data}')
            exit(1)

        if response_data.get('altText') and len(response_data['altText']) > 0:
            print('Test Passed: Server returned alt text!')
            print(f"Generated Alt Text: {response_data['altText']}")
        else:
            print('Test Failed: Server did not return alt text.')
            print(f'Response: {response_data}')
            exit(1)

    except Exception as e:
        print('Test Failed: An error occurred during the test.')
        print(e)
        exit(1)

if __name__ == "__main__":
    test_alt_text_server() 