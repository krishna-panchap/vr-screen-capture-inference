from ultralytics import YOLO


def main():
    model = YOLO("yolov8n.pt")
    try:
        while True:
            results = model.track(
                "screen", stream=True, persist=True, verbose=False, show=True)
            for result in results:
                boxes = result.boxes  # Boxes object for bbox outputs
                masks = result.masks  # Masks object for segmentation masks outputs
                keypoints = result.keypoints  # Keypoints object for pose outputs
                probs = result.probs  # Probs object for classification outputs
                for box in boxes:
                    print(f"#{box.id}: {box.cls}")
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
