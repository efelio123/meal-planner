"""Loopback-only disposable gate fixture. No database, household or Clerk access."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import secrets
state = {"secret": None, "acknowledged": set()}
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_POST(self):
        try: body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        except (ValueError, TypeError): self.send_error(400); return
        if self.path == "/seed":
            if not isinstance(body.get("secret"), str) or len(body["secret"]) < 32: self.send_error(400); return
            state["secret"] = body["secret"]; state["acknowledged"].clear(); result = {"seeded": True}
        elif self.path == "/check":
            expected = "Widget " + (state["secret"] or "")
            if not state["secret"] or not secrets.compare_digest(self.headers.get("Authorization", ""), expected): self.send_error(401); return
            state["acknowledged"].add(body["id"]); result = {"id": body["id"], "confirmed": True}
        else: self.send_error(404); return
        data=json.dumps(result).encode(); self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
if __name__ == "__main__": HTTPServer(("127.0.0.1",43817), Handler).serve_forever()
