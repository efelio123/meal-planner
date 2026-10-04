# Return category emoji editing to the system keyboard

Status: implemented on `feat/household-catalog`; uncommitted for review.
Preserve the branch's other Catalog work. No commit or push is part of this
slice.

## Goal

Remove the new in-app emoji chooser and its `unicode-emoji-json` dependency.
Restore the earlier category Emoji text-entry sheet so people can enter or
paste one emoji with their device's ordinary keyboard. Keep the existing
category emoji field, starter emoji, display locations, and Edit Category
layout; this is not a reversal of the broader Catalog feature.

React Native 0.86 and Expo SDK 57 list their supported `keyboardType` and
`inputMode` values without an emoji option. The app cannot reliably open the
system keyboard directly in emoji mode. Users must switch with their device's
emoji key or paste an emoji; do not introduce a private native workaround or
another picker package.

Future issue, not part of this rollback: investigate whether a native iOS
emoji-input-mode request is reliable enough to be worthwhile. Android exposes
no supported way to open the user's selected keyboard directly to its emoji
panel, so it would still use the ordinary keyboard. Any iOS native approach
would need a development build and device testing; keep the ordinary keyboard
as the fallback. Do not add native code for this issue in the rollback.

## Approved changes

1. Surgically remove the chooser route, component, chooser-only tests, stack
   entry, and transient chooser draft/context state. Restore the small themed
   category Emoji text-entry sheet with an optional value, explicit clearing,
   and the existing one-emoji save validation. Show inline feedback and prevent
   saving a nonempty value that is not one valid emoji; ordinary text must never
   be persisted as the category emoji. Do not block each keystroke: a valid
   emoji can be composed of multiple code points, and paste must work. Keep
   name/type drafts intact when the sheet opens or closes. Preserve the
   established category-row appearance and all unrelated Catalog UX corrections.
2. Remove only `unicode-emoji-json` from the mobile manifest and lockfile.
   Do not change other packages or generated files. Leave the rejected chooser
   reference image `docs/design/catalog/emoji-picker-proposal.png` as historical
   design material, marked superseded in active planning documents. Continue to
   use `docs/design/catalog/edit-category.png` for the retained editor layout.
3. The chooser-specific API allowance for 35 additional symbols and tag flags
   and its pinned-dataset fixture/tests are candidates for removal. Before
   removing them, perform a read-only check of category emoji values in any
   local database used with the new API, including archived categories. If a
   value would become uneditable after rollback, or the relevant data cannot
   be checked, preserve the API allowance as a compatibility safeguard and
   report that exception; never rewrite or discard saved category data just
   to complete the rollback. No schema change is proposed.
4. Update the Catalog plan, QA record, and roadmap to distinguish the
   rejected chooser from the retained category-emoji feature and record the
   actual rollback/validation status.

## Validation

- Mobile: focused category-form and actual-router tests for enter, paste,
  clear, invalid/multiple emoji, and preserving name/type drafts; normal and
  cold suites; TypeScript; lint; whitespace check.
- API: targeted emoji validation tests and Ruff if the validator changes.
  Do not run the full disposable-PostgreSQL suite for this small, schema-free
  follow-up. A data audit is read-only and must not use reset commands.
- Device: on iPhone, verify the restored text-entry sheet in light/dark mode,
  keyboard open/closed, manual emoji-key selection, paste, save, and clear.
  Check Android when available; automated tests do not establish native
  keyboard behavior.

## Decision and safety gate

Felipe requested the rollback. The mobile chooser and package are removed.
The backend allowance was retained because the only local API database URL
found targets `meal_planner_dev`, which was not accessed. The relevant stored
values therefore could not be verified safely. This is the plan's specified
compatibility safeguard, not a database-validation result.

References: [React Native 0.86 TextInput](https://reactnative.dev/docs/0.86/textinput),
[Expo SDK 57 TextInput](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/textinput/).

## Implementation and validation record — 2026-10-04

- Removed the in-app chooser route/component, chooser-only tests, Catalog
  chooser draft state, and `unicode-emoji-json` from the mobile manifest and
  lockfile. The Emoji row and compact Edit Category layout remain. Tapping the
  row opens a small themed text-entry sheet using the ordinary `default` /
  `text` keyboard modes. Users can type or paste, explicitly Clear, Cancel, or
  confirm with Done. Name/type state stays in the mounted form.
- Input is not filtered per keystroke. The sheet shows an inline error for
  invalid text, keeps the text editable for multi-code-point composition, and
  prevents invalid or still-open emoji edits from reaching the category save.
  The client validation mirrors the API's one-emoji grammar, including skin
  tones, keycaps, joined sequences, flags, and the existing explicit accepted
  bases. Existing emoji display, starter values, and stored category values are
  unchanged.
- The backend compatibility/data gate was not safe to run: the only local API
  `DATABASE_URL` found is in `services/api/.env` and targets
  `meal_planner_dev`. That database was not contacted. Accordingly, the API's
  expanded validator, its explicit allowlist, and the pinned-dataset fixture
  and parity tests were retained as compatibility safeguards. No data was
  rewritten and no database was reset.
- The in-app chooser proposal image is superseded, not an implementation
  target. `edit-category.png` remains the editor-layout reference.
- Validation actually run: focused emoji-validation/actual-router tests passed
  (58 tests); the final mobile normal run passed 34 suites / 230 tests, and the
  direct no-cache cold run passed 34 suites / 230 tests. The first normal run
  had two 5-second timeouts (signup display-name and choice-picker tests); each
  passed when rerun individually, then the entire normal suite passed. Final
  TypeScript, mobile lint, API Ruff, the 21-test API category-emoji validation
  suite, and whitespace checks passed. No PostgreSQL tests were run.
- Device validation: keyboard behavior, paste, light/dark appearance, and
  sheet positioning have not been checked on a physical iPhone or Android
  device in this session. The potential iPhone keyboard emoji-shortcut issue
  remains a future investigation; no native code or additional picker was
  added.
