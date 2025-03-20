# visual.py

import json
from multiprocessing.connection import Listener
from PyQt5.QtWidgets import QApplication, QMainWindow, QTextEdit
from PyQt5.QtCore import QTimer
import sys

class JSONWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LLaVA Object Info")
        self.setGeometry(100, 100, 600, 400)

        self.text_area = QTextEdit(self)
        self.text_area.setReadOnly(True)
        self.setCentralWidget(self.text_area)

    def update_json(self, json_data):
        pretty_json = json.dumps(json_data, indent=4)
        self.text_area.setPlainText(pretty_json)

def start_json_window_server():
    address = ('localhost', 6700)
    listener = Listener(address, authkey=b'secret')

    app = QApplication(sys.argv)
    window = JSONWindow()
    window.show()

    def wait_for_new_connection():
        try:
            conn = listener.accept()
            try:
                while True:
                    json_data = conn.recv()
                    if json_data == 'close':
                        conn.close()
                        app.quit()
                        return
                    window.update_json(json_data)
            except EOFError:
                pass
            except Exception as e:
                print("Error receiving data:", e)
            finally:
                conn.close()
        except Exception as e:
            print("Error accepting connection:", e)

    # Poll for new connection every 500ms
    timer = QTimer()
    timer.timeout.connect(wait_for_new_connection)
    timer.start(500)

    app.exec_()

if __name__ == "__main__":
    start_json_window_server()