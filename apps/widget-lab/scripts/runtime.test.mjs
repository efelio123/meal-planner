import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetRuntime } from './runtime-harness.mjs';
for (const platform of ['ios', 'android']) {
  test(`${platform}: actual SDK dispatcher switches local views without app state`, () => {
    const runtime = widgetRuntime(platform);
    assert.equal(runtime.press('Plan').view, 'plan');
    assert.equal(runtime.press('Shopping').view, 'shopping');
    assert.equal(runtime.globals('typeof fetch'), 'undefined');
    assert.equal(runtime.globals('typeof require'), 'undefined');
  });
  test(`${platform}: checkoffs stay pending and never become a confirmed shared-list purchase`, () => {
    const runtime = widgetRuntime(platform); const next = runtime.press('○ Milk');
    assert.equal(next.items[0].pendingChecked, true);
    assert.equal(next.items[0].confirmedChecked, false);
    assert.equal(next.items.filter((item) => !item.confirmedChecked).length, 3);
    assert.equal(runtime.press('… Milk').items[0].pendingChecked, null);
  });
  test(`${platform}: seven Plan days are reachable through the serialized layout`, () => {
    const runtime = widgetRuntime(platform); runtime.press('Plan');
    if (platform === 'ios') { for (const [index, label] of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].entries()) assert.equal(runtime.press(label).selectedDay, index); }
    else { for (let index = 1; index <= 7; index++) assert.equal(runtime.press('Next').selectedDay, index % 7); }
  });
  test(`${platform}: replacing a snapshot overwrites local pending props, proving it is not a durable outbox`, () => {
    const runtime = widgetRuntime(platform); const initial = JSON.parse(JSON.stringify(runtime.props()));
    runtime.press('○ Milk'); runtime.replace(initial);
    assert.equal(runtime.props().items[0].pendingChecked, null);
  });
}
test('iOS small widget is count-only; Android has explicit sample size kinds because widgetFamily is absent natively', () => {
  const ios = widgetRuntime('ios'); ios.environment.widgetFamily = 'systemSmall'; assert.ok(ios.render()); assert.throws(() => ios.press('Plan'), /missing/);
  const android = widgetRuntime('android'); assert.equal(android.registrations.length, 3);
  android.replace({ ...android.props(), size: 'small' }); assert.ok(android.render()); assert.throws(() => android.press('Plan'), /missing/);
});
