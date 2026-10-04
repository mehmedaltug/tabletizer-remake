from websockets.asyncio.server import ServerConnection
from pynput.mouse import Controller, Button
import websockets, socket, asyncio
import webview, threading, os, sys

class Api:
    def __init__(self):
        self._window:webview.Window | None = None
        self._disconnect:bool = False
        self._deny_connections:bool = False
    def set_window(self, window:webview.Window | None):
        self._window = window
    def get_ip(self) -> str:
        return get_server_ip()
    def disconnect(self) -> None:
        self._disconnect = True
    def deny(self) -> None:
        self._deny_connections = True
        self.disconnect()
    def allow(self) -> None:
        self._deny_connections = False
        self._disconnect = False

PORT = 7070
MOUSE = Controller()
api = Api()
client = {}

def get_server_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def resource_path(path:str):
    try:
        base = sys._MEIPASS  # pyright: ignore[reportAttributeAccessIssue]
    except Exception:
        base = os.path.abspath(".")
    return os.path.join(base, path)

def mouse_move(x:int, y:int):
    MOUSE.position = (x, y)

def mouse_down(button:str):
    if button == "left":
        MOUSE.press(Button.left)
    elif button == "right":
        MOUSE.press(Button.right)

def mouse_up(button:str):
    if button == "left":
        MOUSE.release(Button.left)
    elif button == "right":
        MOUSE.release(Button.right)
        
def mouse_click(button:str):
    if button == "left":
        MOUSE.click(Button.left, 1)
    elif button == "right":
        MOUSE.click(Button.right, 1)

async def socket_handler(ws:ServerConnection):
    if (len(client) != 0 and client.get(ws.remote_address[0]) == None) or api._deny_connections:
        await ws.send("Can not connect")
        await ws.close(code=1008, reason="busy")
        if api._window and not api._deny_connections:
            api._window.evaluate_js("onMultiDevice()")
        return
        
    ip, port = ws.remote_address;
    if len(client) == 0:
        client[ip] = {"ip": ip, "port": port}
    
    if api._window:
        api._window.evaluate_js(f"onConnect('{ip}')")

    await ws.send("screen,1920,1080")
        
    try:
        async for msg in ws:
            if api._disconnect:
                api._disconnect = False
                break
            print(f"Got: {msg}")
            try:
                split = str(msg).split(",")
                if split[0] == "move":
                    mouse_move(int(split[1]), int(split[2]))
                elif split[0] == "click":
                    mouse_click(split[1])
                elif split[0] == "down":
                    mouse_down(split[1])
                elif split[0] == "up":
                    mouse_up(split[1])
            except: pass
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.clear()
        if api._window:
            api._window.evaluate_js("onConnectionClose()")
        await ws.close(code=1008)

def run_server():
    async def main():
        async with websockets.serve(socket_handler, "0.0.0.0", PORT):
            await asyncio.Future()
    asyncio.run(main())

def main():
    html_path = resource_path(os.path.join('web', 'index.html'))

    window: webview.Window | None = webview.create_window(
        title='Tabletizer Desktop',
        url=html_path,
        js_api=api,
        width=800,
        height=600
    )

    threading.Thread(target=run_server, daemon=True).start()
    api.set_window(window)
    webview.start()

if __name__ == "__main__":
    main()
