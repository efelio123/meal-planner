"""Runs only the isolated native gate. Never installs onto a physical phone."""
import json
from pathlib import Path
import socket
import subprocess
import sys
import time

root = Path(__file__).resolve().parent
assert root.name.startswith("meal-planner-widget-probe-"), "Copy the probe into its isolated Mac directory first"
name = "MealPlannerWidgetGate-" + str(int(time.time()))
device = subprocess.check_output(["xcrun", "simctl", "create", name, "com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro", "com.apple.CoreSimulator.SimRuntime.iOS-27-0"], text=True).strip()
server = None
try:
    with socket.socket() as check:
        check.bind(("127.0.0.1", 43817))
    server = subprocess.Popen([sys.executable, str(root / "fixture_server.py")], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if server.poll() is not None: raise RuntimeError("Disposable loopback fixture failed to start")
        try:
            with socket.create_connection(("127.0.0.1", 43817), timeout=0.1): break
        except OSError: time.sleep(0.1)
    with (root / "simulator-tests.log").open("w") as log:
        result = subprocess.run(["xcodebuild", "-project", "NativeWidgetProbe.xcodeproj", "-scheme", "NativeWidgetProbe", "-configuration", "Debug", "-destination", "id="+device, "-derivedDataPath", "SimulatorTestData", "-resultBundlePath", "ProbeResults.xcresult", "CODE_SIGN_IDENTITY=-", "test"], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    for line in (root / "simulator-tests.log").read_text(errors="replace").splitlines():
        if any(term in line for term in ["error:", "Test Case", "Executed ", "TEST SUCCEEDED", "TEST FAILED"]): print(line)
    raise SystemExit(result.returncode)
finally:
    if server is not None:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
    # Delete only the new simulator whose identity/name we just verified.
    states = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "--json"]))
    owned = [d for devices in states["devices"].values() for d in devices if d["udid"] == device]
    if len(owned) == 1 and owned[0]["name"] == name:
        subprocess.run(["xcrun", "simctl", "shutdown", device], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["xcrun", "simctl", "delete", device], check=True)
