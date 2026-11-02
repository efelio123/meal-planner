import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = dirname(require.resolve('expo-widgets/package.json'));
const pin = JSON.parse(readFileSync(resolve(root, 'scripts/sdk-pin.json')));
const installed = JSON.parse(readFileSync(resolve(packageRoot, 'package.json')));
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json')));
assert.equal(installed.version, pin.version, 'Re-review the native source before changing the widget SDK.');
assert.equal(lock.packages['node_modules/expo-widgets'].integrity, pin.integrity, 'Unexpected registry integrity.');
function evidence(file, needle, observation) {
  const source = readFileSync(resolve(packageRoot, file), 'utf8');
  const offset = source.indexOf(needle);
  assert.notEqual(offset, -1, `Re-review changed native path: ${file}`);
  return { file, line: source.slice(0, offset).split('\n').length,
    sha256: createHash('sha256').update(source).digest('hex'), observation };
}
const findings = [
  evidence('ios/Widgets/Buttons.swift', 'intent: WidgetUserInteraction(', 'The stock iOS control selects the SDK intent, not an app-defined API worker.'),
  evidence('ios/Widgets/AppIntent.swift', 'WidgetsStorage.set(newTimeline', 'iOS persists returned local props then posts its event and reloads the timeline.'),
  evidence('ios/WidgetsEvents.swift', 'NotificationCenter.default.post', 'The native interaction notification is process-local; it is not a durable delivery queue.'),
  evidence('ios/Widgets/WidgetsJSRuntime.swift', 'let context = JSContext()', 'The widget uses an isolated JavaScriptCore context, not the main React Native runtime.'),
  evidence('android/src/main/java/expo/modules/widgets/WidgetInteractionAction.kt', 'WidgetsStorage.set(context', 'Android persists returned local props then notifies an in-memory observer.'),
  evidence('android/src/main/java/expo/modules/widgets/WidgetsEvents.kt', 'userInteractionObserver?.invoke', 'No observer means there is no app-side event handler or queued replay.'),
  evidence('android/src/main/java/expo/modules/widgets/WidgetsModule.kt', 'Function("updateSnapshot")', 'The Android Widget class has reload/updateSnapshot, not iOS timeline readback.'),
  evidence('android/src/main/java/expo/modules/widgets/WidgetsUtils.kt', '"configuration" to emptyMap', 'The Android environment does not supply iOS widgetFamily or actual resize dimensions.'),
  evidence('plugin/src/types/WidgetConfig.type.ts', 'export type WidgetConfig', 'The reviewed public plugin options do not provide a custom intent/network-action handler.'),
];
console.log(JSON.stringify({ package: pin, findings,
  conclusion: 'Stock local callbacks do not implement authenticated closed-app shared-list writes. Native action/store integration requires design review.',
  evidenceLevel: 'Pinned-source audit only. Not native signing, rendering, background networking, or phone acceptance.' }, null, 2));
