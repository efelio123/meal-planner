"""Disposable gate fixture: loopback-only listener, no family API/database/Clerk access."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import argparse
import json
import secrets
from urllib.parse import urlsplit

state = {"secret": None, "acknowledged": set()}

class Handler(BaseHTTPRequestHandler):
    prefix = ""
    def log_message(self, *_): pass
    def route(self):
        path = urlsplit(self.path).path
        return path[len(self.prefix):] if self.prefix and path.startswith(self.prefix + "/") else path
    def respond(self, result):
        data = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.route() != "/health": self.send_error(404); return
        self.respond({"fixture": "native-widget-probe", "acknowledged_count": len(state["acknowledged"])})
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192: self.send_error(400); return
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict): self.send_error(400); return
        except (ValueError, TypeError): self.send_error(400); return
        if self.route() == "/seed":
            if not isinstance(body.get("secret"), str) or len(body["secret"]) < 32: self.send_error(400); return
            state["secret"] = body["secret"]
            state["acknowledged"].clear()
            result = {"seeded": True}
        elif self.route() == "/check":
            expected = "Widget " + (state["secret"] or "")
            if not state["secret"] or not secrets.compare_digest(self.headers.get("Authorization", ""), expected): self.send_error(401); return
            if not isinstance(body.get("id"), str) or body.get("itemID") not in ("sample", "fictional-item"): self.send_error(400); return
            state["acknowledged"].add(body["id"])
            result = {"id": body["id"], "confirmed": True}
        else: self.send_error(404); return
        self.respond(result)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefix", default="")
    args = parser.parse_args()
    if args.prefix and (not args.prefix.startswith("/_widget-probe-") or "/" in args.prefix[1:]):
        parser.error("Only an isolated /_widget-probe-* mount is allowed")
    Handler.prefix = args.prefix
    HTTPServer(("127.0.0.1", 43817), Handler).serve_forever()
