import http.server
import socketserver
import ssl
import os
import asyncio
import websockets
import threading
import json


from ultralytics import YOLO
from mss import mss
import numpy as np
import cv2
from PIL import Image
import pyautogui
import math

# I used ChatGPT for the web server stuff :)

project_directory = os.path.dirname(os.path.abspath(__file__))


def get_path(subpath):
    return os.path.join(project_directory, subpath)


# server settings
bind_address = "0.0.0.0"
port_http = 8080
port_wss = 8443

static_files_directory = get_path("public/")
ssl_certfile = get_path("sec/certificate.crt")
ssl_keyfile = get_path("sec/private_key.key")


websocket_clients = set()


async def websocket_handler(websocket_client):
    if websocket_client not in websocket_clients:
        print("new websocket client")
        websocket_clients.add(websocket_client)
    async for message in websocket_client:
        message_object: dict = json.loads(message)
        print(f"Received message: {message_object}")
        message_type = message_object.get("type", "")
        match message_type:
            case "connection":
                break
            case _:
                print(f'uncaught message type "{message_type}"')


async def start_websocket_server():
    # Create SSL context for WebSocket server
    ssl_wss_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_wss_context.load_cert_chain(ssl_certfile, keyfile=ssl_keyfile)

    # Start the secure WebSocket server
    start_server = await websockets.serve(websocket_handler, bind_address, port_wss, ssl=ssl_wss_context)
    print(
        f"Secure WebSocket server running at wss://{bind_address}:{port_wss}/")

    await start_server.wait_closed()


def setup_websocket_server():
    asyncio.set_event_loop(asyncio.new_event_loop())
    asyncio.get_event_loop().run_until_complete(start_websocket_server())


def setup_https_server():
    # Create a TCP socket server for HTTPS
    httpd = socketserver.TCPServer(
        (bind_address, port_http), http.server.SimpleHTTPRequestHandler)

    # Wrap the HTTPS server with SSL/TLS context
    httpd.socket = ssl.wrap_socket(
        httpd.socket, certfile=ssl_certfile, keyfile=ssl_keyfile, server_side=True)

    print(f"HTTPS server running at https://{bind_address}:{port_http}/")

    # Set the current directory to the static files directory
    os.chdir(static_files_directory)

    # Start the HTTPS server
    httpd.serve_forever()


# yolo settings
monitor = {'top': 0, 'left': 0, 'width': 640, 'height': 360}
pixel_scalar = 2
crop_square = True


async def setup_yolo():
    size = pyautogui.size()
    monitor = {
        "top": 0,
        "left": 0,
        "width": size.width,
        "height": size.height
    }
    if crop_square:
        monitor["width"] = size.height
        monitor["left"] = math.floor((size.width - size.height)/2)
    print(monitor)
    model = YOLO("yolov8n.pt")
    with mss() as sct:
        try:
            while True:
                screenshot = sct.grab(monitor)
                img = Image.frombytes(
                    'RGB', (monitor["width"]*pixel_scalar, monitor["height"]*pixel_scalar), screenshot.rgb)
                screenshot_array = np.array(img)
                screen = cv2.cvtColor(screenshot_array, cv2.COLOR_RGB2BGR)
                results = model.track(
                    screen, stream=True, persist=True, verbose=False, show=True)
                box_messages = []
                for result in results:
                    boxes = result.boxes  # Boxes object for bbox outputs
                    for box in boxes:
                        if box.id is not None:
                            box_message = {
                                "id": box.id.tolist()[0],
                                "cls": box.cls.tolist()[0],
                                "conf": box.conf.tolist()[0],
                                "xywhn": box.xywhn.tolist()[0]
                            }
                            # print(box_message)
                            box_messages.append(box_message)

                if len(box_messages) > 0:
                    message = {
                        "type": "results",
                        "results": box_messages
                    }
                    message_json = json.dumps(message)

                    websockets_to_remove = set()
                    for websocket_client in websocket_clients:
                        try:
                            await websocket_client.send(message_json)
                        except websockets.exceptions.ConnectionClosed:
                            print("lost websocket client")
                            websockets_to_remove.add(websocket_client)

                    for websocket_client in websockets_to_remove:
                        websocket_clients.remove(websocket_client)
        except KeyboardInterrupt:
            pass


def main():

    # Start HTTPS server in a new thread
    https_server_thread = threading.Thread(target=setup_https_server)
    https_server_thread.start()

    # Start WebSocket server in a new thread
    websocket_thread = threading.Thread(target=setup_websocket_server)
    websocket_thread.start()

    asyncio.run(setup_yolo())

    # Wait for the WebSocket server thread to finish (which will be never unless stopped manually)
    websocket_thread.join()
    https_server_thread.join()


if __name__ == "__main__":
    main()
