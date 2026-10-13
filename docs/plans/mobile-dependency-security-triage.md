# Mobile dependency security triage

Status: proposal for Felipe's review, October 13, 2026. No dependency changes have been made. Planning branch: `codex/mobile-dependency-security-triage` from current `main` (`ab83bb8`).

## Goal and scope

Remove the straightforward, meaningful high-severity findings in the mobile npm tree without an Expo SDK migration, auth change, or blanket audit rewrite. This is a targeted maintenance slice, not a promise of zero audit findings. The API, database, environment, Render, and Neon are out of scope.

## Audit findings and priority

On October 13, `npm audit --json` for `apps/mobile` reported **0 critical, 57 high, and 27 moderate** vulnerability entries. Those entries are package-path counts, not 57 distinct flaws; npm's live advisory data also changed the count from the earlier 52 high / 29 moderate without a repository change. The high entries trace principally to five underlying advisories:

| Root package/path | Finding and disposition |
| --- | --- |
| `brace-expansion` 1.1.18 via ESLint and 5.0.9 via Expo fingerprint/`minimatch` | Two high-severity stack-exhaustion advisories. Fixed versions exist: at least 1.1.20 and 5.0.11 for these lines. Use 1.1.21 and 5.0.11, which fit the parents' existing `^1.1.7` and `^5.0.8` ranges. The 1.1.21 version also covers the related moderate advisory. [Parsing advisory](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p); [nested-groups advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7). |
| `http-cache-semantics` 4.2.0 via direct `@expo/ngrok` → `got` → `cacheable-request` | High cross-user-cache advisory. The repository has no tunnel use beyond the dependency declaration; Felipe's current phone workflow uses LAN. Recommend removing the optional `@expo/ngrok` dependency and its transitive tree rather than claiming that 4.3.0 is a security patch: the [advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) lists no patched version, and the [maintainer disputes the report](https://github.com/kornelski/http-cache-semantics/issues/56). This removes an unused development tunnel path, not a shipped-app feature. |
| `braces` 3.0.3 via `micromatch` in Metro/Jest | High stack-exhaustion advisory with [no published patched version](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Defer; do not force an Expo/React Native/Jest major change or a downgrade solely to alter the audit number. |
| `node-forge` 1.4.0 via Expo CLI/code-signing certificates | High signature-verification advisory with [no published patched version](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Defer and monitor Expo/upstream. Do not patch crypto code locally or override it to an unverified fork. |

Many named high packages (`expo`, React Native, Jest, Clerk, Metro, Solana adapters) inherit a severity from these underlying paths. Neither an inherited high label nor `npm audit --omit=dev` alone proves the vulnerable function is bundled into the phone app or reachable from users. The two proposed changes target actual dependency paths; the remaining findings should be documented, not hidden. The `stream-json`, `uuid`, and other moderate reports do not justify an unrelated Clerk/Solana/Router major migration in this slice.

## Proposed implementation, subject to approval

1. On this feature branch, update only the vulnerable transitive `brace-expansion` resolutions in `apps/mobile/package-lock.json`, retaining the existing compatible parent ranges. Verify every installed copy is outside both high advisory ranges. Do not add a global override unless a normal targeted lockfile update cannot produce a clean tree; if an override is needed, stop and revise this plan first.
2. Remove direct `@expo/ngrok` from `apps/mobile/package.json` and regenerate the lockfile. Confirm `npm ls @expo/ngrok http-cache-semantics` no longer finds the tunnel chain. This intentionally gives up `npx expo start --tunnel` until tunnel support is deliberately reintroduced; ordinary LAN/localhost Expo startup remains. [Expo documents tunneling as an optional setup](https://docs.expo.dev/more/expo-cli/#tunneling).
3. Inspect the entire manifest/lockfile diff. If npm changes unrelated direct dependencies, React Native/Expo SDK versions, or broad transitive trees, stop and reassess rather than accepting a blanket `npm audit fix` (especially `--force`). [npm documents that `audit fix` performs an install and `--force` permits out-of-range major changes](https://docs.npmjs.com/cli/v11/commands/npm-audit/).
4. Commit the focused implementation and report the remaining advisory roots and counts honestly. No merge or deployment is part of plan approval alone.

## Validation and acceptance

- Finish all dependency edits before running tests. With any running Expo process protected, run a clean `npm ci` (or use an isolated copy), inspect `npm ls` for the affected packages, and compare before/after `npm audit --json`. Success means the targeted high paths are gone and no critical finding is introduced; **not** that the total audit count is zero.
- Run `npx expo install --check`, Expo Doctor, TypeScript, mobile lint, the full normal and cold/no-cache mobile suites, a web export, and `git diff --check`. Report timeouts, warnings, and retries separately. No local PostgreSQL run is required for a mobile-only lockfile change; hosted CI still runs API/PostgreSQL tests.
- Push only after review, run hosted CI on the exact candidate commit, then merge only with Felipe's approval. After merge, verify LAN startup and a brief iPhone core-loop/sheet smoke test. No Render auto-deploy or environment change.

## Approval question and deferred work

Does Felipe approve dropping optional Expo tunnel support from the project for now? If tunnel access is important, keep `@expo/ngrok`, implement only the compatible `brace-expansion` updates, and document the tunnel-path advisory rather than treating an audit-count-only version bump as a confirmed fix. Revisit `braces`, `node-forge`, and moderate findings when upstream releases or an SDK upgrade provides a supported path.
