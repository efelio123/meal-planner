# Expo SDK 57 patch alignment

Status: Felipe approved the seven patch updates; candidate implementation committed on `codex/expo-patch-alignment` October 13, 2026. Hosted CI passed on the exact candidate commit. Awaiting review/merge; no deployment setting has changed.

## Goal

Restore a green mobile CI compatibility check on `main` without changing Expo SDK major/minor, app behavior, the API, or the $0/month staging setup. The [latest `main` run](https://github.com/efelio123/meal-planner/actions/runs/38470280554) passed its API/PostgreSQL job but failed the mobile job at `npx expo install --check`. The earlier mobile tests, TypeScript, and lint in that job are not a substitute for the failed check.

## Affected areas

- `apps/mobile/package.json` and `apps/mobile/package-lock.json` only for dependency changes.
- Mobile CI as already defined in `.github/workflows/ci.yml`; do not weaken or bypass its Expo checks.
- This plan and the consumer roadmap for the final validation record. No Render, Neon, schema, environment, or application-feature change is proposed.

## Proposed changes

Align the seven package ranges currently reported by Expo's installed SDK 57 checker:

| Package | Current range | Recommended range |
| --- | --- | --- |
| `@expo/ui` | `~57.0.21` | `~57.0.23` |
| `expo` | `~57.0.26` | `~57.0.28` |
| `expo-constants` | `~57.0.20` | `~57.0.21` |
| `expo-linking` | `~57.0.11` | `~57.0.12` |
| `expo-router` | `~57.0.24` | `~57.0.26` |
| `expo-splash-screen` | `~57.0.9` | `~57.0.10` |
| `jest-expo` (dev) | `~57.0.5` | `~57.0.6` |

Use Expo's version guidance and npm's lockfile, then inspect the complete manifest and lockfile diff. Permit only the direct patch alignments and necessary transitive resolution changes; investigate any major/minor or unrelated update before proceeding. If Expo's recommendation changes before implementation, revise this plan instead of silently widening scope. Do not use `expo.install.exclude` to make CI green.

## Design decisions and tradeoffs

- This is patch alignment within SDK 57, not an SDK 58 upgrade. Expo's CLI documents `npx expo install --check` as a CI validation and `--fix` as an update path; React Native package versions are compatibility-sensitive. [Expo CLI guidance](https://docs.expo.dev/more/expo-cli/)
- The benefit is keeping the supported SDK 57 package set coherent and restoring the existing CI gate. Leaving versions unchanged preserves a known red check; excluding them hides rather than addresses the mismatch. A broader SDK upgrade has more native and test risk and is outside this plan.
- Expo's recommended package versions are compatibility guidance, not proof of runtime behavior. The lockfile may adjust transitive packages. Review that diff and test the app rather than assuming patch changes cannot regress native sheets, navigation, or the keyboard.
- Keep Render Auto-Deploy Off. A green CI result alone would not coordinate future staging database migrations; that is a separate deployment design decision. No paid resource or package is proposed.

## Validation and review

1. After all dependency edits, run `npm ci` from `apps/mobile` to verify the lockfile reproduces a clean install. Run `npx expo install --check` and `npx expo-doctor` without suppressing warnings.
2. Run the complete mobile test suite both normally and cold-cache, TypeScript, lint, web export (Expo Router is changing), and `git diff --check`; report timeouts and retries separately. The API has no proposed change, so local disposable-PostgreSQL tests are unnecessary for this patch; hosted CI will still run them.
3. Review the branch diff, including transitive lockfile changes. Commit on `codex/expo-patch-alignment`, push for review, and require the hosted mobile and API jobs to pass on the exact candidate commit before merging to `main`. Do not call earlier green checks validation of the changed dependency set.
4. After merge, have Felipe reload Expo Go and smoke-check Plan, Recipes, Shopping, Catalog, native sheets, and keyboard behavior on iPhone; include Android during the subsequent two-device acceptance pass. No staging API deploy is needed for mobile-only package updates.

## Implementation and validation record (October 13, 2026)

- Commit `265e417` updates exactly the seven direct package ranges above and the npm lockfile. The lockfile also resolves the related Expo CLI/Router transitive tree, including nested Radix packages; no other direct dependency or application source file changed.
- An isolated temporary copy was used because Felipe's Expo server was running. `npm ci`, `npx expo install --check`, Expo Doctor (21/21), TypeScript, lint, web export, and `git diff --check` passed. This did not refresh the running local Expo process.
- The first clean-install full Jest run passed 338/340; two tests timed out at Jest's five-second limit. Both affected suites then passed directly (14/14), and a subsequent complete warm run passed 51 suites / 340 tests. The explicit no-cache full run did **not** pass: 46 suites / 318 tests passed and 22 tests in five suites failed, primarily due to timeout/cascading render-test errors. This is recorded as an unresolved cold-run failure, not a pass. Hosted CI against the exact branch commit is required before merge.
- `npm ci` warned about `react-reconciler@0.34.0` preferring React 19.3 while the project uses 19.2.3. The old and new lockfiles both contain the same `test-renderer@1.3.0`, nested reconciler, and React versions, so this warning predates the patch alignment. It is not hidden or treated as a new direct dependency choice.
- [Hosted CI run `38472785278`](https://github.com/efelio123/meal-planner/actions/runs/38472785278) on exact commit `265e4178b549e9d1c0f26f68974724883cd8359e` passed: mobile normal and cold/no-cache runs each 51 suites / 340 tests; Expo dependency check and Doctor (21/21), TypeScript, and lint passed; API/PostgreSQL passed 145 tests with zero skipped. This resolves the hosted CI gate for the candidate, while the separate local isolated-copy cold-run failure remains part of the record. No application code, API, schema, staging service, or live Expo server was changed.

## Open questions / approval gate

- Felipe approved these seven patch-level direct dependency changes. If npm or Expo requires an additional direct package change, pause for a plan revision and approval.
- Hosted cold CI passed on the exact candidate commit. Felipe's review/merge decision and the subsequent phone smoke remain open.
- Enabling Render Auto-Deploy is not part of this plan; migrations, API-only build filters, and the Free-plan cost guard need their own design before that switch.
