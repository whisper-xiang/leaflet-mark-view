#!/usr/bin/env python3
"""Leaflet Mark View 局域网分享的本机组件。

Chrome 通过标准输入输出收发消息。组件在 0.0.0.0 上提供当前文档，
同一 Wi-Fi 的浏览器凭带口令的地址读取。标准输出只能写消息帧。
"""
import json
import re
import socket
import struct
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN_RE = re.compile(r"^[a-f0-9]{32}$")
MAX_PAGE = 12 * 1024 * 1024
NOT_FOUND = (
    "<!doctype html><meta charset=\"utf-8\"><title>无法打开</title>"
    "<p>这个分享链接不正确，或分享已经关闭。</p>"
)
PREPARING = (
    "<!doctype html><meta charset=\"utf-8\"><title>Leaflet</title>"
    "<p>正在准备文档…</p>"
)


class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.token = ""
        self.html = PREPARING.encode("utf-8")
        self.seq = 0
        self.pending = {}
        self.latest_seq = 0
        self.server = None


state = State()


class ShareServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def is_private_ipv4(ip):
    try:
        parts = [int(piece) for piece in ip.split(".")]
    except ValueError:
        return False
    if len(parts) != 4 or any(part < 0 or part > 255 for part in parts):
        return False
    first, second = parts[0], parts[1]
    if first == 10:
        return True
    if first == 192 and second == 168:
        return True
    if first == 172 and 16 <= second <= 31:
        return True
    return False


def private_ipv4s():
    found = []

    def add(ip):
        if is_private_ipv4(ip) and ip not in found:
            found.append(ip)

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("192.0.2.1", 9))
        add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except OSError:
        pass
    return found


