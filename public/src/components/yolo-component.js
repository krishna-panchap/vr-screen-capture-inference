AFRAME.registerSystem("yolo", {
  schema: {
    port: { type: "string", default: "8443" },
    useTestImage: { type: "boolean", default: true },
    showIntersections: { type: "boolean", default: false },
    showBoxes: { type: "boolean", default: false },
    leftThumbstickScalar: { type: "number", default: 0.02 },
    rightThumbstickScalar: { type: "number", default: 0.02 },
    cameraInterval: { type: "number", default: 0 },
    useBox3: { type: "boolean", default: true },
    showPlanes: { type: "boolean", default: true },
    showOverlay: { type: "boolean", default: true },
  },

  init: function () {
    window.yoloSystem = this;
    this.isOculusBrowser = AFRAME.utils.device.isOculusBrowser();
    this.showResultsInOverlay = this.data.showOverlay && !this.isOculusBrowser;
    this.entities = [];

    this.results = {}; // {id: {cls, clsString, overlayElement, obb, _obb, q, box}}

    this.sceneEl.addEventListener("loaded", () => {
      this.imageEntity = document.querySelector(
        `.image.${this.isOculusBrowser ? "hand" : "camera"}`
      );
      document.querySelectorAll(".image").forEach((imageEntity) => {
        if (imageEntity != this.imageEntity) {
          imageEntity.remove();
        }
      });
      this.imageOptions = {
        image: null,
        center: { x: 0.5, y: 0.5 },
        scale: 1,
      };
      this.canvas = document.querySelector("#canvas");
      this.context = this.canvas.getContext("2d");
      this.controllers = {
        left: document.querySelector("#leftHandControls"),
        right: document.querySelector("#rightHandControls"),
      };
      this.controllers.left.addEventListener(
        "thumbstickmoved",
        this.onLeftThumbstickMoved.bind(this)
      );
      this.controllers.right.addEventListener(
        "thumbstickmoved",
        this.onRightThumbstickMoved.bind(this)
      );
      this.controllers.left.addEventListener(
        "xbuttondown",
        this.onXButtonDown.bind(this)
      );
      this.controllers.left.addEventListener(
        "ybuttondown",
        this.onYButtonDown.bind(this)
      );
      this.controllers.left.addEventListener(
        "triggerdown",
        this.onLeftTriggerDown.bind(this)
      );
      if (this.data.useTestImage) {
        this.imageOptions.image = testImage;
        this.drawImage();
      }

      this.snapshotMarker = document.querySelector("#snapshotMarker");
      this.snapshotOptions = {
        distance: 0,
        position: new THREE.Vector3(),
      };

      if (this.data.cameraInterval > 0) {
        this.intervalId = window.setInterval(
          () => this.sendCameraInformation(),
          this.data.cameraInterval
        );
      }
    });

    this.overlay = document.getElementById("overlay");
    this.overlayElements = new Set();
    this.unusedOverlayElements = new Set();

    this.boxEntities = new Set();
    this.unusedBoxEntities = new Set();

    this.planeEntities = new Set();
    this.unusedPlaneEntities = new Set();

    // https://github.com/mayognaise/aframe-mouse-cursor-component/blob/master/index.js#L20C3-L21C36
    this.raycaster = new THREE.Raycaster();
    this.camera = document.getElementById("camera");
    this.cameraPlane = this.camera.querySelector(".intersect");
    this.cameraPlaneQuaternion = new THREE.Quaternion();
    this.intersectionMarkers = [];

    this.classes = {
      0: "person",
      1: "bicycle",
      2: "car",
      3: "motorcycle",
      4: "airplane",
      5: "bus",
      6: "train",
      7: "truck",
      8: "boat",
      9: "traffic light",
      10: "fire hydrant",
      11: "stop sign",
      12: "parking meter",
      13: "bench",
      14: "bird",
      15: "cat",
      16: "dog",
      17: "horse",
      18: "sheep",
      19: "cow",
      20: "elephant",
      21: "bear",
      22: "zebra",
      23: "giraffe",
      24: "backpack",
      25: "umbrella",
      26: "handbag",
      27: "tie",
      28: "suitcase",
      29: "frisbee",
      30: "skis",
      31: "snowboard",
      32: "sports ball",
      33: "kite",
      34: "baseball bat",
      35: "baseball glove",
      36: "skateboard",
      37: "surfboard",
      38: "tennis racket",
      39: "bottle",
      40: "wine glass",
      41: "cup",
      42: "fork",
      43: "knife",
      44: "spoon",
      45: "bowl",
      46: "banana",
      47: "apple",
      48: "sandwich",
      49: "orange",
      50: "broccoli",
      51: "carrot",
      52: "hot dog",
      53: "pizza",
      54: "donut",
      55: "cake",
      56: "chair",
      57: "couch",
      58: "potted plant",
      59: "bed",
      60: "dining table",
      61: "toilet",
      62: "tv",
      63: "laptop",
      64: "mouse",
      65: "remote",
      66: "keyboard",
      67: "cell phone",
      68: "microwave",
      69: "oven",
      70: "toaster",
      71: "sink",
      72: "refrigerator",
      73: "book",
      74: "clock",
      75: "vase",
      76: "scissors",
      77: "teddy bear",
      78: "hair drier",
      79: "toothbrush",
    };

    this.colors = ["red", "blue", "green", "orange", "purple"];

    this.setupWebsocketConnection();
  },

  sendCameraInformation: function () {
    if (this.sendWebsocketMessage) {
      const position = this.camera.object3D.position.clone();
      const rotation = this.camera.object3D.rotation.clone();
      let didCameraChange = false;
      if (!this.previousCameraTransform) {
        didCameraChange = true;
      } else {
        this.diffVector = this.diffVector || new THREE.Vector3();
        this.diffVector.subVectors(
          this.previousCameraTransform.rotation,
          rotation
        );
        didCameraChange = didCameraChange || this.diffVector.length() > 0.01;
        this.diffVector.subVectors(
          this.previousCameraTransform.position,
          position
        );
        didCameraChange = didCameraChange || this.diffVector.length() > 0.01;
      }
      if (didCameraChange) {
        this.previousCameraTransform = { position, rotation };
        const message = {
          type: "camera",
          position: position.toArray().map((value) => Number(value.toFixed(3))),
          rotation: rotation
            .toArray()
            .slice(0, 3)
            .map((value) => Number(value.toFixed(3))),
        };
        this.sendWebsocketMessage(message);
      }
    }
  },

  drawImage: function () {
    const { canvas, context, imageEntity } = this;
    const { image, center, scale } = this.imageOptions;
    if (imageEntity) {
      const imageOffset = {
        left: center.x - 0.5 / scale,
        top: center.y - 0.5 / scale,
      };
      const s = {
        x: imageOffset.left * image.width,
        y: imageOffset.top * image.height,
        width: image.width / scale,
        height: image.height / scale,
      };
      const d = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      };

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        s.x,
        s.y,
        s.width,
        s.height,
        d.x,
        d.y,
        d.width,
        d.height
      );
      imageEntity.getObject3D("mesh").material.map.needsUpdate = true;
    }
  },

  onLeftThumbstickMoved: function (event) {
    let { x, y } = event.detail;
    x *= this.data.leftThumbstickScalar;
    y *= this.data.leftThumbstickScalar;

    let didChange = false;

    if (!this.scaleWithLeftThumbstick) {
      const center = {
        x: this.imageOptions.center.x - x,
        y: this.imageOptions.center.y - y,
      };
      center.x = THREE.MathUtils.clamp(center.x, 0, 1);
      center.y = THREE.MathUtils.clamp(center.y, 0, 1);
      didCenterChange =
        this.imageOptions.center.x != center.x ||
        this.imageOptions.center.y != center.y;
      if (didCenterChange) {
        this.imageOptions.center = center;
        didChange = true;
      }
    } else {
      let scale = this.imageOptions.scale + y;
      scale = THREE.MathUtils.clamp(scale, 0.1, 3);
      didScaleChange = this.imageOptions.scale != scale;
      if (didScaleChange) {
        this.imageOptions.scale = scale;
        didChange = true;
      }
    }
    if (didChange) {
      this.drawImage();
    }
  },
  onRightThumbstickMoved: function (event) {
    let { x, y } = event.detail;
    x *= this.data.rightThumbstickScalar;
    y *= this.data.rightThumbstickScalar;

    let distance = this.snapshotOptions.distance - y;
    distance = THREE.MathUtils.clamp(distance, 0, 10);
    this.snapshotOptions.distance = distance;

    this.snapshotMarker.object3D.position.z = -distance;
    this.snapshotMarker.object3D.visible = distance > 0.2;

    this.snapshotMarker.object3D.getWorldPosition(
      this.snapshotOptions.position
    );

    console.log(this.snapshotOptions.position);
    this.requestSnapshot();
  },
  onXButtonDown: function () {
    this.requestSnapshot();
  },
  onYButtonDown: function () {
    this.toggleMagnifyingGlass();
  },
  onLeftTriggerDown: function () {
    this.scaleWithLeftThumbstick = !this.scaleWithLeftThumbstick;
  },

  toggleMagnifyingGlass: function () {
    if (this.imageEntity) {
      this.imageEntity.object3D.visible = !this.imageEntity.object3D.visible;
    }
  },
  requestSnapshot: async function () {
    if (!this._isRequestingSnapshot) {
      this._isRequestingSnapshot = true;
      // FILL - get request
    }
  },

  setupWebsocketConnection: function () {
    let socket;

    const createSocket = () => {
      socket = window.socket = new WebSocket(
        `wss://${location.hostname}:${this.data.port}`
      );

      socket.addEventListener("open", () => {
        console.log("connection opened");
        this.onWebsocketConnection();
      });
      socket.addEventListener("message", (event) => {
        //console.log("Message from server ", event.data);
        const message = JSON.parse(event.data);
        this.onWebsocketMessage(message);
      });
      socket.addEventListener("close", (event) => {
        console.log("connection closed");
        this.sendWebsocketMessage = null;
        setTimeout(() => createSocket(), 1000);
      });
    };
    createSocket();

    const send = (object) => {
      if (socket.readyState == WebSocket.OPEN) {
        socket.send(JSON.stringify(object));
      }
    };

    this.sendWebsocketMessage = send;
  },

  onWebsocketConnection: function () {},
  onWebsocketMessage: function (message) {
    //console.log("message", message);
    switch (message.type) {
      case "results":
        this.onResults(message.results);
        break;
      default:
        console.log(`uncaught message type "${message.type}`);
        break;
    }
  },

  shiftSet: function (set) {
    for (const value of set) {
      set.delete(value);
      return value;
    }
  },

  randomColor: function () {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  },

  onResults: function (results) {
    if (!this.camera.hasLoaded) {
      return;
    }
    if (this._isParsingResults) {
      return;
    }
    this._isParsingResults = true;

    const windowHeightScalar = window.innerHeight / window.outerHeight;
    if (this.showResultsInOverlay) {
      this.overlayElements.forEach((overlayElement) => {
        overlayElement._shouldRemove = true;
      });
    }
    if (this.data.showBoxes) {
      this.boxEntities.forEach((boxEntity) => {
        boxEntity._shouldRemove = true;
      });
    }
    if (this.data.showPlanes) {
      this.planeEntities.forEach((planeEntity) => {
        planeEntity._shouldRemove = true;
      });
    }
    for (id in this.results) {
      this.results[id]._visible = false;
    }

    if (this.data.showPlanes && results.length > 0) {
      this.cameraPlane.object3D.getWorldQuaternion(this.cameraPlaneQuaternion);
    }

    results.forEach((_result, index) => {
      const { id, cls, conf, xywhn } = _result;
      const [x, y, width, height] = xywhn;
      const clsString = this.classes[cls];

      if (this.isOculusBrowser) {
        // FILL - clamp to the smaller oculus video
      }

      if (!this.results[id]) {
        this.results[id] = {
          id,
          cls,
          clsString,
          visible: true,
          _visible: true,
          isNew: true,
          obb: null,
          // https://mugen87.github.io/yuka/docs/OBB.html
          _obb: new YUKA.OBB(),
          box3: new THREE.Box3(),
          _box3: new THREE.Box3(),
          quaternion: new YUKA.Quaternion(),
          overlayElement: null,
          box: null,
          color: this.randomColor(),
          center: new THREE.Vector3(),
          size: new THREE.Vector3(),
          planeEntity: null,
          planeCenter: new THREE.Vector3(),
          planeDimensions: new THREE.Vector3(1, 1, 1),
        };
      }
      const result = this.results[id];
      result._visible = true;

      const _width = width;
      const _height = height / windowHeightScalar;
      const _y = y * windowHeightScalar;

      if (this.data.showPlanes) {
        let shouldUpdatePlane = false;

        let planeEntity = result.planeEntity;
        if (!planeEntity) {
          planeEntity = this.shiftSet(this.unusedPlaneEntities);
          if (planeEntity) {
            console.log("recycling plane", planeEntity);
            shouldUpdatePlane = true;
          }
        }
        if (!planeEntity) {
          planeEntity = document.createElement("a-plane");
          planeEntity.setAttribute("opacity", "0.3");
          planeEntity.setAttribute("visible", this.data.showPlanes);

          const labelEntity = document.createElement("a-text");
          labelEntity.setAttribute("position", "0 0 0.001");
          labelEntity.setAttribute("align", "center");
          labelEntity.setAttribute("width", "4");
          labelEntity.classList.add("label");
          planeEntity.appendChild(labelEntity);
          console.log("created plane", planeEntity);
          shouldUpdatePlane = true;
          this.sceneEl.appendChild(planeEntity);
        }
        result.planeEntity = planeEntity;
        result.planeEntity._shouldRemove = false;

        if (shouldUpdatePlane) {
          this.planeEntities.add(planeEntity);

          const labelEntity = planeEntity.querySelector(".label");
          labelEntity.setAttribute("value", `${clsString}`);

          planeEntity._id = id;
          planeEntity.id = `plane-${id}-${clsString}`;
          console.log("updating plane", planeEntity);

          planeEntity.setAttribute("color", result.color);
          planeEntity.setAttribute("visible", "true");
        }
      }

      if (this.data.showBoxes) {
        let shouldUpateBox = false;

        let box = result.box;
        if (!box) {
          box = this.shiftSet(this.unusedBoxEntities);
          if (box) {
            //console.log("recycling box", box);
            shouldUpateBox = true;
          }
        }
        if (!box) {
          box = document.createElement("a-box");

          box.setAttribute("scale", "0 0 0");
          box.setAttribute("opacity", "0.2");

          //console.log("created box", box);
          shouldUpateBox = true;
          this.sceneEl.appendChild(box);
        }
        result.box = box;
        result.box._shouldRemove = false;

        if (shouldUpateBox) {
          this.boxEntities.add(box);

          box._id = id;
          box.id = `box-${id}-${clsString}`;

          box.setAttribute("color", result.color);
          box.setAttribute("visible", this.data.showBoxes);
          //console.log("recycled box", box);
        }
      }

      if (this.showResultsInOverlay) {
        let shouldUpdateOverlay = false;
        let overlayElement = result.overlayElement;
        if (!overlayElement) {
          overlayElement = this.shiftSet(this.unusedOverlayElements);
          if (overlayElement) {
            //console.log("recycling", overlayElement);
            shouldUpdateOverlay = true;
          }
        }
        if (!overlayElement) {
          overlayElement = document.createElement("div");
          overlayElement.classList.add("result");
          const label = document.createElement("div");
          label.classList.add("label");
          overlayElement.appendChild(label);
          this.overlay.appendChild(overlayElement);
          //console.log("new overlay element", overlayElement);
          shouldUpdateOverlay = true;
        }
        result.overlayElement = overlayElement;
        overlayElement._shouldRemove = false;

        if (shouldUpdateOverlay) {
          this.overlayElements.add(overlayElement);

          overlayElement._id = id;
          overlayElement.id = `overlay-${id}-${clsString}`;
          overlayElement.style.borderColor = result.color;

          label = overlayElement.querySelector(".label");
          label.style.color = result.color;
          label.innerText = `${id} ${clsString}`;
          overlayElement.style.display = "";
        }

        overlayElement.style.height = `${_height * 100}%`;
        overlayElement.style.width = `${_width * 100}%`;

        overlayElement.style.left = `${(x - _width / 2) * 100}%`;
        overlayElement.style.top = `${(_y - _height / 2) * 100}%`;
      }

      const halfWidth = width / 2;
      const halfHeight = _height / 2;
      const corners = [
        [x - halfWidth, _y - halfHeight],
        [x + halfWidth, _y - halfHeight],
        [x - halfWidth, _y + halfHeight],
        [x + halfWidth, _y + halfHeight],
      ];

      if (this.data.showBoxes) {
        const intersections = corners.map((xy, i) =>
          this.intersect(...xy, index == 0 ? i : -1)
        );
        //console.log("intersections", intersections);

        const points = [];
        intersections.forEach((intersection) => {
          if (intersection) {
            points.push(intersection.point);
          }
        });
        if (points.length >= 4) {
          points.push(this.camera.object3D.position);
          if (this.data.useBox3) {
            if (result.box3.isEmpty()) {
              result.box3.setFromPoints(points);
            } else {
              result._box3.setFromPoints(points);
              if (result.box3.intersectsBox(result._box3)) {
                result.box3.intersect(result._box3);
              } else {
                result.box3.copy(result._box3);
              }
            }
          } else {
            result._obb.fromPoints(points);
            if (!result.obb) {
              result.obb = result._obb.clone();
            } else {
              result.obb.intersectsOBB(result._obb);
            }
            //console.log("obb", result.obb);
          }
          if (result.box.hasLoaded) {
            this.updateResultBox(result);
          } else {
            result.box.addEventListener("loaded", () =>
              this.updateResultBox(result)
            );
          }
        }
      }

      if (this.data.showPlanes && this.cameraPlane?.object3D) {
        const intersections = corners.map((xy, i) =>
          this.intersect(...xy, index == 0 ? i : -1, [
            this.cameraPlane.object3D,
          ])
        );
        //console.log("intersections", intersections);

        const points = [];
        intersections.forEach((intersection) => {
          if (intersection) {
            points.push(intersection.point);
          }
        });

        if (points.length == 4) {
          result.planePoints = points;
          //console.log(result.id, "planePoints", points);
          if (result.planeEntity.hasLoaded) {
            this.updateResultPlane(result);
          } else {
            result.planeEntity.addEventListener("loaded", () => {
              this.updateResultPlane(result);
            });
          }
        }
      }
    });

    for (id in this.results) {
      const result = this.results[id];
      if (result.isNew) {
        //console.log(result.id, "new result", result.clsString);
        delete result.isNew;
        // new object detected
      }
      if (result.visible != result._visible) {
        result.visible = result._visible;
        if (!result.visible) {
          delete result.planeEntity;
          delete result.boxEntity;
          delete result.overlayElement;
        }
        //console.log(result.id, "changed visibility", result.visible);
        // object changed visibility
      }
    }

    if (this.showResultsInOverlay) {
      this.overlayElements.forEach((overlayElement) => {
        if (overlayElement._shouldRemove) {
          this.overlayElements.delete(overlayElement);
          this.unusedOverlayElements.add(overlayElement);
          overlayElement.style.display = "none";
        }
      });
    }

    if (this.data.showBoxes) {
      this.boxEntities.forEach((boxEntity) => {
        if (boxEntity._shouldRemove) {
          this.boxEntities.delete(boxEntity);
          this.unusedBoxEntities.add(boxEntity);
          boxEntity.setAttribute("visible", "false");
          delete boxEntity._shouldRemove;
        }
      });
    }

    if (this.data.showPlanes) {
      planeEntities = Array.from(this.planeEntities);
      planeEntities.forEach((planeEntity) => {
        if (planeEntity._shouldRemove) {
          this.planeEntities.delete(planeEntity);
          this.unusedPlaneEntities.add(planeEntity);
          planeEntity.setAttribute("visible", "false");
          console.log("deleting plane", planeEntity);
          delete planeEntity._shouldRemove;
        }
      });
    }

    this._isParsingResults = false;
  },

  updateResultBox: function (result) {
    const { obb, box, box3, quaternion, id, center, size } = result;
    console.log(id, "visible?", result.visible);

    if (this.data.useBox3) {
      box3.getCenter(center);
      box3.getSize(size);
      console.log(id, "center", center);
      console.log(id, "size", size);
      box.object3D.position.copy(center);
      box.object3D.scale.copy(size);
    } else {
      quaternion.fromMatrix3(obb.rotation);
      {
        // const { x, y, z, w } = quaternion;
        // box.object3D.quaternion.set(x, y, z, w);
        // console.log("quaternion", box.object3D.quaternion);
        const { x, y, z } = quaternion.toEuler({});
        box.object3D.rotation.set(x, y, z);
        console.log(id, "euler", box.object3D.rotation);
      }
      box.object3D.position.copy(obb.center);
      console.log(id, "position", box.object3D.position);
      {
        const { x, y, z } = obb.halfSizes;
        box.object3D.scale.set(x * 2, y * 2, z * 2);
        console.log(id, "scale", box.object3D.scale);
      }
    }
  },

  updateResultPlane: function (result, randomizeZ = true) {
    const { planeEntity, planePoints, planeCenter, planeDimensions } = result;
    planeCenter.set(0, 0, 0);
    planePoints.forEach((point) => {
      planeCenter.add(point);
    });
    planeCenter.divideScalar(4);
    if (randomizeZ) {
      planeCenter.z += Math.random() * 0.0001;
    }
    planeEntity.object3D.position.copy(planeCenter);

    planeDimensions.x = planePoints[0].distanceTo(planePoints[1]);
    planeDimensions.y = planePoints[0].distanceTo(planePoints[2]);

    planeEntity.object3D.scale.copy(planeDimensions);

    planeEntity.object3D.quaternion.copy(this.cameraPlaneQuaternion);
  },

  intersect: function (x, y, intersectionIndex = -1, intersectables) {
    x = (x - 0.5) * 2;
    y = 1 - y;
    y = (y - 0.5) * 2;

    // https://github.com/mayognaise/aframe-mouse-cursor-component/blob/master/index.js#L393
    const camera = this.camera.getObject3D("camera");
    this.raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
    this.raycaster.ray.direction
      .set(x, y, 0.5)
      .unproject(camera)
      .sub(this.raycaster.ray.origin)
      .normalize();

    if (!intersectables) {
      intersectables = Array.from(document.querySelectorAll(".allow-ray")).map(
        (entity) => entity.object3D
      );
    }

    const intersectons = this.raycaster.intersectObjects(intersectables);
    const intersecton = intersectons[0];
    if (intersecton) {
      if (intersectionIndex >= 0 && this.data.showIntersections) {
        let intersectionMarker = this.intersectionMarkers[intersectionIndex];
        if (!intersectionMarker) {
          intersectionMarker = document.createElement("a-sphere");
          intersectionMarker.setAttribute(
            "color",
            this.colors[intersectionIndex]
          );
          intersectionMarker.setAttribute("radius", "0.1");
          this.intersectionMarkers[intersectionIndex] = intersectionMarker;
          this.sceneEl.appendChild(intersectionMarker);
        }
        intersectionMarker.setAttribute(
          "position",
          intersecton.point.toArray().join(" ")
        );
      }
      return intersecton;
    }
  },

  testIntersection: function (corner, width = 1, height = 1) {
    const corners = [
      corner,
      [corner[0] + width, corner[1]],
      [corner[0], corner[1] + height],
      [corner[0] + width, corner[1] + height],
    ];
    if (!this.testPlane) {
      this.testPlane = document.createElement("a-plane");
      this.testPlane.setAttribute("opacity", "0.3");
      this.testPlane.setAttribute("color", "red");
      this.testPlane._options = {
        planePoints: [],
        planeCenter: new THREE.Vector3(),
        planeDimensions: new THREE.Vector3(1, 1, 1),
      };
      this.sceneEl.appendChild(this.testPlane);
    }
    const intersections = corners.map((xy, i) =>
      this.intersect(...xy, -1, [this.cameraPlane.object3D])
    );
    const points = [];
    intersections.forEach((intersection) => {
      if (intersection) {
        points.push(intersection.point);
      }
    });

    if (points.length == 4) {
      this.testPlane._options.planePoints = points;
      this.updateResultPlane(
        {
          planeEntity: this.testPlane,
          ...this.testPlane._options,
        },
        false
      );
    }
  },

  update: function (oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("showBoxes")) {
      this.boxEntities.forEach((boxEntity) => {
        boxEntity.setAttribute("visible", this.data.showBoxes);
      });
    }
  },

  addEntity: function (entity) {
    this.entities.push(entity);
  },
  removeEntity: function (entity) {
    this.entities.splice(this.entities.indexOf(entity), 1);
  },
});

AFRAME.registerComponent("yolo", {
  schema: {},

  init: async function () {
    this.system.addEntity(this.el);
  },
  remove: function () {
    this.system.removeEntity(this);
  },
});
