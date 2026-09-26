import { expect, it } from '@jest/globals';
import { readdirSync } from 'fs';
import { join } from 'path';

function findTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return findTestFiles(entryPath);
    return /\.(test|spec)\./i.test(entry.name) ? [entryPath] : [];
  });
}

it('keeps Jest test files outside Expo Router app routes', () => {
  const appDirectory = join(process.cwd(), 'src', 'app');

  expect(findTestFiles(appDirectory)).toEqual([]);
});