def local_host_name():
    if sys.platform != "darwin":
        return ""
    try:
        import subprocess
        name = subprocess.check_output(
            ["scutil", "--get", "LocalHostName"],
            text=True,
            timeout=2,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return ""
    if re.fullmatch(r"[A-Za-z0-9-]+", name or ""):
        return name + ".local"
    return ""


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    size = struct.unpack("<I", raw)[0]
    if size > 1024 * 1024:
        return None
    data = sys.stdin.buffer.read(size)
    if len(data) < size:
        return None
    return json.loads(data.decode("utf-8"))


def write_message(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


class ShareHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self._reply(True)

    def do_HEAD(self):
        self._reply(False)

    def _reply(self, include_body):
        path = self.path.split("?", 1)[0]
        with state.lock:
            token = state.token
            body = state.html
            seq = state.seq
        allowed = "/s/" + token if token else ""
        if not allowed or path not in (allowed, allowed + "/"):
            data = NOT_FOUND.encode("utf-8")
            self._send(404, data, 0, include_body)
            return
        self._send(200, body, seq, include_body)

    def _send(self, code, data, seq, include_body):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-LMV-Seq", str(seq))
        self.send_header("Connection", "close")
        self.end_headers()
        if include_body:
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        return


def ensure_server(preferred, host="0.0.0.0"):
    if state.server is not None:
        return state.server.server_address[1]
    last = "端口被占用"
    for port in range(int(preferred), int(preferred) + 30):
        try:
            httpd = ShareServer((host, port), ShareHandler)
        except OSError as exc:
            last = str(exc)
            continue
        threading.Thread(
            target=httpd.serve_forever,
            name="lmv-lan",
            daemon=True,
        ).start()
        state.server = httpd
        return httpd.server_address[1]
    raise RuntimeError("无法在局域网监听：" + last)


def stop_server():
    httpd = state.server
    state.server = None
    if httpd is not None:
        httpd.shutdown()
        httpd.server_close()
    with state.lock:
        state.token = ""
        state.html = PREPARING.encode("utf-8")
        state.seq = 0


def store_page(msg):
    try:
        seq = int(msg.get("seq"))
        parts = int(msg.get("parts"))
        part = int(msg.get("part"))
    except (TypeError, ValueError):
        return "分享内容无效"
    chunk = msg.get("chunk")
    if parts < 1 or parts > 200 or part < 0 or part >= parts or not isinstance(chunk, str):
        return "分享内容无效"
    if seq <= state.latest_seq:
        return None
    bucket = state.pending.get(seq)
    if bucket is None or bucket["parts"] != parts:
        bucket = {"parts": parts, "chunks": {}}
        state.pending[seq] = bucket
    bucket["chunks"][part] = chunk
    if len(bucket["chunks"]) != parts:
        return None
    html = "".join(bucket["chunks"][index] for index in range(parts))
    data = html.encode("utf-8")
    state.pending.clear()
    if len(data) > MAX_PAGE:
        return "文档太大，无法分享"
    state.latest_seq = seq
    with state.lock:
        state.html = data
        state.seq = seq
    return "done"


def handle(msg):
    kind = msg.get("type")
    if kind == "start":
        token = str(msg.get("token") or "")
        if not TOKEN_RE.fullmatch(token):
            write_message({"ok": False, "error": "无效的分享口令"})
            return
        try:
            port = int(msg.get("port") or 47821)
        except (TypeError, ValueError):
            port = 47821
        if port < 1 or port > 65535:
            port = 47821
        actual = ensure_server(port)
        with state.lock:
            state.token = token
            state.html = PREPARING.encode("utf-8")
            state.seq = 0
        state.pending.clear()
        state.latest_seq = 0
        hosts = []
        name = local_host_name()
        if name:
            hosts.append(name)
        write_message({
            "ok": True,
            "type": "started",
            "port": actual,
            "ips": private_ipv4s(),
            "hosts": hosts,
        })
        return
    if kind == "page":
        if not state.token:
            write_message({"ok": False, "error": "分享尚未开始"})
            return
        result = store_page(msg)
        if result == "done":
            write_message({"ok": True, "type": "page", "seq": int(msg.get("seq"))})
            return
        if result:
            write_message({"ok": False, "error": result})
        return
    if kind == "stop":
        stop_server()
        write_message({"ok": True, "type": "stopped"})
        return
    write_message({"ok": False, "error": "无法识别的指令"})


def serve_native():
    try:
        while True:
            msg = read_message()
            if msg is None:
                return
            try:
                handle(msg)
            except Exception as exc:
                write_message({"ok": False, "error": str(exc)})
    finally:
        stop_server()


def self_test():
    def check(cond, message):
        if not cond:
            sys.stderr.write(message + "\n")
            raise SystemExit(1)

    check(is_private_ipv4("192.168.1.8"), "192.168 should be private")
    check(is_private_ipv4("10.1.2.3"), "10/8 should be private")
    check(is_private_ipv4("172.16.0.1") and not is_private_ipv4("172.32.0.1"), "172.16/12")
    check(not is_private_ipv4("8.8.8.8") and not is_private_ipv4("127.0.0.1"), "public and loopback")

    error = store_page({"seq": 1, "parts": 2, "part": 0, "chunk": "<p>甲"})
    check(error is None and state.seq == 0, "partial page should wait")
    error = store_page({"seq": 1, "parts": 2, "part": 1, "chunk": "乙</p>"})
    check(error == "done" and state.html == "<p>甲乙</p>".encode("utf-8") and state.seq == 1, "page join")
    store_page({"seq": 1, "parts": 1, "part": 0, "chunk": "旧"})
    check(state.html == "<p>甲乙</p>".encode("utf-8"), "older seq must not replace the page")

    with state.lock:
        state.token = "a" * 32
        state.html = "<p>可阅读</p>".encode("utf-8")
        state.seq = 7
    import urllib.error
    import urllib.request
    port = ensure_server(0, "127.0.0.1")
    try:
        good = urllib.request.urlopen("http://127.0.0.1:%d/s/%s" % (port, "a" * 32), timeout=3)
        check(good.status == 200 and "可阅读" in good.read().decode("utf-8"), "secret path")
        check(good.headers.get("X-LMV-Seq") == "7", "seq header")
        check(good.headers.get("Referrer-Policy") == "no-referrer", "referrer")
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=3)
            check(False, "root should fail")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8")
            check(exc.code == 404 and "a" * 32 not in body, "404 must not leak the token")
    finally:
        stop_server()
    print("ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        serve_native()
