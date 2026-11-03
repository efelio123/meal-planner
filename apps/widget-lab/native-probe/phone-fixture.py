"""Manage only the private, fictional widget fixture; never replace existing Serve routes."""
import argparse
import copy
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

root = Path(__file__).resolve().parent
cli = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
state_file = root / "phone-fixture-state.json"
proxy = "http://127.0.0.1:43817"

def config():
    return json.loads(subprocess.check_output([cli, "serve", "status", "--json"]))

def private_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as out: json.dump(value, out)

def read_health(url):
    with urllib.request.urlopen(url, timeout=10) as response: return json.load(response)

def remove_route(state):
    current = config()
    handlers = current.get("Web", {}).get(state["host"], {}).get("Handlers", {})
    for mount in (state["mount"],state["mount"]+"/"):
        handler = handlers.get(mount)
        if handler is None: continue
        if handler != {"Proxy": proxy}: raise RuntimeError("Fixture route changed; refusing to remove another target")
        subprocess.run([cli, "serve", "--bg", "--https=443", "--set-path="+mount, "off"], check=True, stdout=subprocess.DEVNULL)

def stop_process(state):
    pid = state["pid"]
    cmd = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
    if str(root / "fixture_server.py") in cmd and state["mount"] in cmd:
        os.kill(pid, signal.SIGTERM)

def start():
    if state_file.exists(): raise RuntimeError("An owned fixture state already exists; inspect status or stop it first")
    with socket.socket() as check: check.bind(("127.0.0.1",43817))
    before = config()
    hosts = [host for host, value in before.get("Web",{}).items() if host.endswith(":443") and "/" in value.get("Handlers",{})]
    if len(hosts) != 1 or before.get("TCP",{}).get("443",{}).get("HTTPS") is not True:
        raise RuntimeError("Expected one existing private HTTPS root; refusing to reconfigure")
    host = hosts[0]
    if not host.endswith(".ts.net:443"): raise RuntimeError("Expected the existing private Tailscale hostname")
    if read_health("http://127.0.0.1:8000/v1/health").get("status") != "ok": raise RuntimeError("Existing API health failed before setup")
    stamp = str(int(time.time()))
    private_json(root / ("serve-before-widget-fixture-"+stamp+".json"), before)
    mount = "/_widget-probe-"+uuid.uuid4().hex[:12]
    origin = "https://"+host.removesuffix(":443")+mount+"/"
    process = subprocess.Popen([sys.executable,str(root/"fixture_server.py"),"--prefix",mount], cwd=root, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    state = {"pid":process.pid,"host":host,"mount":mount,"origin":origin}
    try:
        for _ in range(50):
            if process.poll() is not None: raise RuntimeError("Disposable fixture failed to start")
            try:
                if read_health(proxy+"/health").get("fixture") == "native-widget-probe": break
            except OSError: time.sleep(0.1)
        else: raise RuntimeError("Disposable fixture did not become ready")
        subprocess.run([cli,"serve","--bg","--https=443","--set-path="+mount,"--yes",proxy], check=True, stdout=subprocess.DEVNULL)
        after = config()
        handlers=after["Web"][host]["Handlers"]
        added=[key for key in (mount,mount+"/") if handlers.get(key)=={"Proxy":proxy}]
        if len(added)!=1: raise RuntimeError("Fixture route was not created as expected")
        unchanged = copy.deepcopy(after)
        del unchanged["Web"][host]["Handlers"][added[0]]
        if unchanged != before: raise RuntimeError("Unexpected Serve configuration change; refusing to continue")
        if read_health(origin+"health").get("fixture") != "native-widget-probe": raise RuntimeError("Private HTTPS fixture health failed")
        if read_health("http://127.0.0.1:8000/v1/health").get("status") != "ok": raise RuntimeError("Existing API health failed after setup")
        import plistlib
        for name in ("NativeWidgetProbe", "ProbeWidget", "ProbeTests"):
            path = root/(name+".plist")
            with path.open("rb") as source: data=plistlib.load(source)
            data["ProbeFixtureOrigin"] = origin
            with path.open("wb") as destination: plistlib.dump(data,destination)
            path.chmod(0o600)
        private_json(state_file,state)
        print("Private fixture ready; original HTTPS root and API health preserved.")
        print("origin:",origin)
    except BaseException:
        try: remove_route(state)
        finally:
            if process.poll() is None: process.terminate()
        raise

def main():
    if not root.name.startswith("meal-planner-widget-probe-"): raise RuntimeError("Run only from an isolated Mac probe directory")
    parser=argparse.ArgumentParser()
    parser.add_argument("action",choices=("start","status","stop"))
    action=parser.parse_args().action
    if action=="start": start(); return
    state=json.loads(state_file.read_text())
    if action=="status":
        print(json.dumps(read_health(state["origin"]+"health")))
    else:
        remove_route(state)
        stop_process(state)
        state_file.unlink()
        print("Only the owned fixture route/process removed; existing routes retained.")

if __name__ == "__main__": main()
