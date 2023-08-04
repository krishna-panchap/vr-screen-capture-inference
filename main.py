from ultralytics import YOLO
from mss import mss
import numpy as np
import cv2
from PIL import Image
import pyautogui
import math

monitor = {'top': 0, 'left': 0, 'width': 640, 'height': 360}
pixel_scalar = 2
crop_square = True


def main():
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
                for result in results:
                    boxes = result.boxes  # Boxes object for bbox outputs
                    masks = result.masks  # Masks object for segmentation masks outputs
                    keypoints = result.keypoints  # Keypoints object for pose outputs
                    probs = result.probs  # Probs object for classification outputs
                    for box in boxes:
                        print(box.cls[0])
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
