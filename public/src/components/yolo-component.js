AFRAME.registerSystem("yolo", {
  schema: {
    port: { type: "string", default: "8443" },
  },

  setupWebsocketConnection: function (onMessage, onConnect) {
    // Create WebSocket connection.
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
        setTimeout(() => createSocket(), 1000);
      });
    };
    createSocket();

    const send = (object) => {
      socket.send(JSON.stringify(object));
    };

    this.sendWebsocketMessage = send;
  },

  init: function () {
    window.yoloSystem = this;
    this.entities = [];
    this.setupWebsocketConnection();

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
  },

  onWebsocketConnection: function () {
    //this.sendWebsocketMessage({ type: "connection" });
  },
  onWebsocketMessage: function (message) {
    console.log(message);
    switch (message.type) {
      case "results":
        this.onResults(message.results);
        break;
      default:
        console.log(`uncaught message type "${message.type}`);
        break;
    }
  },

  onResults: function (results) {
    results.forEach((result) => {
      const { id, cls, conf, xywhn } = result;
      const clsString = this.classes[cls];
      console.log(id, clsString, conf, xywhn);
    });
  },

  update: function (oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("key")) {
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
