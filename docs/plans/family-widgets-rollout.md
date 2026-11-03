# Family trial widgets rollout — November 2, 2026

Status: Felipe explicitly requests cleanup of test widgets, returning his app to
the Mac family database, and connecting widgets to that family trial. Work stays
on `codex/native-widgets`; no merge, push or cloud deployment is requested.

## Goal and boundary

Use the existing Mac family API/database on private HTTPS 443 for Felipe's app
and consumer widgets. Preserve family recipes, Catalog, meals, Shopping, users,
and memberships. Remove the separate fictional NativeWidgetProbe app from his
phone and retire temporary Windows-to-Mac HTTPS 8443/SSH forwarding. Preserve
recovery archives and the original native projects. Loryn's installed app stays
in place; the API must remain backward compatible.

## Execution

1. Verify current source, containers, original DB volume/revision, phone and probe
   bundle IDs. Obtain the standing release-checklist light/dark review. Refresh
   the full API suite only on owned disposable PostgreSQL; retain the recorded
   native pagination and mobile validation with their actual source boundaries.
2. Prepare an isolated, exact-source API image and a signed family-target phone
   build. Preserve the working development-review artifact. No new dependencies,
   account changes, payment or broad native regeneration.
3. Save a private custom-format backup on the Mac using a consistent snapshot;
   restore into an explicitly owned database, compare every existing row and
   schema, rehearse all four additive migrations to `widget_devices`, and verify
   original-column fingerprints. Existing active members receive the already
   approved full-content grants; calendar sync remains disabled. Remove only the
   owned rehearsal database.
4. Immediately before live migration, pause only the family API, take and verify
   a fresh backup/restore, upgrade using the rehearsed image, verify all original
   values and the exact DB container/volume, and activate only the API. Update
   private active-release/backup-helper revision records and check HTTPS health.
5. Revoke development widget bindings and preserve any disposable Pending work
   privately before cleanup. API origin is already part of native session scope,
   so the new build clears old widget authority and registers fresh family-scoped
   credentials using the signed-in user's normal authentication. Never transplant
   a widget secret or household IDs between databases.
6. Verify app/extension signatures, profiles, shared Keychain/App Group and
   embedded JS contains family HTTPS 443 and excludes review 8443. Install in
   place on Felipe only. Launch and verify family widget registration/snapshot
   evidence; retain physical checkoff/count/Plan review as a user check.
7. Uninstall only the identified separate probe bundle, remove only owned HTTPS
   8443 and the verified SSH forward, and verify family HTTPS 443 still works.
   Do not reset Tailscale Serve, delete trial data or remove recovery materials.

## Recovery and validation

Record backup path/hash/restore verification, image/source/schema/volume, signed
artifact and actual phone results privately; commit only non-sensitive outcomes.
Prefer a compatible old API or fix forward on the additive schema if needed.
Never restore over newly written household data without reviewing that specific
recovery decision. Any phone lock, signing or visual gate remains explicit.

## Completed outcome

The requested Mac family rollout and cleanup complete November 2. Final API
validation passes 265 tests with no skips; both-mode phone review is reported
passed. Rehearsal and fresh final restores match all 19 existing schemas and row
fingerprints; live migration reaches `widget_devices` with all original values,
DB container and volume preserved. Felipe's verified family-target Release is
installed in place and launched; one family widget binding and authenticated
summary responses confirm the new connection. Development authority is revoked,
the separate probe app and temporary 8443/SSH connection are removed, and family
HTTPS remains healthy. Loryn's existing installation stays intact. See the
full evidence/recovery record in `docs/qa/widget-phone-review.md`. No merge/push
or cloud deployment is performed. Broader acceptance cases remain individually
unreported, rather than inferred from the successful rollout.
