# Expo SDK 57 patch alignment

Status: proposed for Felipe's approval (October 13, 2026). Planning only; no dependency or deployment setting has changed.

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

## Open questions / approval gate

- Felipe's approval of these seven patch-level direct dependency changes is required before implementation. If npm or Expo requires an additional direct package change, pause for a plan revision and approval.
- Enabling Render Auto-Deploy is not part of this plan; migrations, API-only build filters, and the Free-plan cost guard need their own design before that switch.
