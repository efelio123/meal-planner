import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const platform of ['ios', 'android']) {
  if (!existsSync(resolve('artifacts', `ExpoWidgets-${platform}.bundle`))) {
    throw new Error(`Build the SDK ${platform} runtime bundle before this check.`);
  }
}
const result = spawnSync(process.execPath, ['--test', 'scripts/runtime.test.mjs'], {
  stdio: 'inherit', env: { ...process.env, WIDGET_LAB_USE_SDK_BUNDLES: '1' },
});
process.exit(result.status ?? 1);
