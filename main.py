import http.server
import socketserver
import ssl
import os
import asyncio
import websockets
import threading
import json
from time import sleep

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

camera_position = None
camera_rotation = None

screenshots = []
screenshot_positions = []
screenshot_rotations = []


# ChatGPT
def difference_lists(list1, list2, abs_difference=False):
    diffs = [abs(a - b) if abs_difference else a - b for a, b in zip(list1, list2)]
    return diffs


rotation_thresholds = [0.1, 0.1]


def is_rotation_difference_within_thresholds(rotation):
    return rotation[0] < rotation_thresholds[0] and rotation[1] < rotation_thresholds[1]


def is_rotation_valid(rotation1, rotation2):
    rotation_difference = difference_lists(rotation1, rotation2, True)
    return is_rotation_difference_within_thresholds(rotation_difference)


distance_threshold = 0.1
distance_threshold_squared = distance_threshold**2


def get_position_difference(position, origin):
    return difference_lists(position, origin)


def get_position_squared_length(position, origin):
    diff = get_position_difference(position, origin)
    squared_length = 0
    for n in diff:
        squared_length += n**2
    return squared_length


def find_closest_screenshot_index(position: [float], rotation: [float]) -> int:
    closest_screenshot_index = -1
    number_of_screenshots = len(screenshots)
    lowest_length = distance_threshold
    for index in range(number_of_screenshots):
        screenshot_position = screenshot_positions[index]
        squared_distance = get_position_squared_length(screenshot_position, position)
        if squared_distance < lowest_length:
            screenshot_rotation = screenshot_rotations[index]
            rotation_is_valid = is_rotation_valid(rotation, screenshot_rotation)
            if rotation_is_valid:
                lowest_length = squared_distance
                closest_screenshot_index = index
    return closest_screenshot_index


async def websocket_handler(websocket_client):
    if websocket_client not in websocket_clients:
        print("new websocket client")
        websocket_clients.add(websocket_client)
    async for message in websocket_client:
        message_object: dict = json.loads(message)
        # print(f"Received message: {message_object}")
        message_type = message_object.get("type", "")
        match message_type:
            case "camera":
                camera_position = message_object["position"]
                camera_rotation = message_object["rotation"]
                print(f"rotation: {camera_rotation}")
                print(f"position: {camera_position}")
            case "screenshot":
                # find picture that is closest to the current position/rotation
                pass
            case _:
                print(f'uncaught message type "{message_type}"')


async def start_websocket_server():
    # Create SSL context for WebSocket server
    ssl_wss_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_wss_context.load_cert_chain(ssl_certfile, keyfile=ssl_keyfile)

    # Start the secure WebSocket server
    start_server = await websockets.serve(
        websocket_handler, bind_address, port_wss, ssl=ssl_wss_context
    )
    print(f"Secure WebSocket server running at wss://{bind_address}:{port_wss}/")

    await start_server.wait_closed()


def setup_websocket_server():
    asyncio.set_event_loop(asyncio.new_event_loop())
    asyncio.get_event_loop().run_until_complete(start_websocket_server())


class quietServer(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def setup_https_server():
    # Create a TCP socket server for HTTPS
    httpd = socketserver.TCPServer((bind_address, port_http), quietServer)

    # Wrap the HTTPS server with SSL/TLS context
    httpd.socket = ssl.wrap_socket(
        httpd.socket, certfile=ssl_certfile, keyfile=ssl_keyfile, server_side=True
    )

    print(f"HTTPS server running at https://{bind_address}:{port_http}/")

    # Set the current directory to the static files directory
    os.chdir(static_files_directory)

    # Start the HTTPS server
    httpd.serve_forever()


# yolo settings
monitor = {"top": 0, "left": 0, "width": 640, "height": 360}
pixel_scalar = 2
crop_square = False

imgSize = 512


async def setup_yolo():
    size = pyautogui.size()
    monitor = {"top": 0, "left": 0, "width": size.width, "height": size.height}
    if crop_square:
        monitor["width"] = size.height
        monitor["left"] = math.floor((size.width - size.height) / 2)
    print(monitor)
    model = YOLO("yolov8n.pt")
    with mss() as sct:
        try:
            while True:
                screenshot = sct.grab(monitor)
                img = Image.frombytes(
                    "RGB",
                    (monitor["width"] * pixel_scalar, monitor["height"] * pixel_scalar),
                    screenshot.rgb,
                )
                img = img.resize((imgSize, imgSize))
                screenshot_array = np.array(img)
                screen = cv2.cvtColor(screenshot_array, cv2.COLOR_RGB2BGR)
                results = model.track(
                    screen,
                    stream=True,
                    persist=True,
                    verbose=False,
                    show=True,
                    imgsz=imgSize,
                )
                box_messages = []
                for result in results:
                    boxes = result.boxes  # Boxes object for bbox outputs
                    for box in boxes:
                        if False or box.id is not None:
                            box_message = {
                                "id": box.id.tolist()[0] if box.id is not None else -1,
                                "cls": box.cls.tolist()[0],
                                "conf": box.conf.tolist()[0],
                                "xywhn": box.xywhn.tolist()[0],
                            }
                            box_messages.append(box_message)

                if len(box_messages) > 0:
                    message = {"type": "results", "results": box_messages}
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


screenshot_loop_interval = 1.0


def screenshot_loop():
    return
    with mss() as sct:
        try:
            while True:
                if camera_position is not None:
                    closest_screenshot_index = find_closest_screenshot_index(
                        camera_position, camera_rotation
                    )
                    should_add_screenshot = False
                    if closest_screenshot_index == -1:
                        should_add_screenshot = True
                        pass
                    else:
                        # if there's an existing "close" screenshot - should it be replaced?
                        pass

                    if should_add_screenshot:
                        screenshot = sct.grab(monitor)
                        screenshot_positions.append(camera_position.copy())
                        screenshot_rotations.append(camera_rotation.copy())
                        screenshots.append(screenshot)
                        print(f"new screenshot #{len(screenshots)}")
                sleep(screenshot_loop_interval)
        except KeyboardInterrupt:
            pass


def main():
    # Start HTTPS server in a new thread
    https_server_thread = threading.Thread(target=setup_https_server)
    https_server_thread.start()

    # Start WebSocket server in a new thread
    websocket_thread = threading.Thread(target=setup_websocket_server)
    websocket_thread.start()

    screenshot_loop_thread = threading.Thread(target=screenshot_loop)
    screenshot_loop_thread.start()

    asyncio.run(setup_yolo())

    # Wait for the WebSocket server thread to finish (which will be never unless stopped manually)
    websocket_thread.join()
    https_server_thread.join()
    screenshot_loop_thread.join()


if __name__ == "__main__":
    main()
