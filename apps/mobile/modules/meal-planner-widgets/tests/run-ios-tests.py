import json,subprocess,time,tempfile
from pathlib import Path
sources=Path(__file__).resolve().parent
root=Path(tempfile.mkdtemp(prefix="meal-planner-widget-integration-"))
subprocess.run(["ruby",str(sources/"create-ios-test-project.rb"),str(root)],check=True)
print("Disposable artifacts:",root,flush=True)
name="MealPlannerConsumerWidgets-"+str(int(time.time()))
device=subprocess.check_output(["xcrun","simctl","create",name,"com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro","com.apple.CoreSimulator.SimRuntime.iOS-27-0"],text=True).strip()
try:
 with (root/"consumer-tests.log").open("w") as log:
  result=subprocess.run(["xcodebuild","-project","NativeWidgetProbe.xcodeproj","-scheme","NativeWidgetProbe","-configuration","Debug","-destination","id="+device,"-derivedDataPath","TestData","CODE_SIGN_IDENTITY=-","test"],cwd=root,stdout=log,stderr=subprocess.STDOUT)
 for line in (root/"consumer-tests.log").read_text(errors="replace").splitlines():
  if any(term in line for term in ["error:","Test Case","Executed ","TEST SUCCEEDED","TEST FAILED"]):print(line)
 raise SystemExit(result.returncode)
finally:
 states=json.loads(subprocess.check_output(["xcrun","simctl","list","devices","--json"]))
 owned=[d for devices in states["devices"].values() for d in devices if d["udid"]==device]
 if len(owned)==1 and owned[0]["name"]==name:
  subprocess.run(["xcrun","simctl","shutdown",device],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run(["xcrun","simctl","delete",device],check=True)
