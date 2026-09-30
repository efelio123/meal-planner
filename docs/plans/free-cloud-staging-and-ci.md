# Free cloud staging and CI plan

Status: implementation in progress on `feat/cloud-staging-ci-plan`; PR #11 is
open with the workflow and approved SDK 57 patch updates committed. The initial
hosted run exposed a missing generated Expo declaration in the clean
checkout; a follow-up added the documented type-generation step, and the
follow-up push and pull-request runs both passed. No provider resources or
deployments have been created.

## Goal and boundaries

Establish the smallest useful hosted test environment: the existing Expo mobile
app calls the authenticated FastAPI API over HTTPS, while two test users in one
test household share a shopping list. CI validates code and migrations before
staging changes are deployed.

Use test-only identities and data. Do not copy data from the home-server
dashboard or use family/personal household data. This is not production hosting
and does not complete broader two-household isolation, backups/restore,
availability, monitoring, or release operations. No code, dependency, secret,
cloud account, service, schema, or workflow changes are part of this planning
slice.

## Cost policy

Hard ceiling: **$0 per month total** for hosting, database, CI, and test builds.
Choose only explicitly free tiers; do not attach a payment method, select an
upgrade, enable a paid add-on, or accept a charge. If a free quota is reached,
pause and wait for reset or reduce usage. Any paid fallback, billing account,
domain purchase, or cost above $0 requires a separate explicit approval. The
provider dashboard must be checked before and during setup so an accidental
paid plan is not assumed to be free.

## Recommended combination

| Need | Proposed option | Free-tier fit and material limits |
|---|---|---|
| FastAPI service | Render Free Web Service | Public `onrender.com` HTTPS/TLS and dashboard environment variables. 0.1 CPU / 512 MB, one instance, ephemeral filesystem, 750 workspace instance-hours/month. Sleeps after 15 minutes without inbound traffic; first request after sleep typically waits about a minute. No private ingress. With no payment method, exhausted included bandwidth suspends services; exhausted build-pipeline usage blocks new builds. Adding a payment method can make overages billable, so do not add one. |
| Persistent PostgreSQL | Neon Free, one isolated staging project/database | Current official free-plan documentation lists 100 CU-hours/project/month, 0.5 GB storage, 5 GB public network transfer, 10 branches/project, max 2 CU, and scale-to-zero after 5 minutes idle. Free includes up to 6 hours / 1 GB change-history Instant Restore and one manual snapshot; these are not a tested independent backup/restore program. At compute or network quota, compute is suspended until the next period or an explicit plan upgrade; storage over the cap rejects writes that grow storage. Test data only. Keep on Free and do not upgrade. |
| CI | GitHub Actions standard `ubuntu` hosted runners for this public repository | Standard hosted runner minutes are free for public repositories. Use no larger runners, paid services, or unnecessary artifacts/caches. Run the existing mobile lint/tests/type-check and API Ruff/Pytest; use a disposable PostgreSQL 17 service container for migration and database integration tests. No staging credentials are needed in CI. |
| Mobile test client | Existing Expo Go on iOS/Android with the local Metro server | No additional service cost, and sufficient to exercise the existing app on two physical devices against the remote HTTPS staging API. The app bundle is served from Felipe's development machine, so both phones need network access to Metro while testing. This is not a standalone installable Meal Planner binary. |

The API and database communicate over outbound TLS-protected PostgreSQL
connections. Do not expose PostgreSQL to the phone: mobile traffic goes only to
the HTTPS API. Choose nearby compatible regions, then verify connection
behavior from the deployed API. Render can suspend free services for unusually
high service-initiated external traffic, so the small test workload is
intentional.

EAS Build Free is optional, not required for this first $0 functional
milestone. Expo currently includes up to 15 Android and 15 iOS builds per
month, with a low-priority queue; quota exhaustion blocks new Free builds
until reset rather than charging. However, Expo's internal iOS device
distribution uses ad hoc provisioning, which requires Apple Developer Program
membership (currently USD $99/year). Therefore a new standalone iOS preview
build is not $0 unless Felipe already has that membership and explicitly
confirms it is acceptable. Android internal APKs can be distributed without
Google Play, but consume EAS build quota. Use Expo Go plus Metro first; if a
standalone iOS binary is a hard requirement and no eligible membership already
exists, stop for explicit approval of the annual cost. See [Expo internal
distribution](https://docs.expo.dev/build/internal-distribution/) and [Apple
Developer Program pricing](https://developer.apple.com/programs/).

### Why this pairing, and alternatives

- **Render Postgres is not suitable for persistent staging:** its free database
  is 1 GB but expires 30 days after creation, has a 14-day grace period before
  deletion, and has no backups. Keep only the API on Render.
- **Supabase Free Postgres** is a viable alternate database (500 MB; free
  projects pause after seven days of low activity; no free backups). It adds a
  project-wide pause and offers less useful continuity for this intermittent
  test environment than Neon scale-to-zero database compute. Re-evaluate if
  Neon free quotas or connection behavior do not fit.
- **Koyeb** offers a free web service and a free managed database, but its
  documented account validation requires a credit card and the free database
  has only five active compute hours/month. That conflicts with the strict
  $0/no-charge safety preference and is not recommended.
- **Google Cloud Run** has an always-free allowance and scales to zero, but
  requires a billing account and can bill usage beyond the free allowance;
  budgets are alerts, not a hard cost stop. It is not the $0-safe choice.
- GitHub Actions is preferred over another CI vendor because this is already a
  public GitHub repository and standard hosted runners are free. EAS Free is
  optional for binary distribution; Expo quota exhaustion pauses builds rather
  than charging. Building locally is another no-service-cost option, but iOS
  local builds require macOS/Xcode and Android requires local Android tooling.

Free limits/pricing change; verify them again immediately before account or
resource creation. The comparison was researched against current official
documentation on September 30, 2026: [Render free services and PostgreSQL](https://render.com/docs/free),
[Render billing FAQ](https://render.com/docs/faq), [Render TLS](https://render.com/docs/tls),
[Render environment variables and secrets](https://render.com/docs/configure-environment-variables),
[Render Python/uv configuration](https://render.com/docs/troubleshooting-python-deploys),
[Render Python version selection](https://render.com/docs/python-version),
[Render root directories and deploy controls](https://render.com/docs/deploys),
[Neon plans and free quotas](https://neon.com/docs/introduction/plans),
[Neon free-plan quota behavior](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md),
[Neon connection pooling guidance](https://neon.com/docs/connect/connection-pooling),
[Supabase pricing](https://supabase.com/pricing), [Supabase free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
[Koyeb instance limits](https://www.koyeb.com/docs/reference/instances), [Koyeb pricing FAQ](https://www.koyeb.com/docs/faqs/pricing),
[Cloud Run pricing](https://cloud.google.com/run/pricing), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets),
[PostgreSQL 17 TLS and server verification](https://www.postgresql.org/docs/17/libpq-ssl.html),
[Expo EAS pricing](https://expo.dev/pricing), [Expo plan limits and quota behavior](https://docs.expo.dev/billing/faq/),
and [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

## Security, configuration, and migrations

- Use a distinct staging Neon project/database, e.g. `meal_planner_staging`,
  and a distinct Render service. Never point staging at `meal_planner_dev`, the
  disposable test database, or any production/family database.
- Render dashboard environment variables hold server-only settings:
  `DATABASE_URL` in the existing SQLAlchemy/Psycopg-compatible
  `postgresql+psycopg://` form and Clerk server secret/configuration. Keep the
  API's audience optional unless a matching audience is explicitly configured.
  Never put server values in source, mobile `EXPO_PUBLIC_*` values, GitHub
  Actions, logs, or the app.
- For Neon, use the provider-generated hostname and TLS connection parameters;
  require certificate-chain and hostname verification (`sslmode=verify-full`)
  with a trusted root CA, and prefer `channel_binding=require` when supported
  by the resolved Psycopg/libpq runtime. A TLS-only `sslmode=require` encrypts
  traffic but does not by itself verify the server hostname. Runtime may use
  Neon's `-pooler` endpoint to limit open connections; use its direct endpoint
  for Alembic migrations unless compatibility is verified. Test TLS and
  connection recycling after Neon/Render idle periods. Do not log the URL or
  credentials; redact connection errors before sharing them. Do not connect by
  IP or weaken hostname verification to work around a certificate failure.
- The current FastAPI application does not configure browser CORS middleware,
  and native Expo Go requests are not subject to browser CORS enforcement. Do
  not add CORS as a requirement for this native test. If browser/web access is
  later added, define narrowly allowed web origins as a separate API change.
- For the Expo Go test, `EXPO_PUBLIC_API_BASE_URL` resolves to the Render HTTPS
  URL and the Clerk publishable key remains client-public. Supply them to the
  Expo CLI process from local shell configuration; do not add or publish an
  environment file. Confirm the correct Clerk Development instance, issuer,
  email-code configuration, and authorized-party value before testing; no
  Clerk production users or data. Any values bundled into the app are public.
- Use the existing handwritten Alembic migrations as the only schema path.
  Before any migration, inspect the target's configured database name and run
  `SELECT current_database()`; both must identify the dedicated staging DB.
  Apply `uv run alembic -c alembic.ini upgrade head`, then verify with
  `uv run alembic -c alembic.ini current --check-heads`. Do not rely on a host's
  dashboard schema editor or ORM autogeneration. Run migrations as an explicit
  pre-deploy step from a controlled local shell or a later-reviewed workflow;
  do not put the staging database URL into PR-test CI.
- GitHub CI should need no application secrets: use a local PostgreSQL service
  container for tests. If deployment automation is considered later, use a
  narrowly scoped environment secret and protected `staging` environment, not
  personal tokens or credentials exposed to pull-request jobs. Repository
  writers can access configured workflow secrets, and fork PRs do not receive
  them; minimize permissions and never print secrets.

## Staging and CI flow

1. The uncommitted `.github/workflows/ci.yml` runs on pull requests, pushes to
   `main` and `feat/**`, and manual dispatch. It grants only `contents: read`,
   uses non-secret Expo config placeholders, and contains no staging
   credentials or deployment step. Its mobile job runs normal and cache-cleared
   tests, TypeScript, lint, and Expo dependency/config checks. Its API job uses
   a PostgreSQL 17 service container and the pinned project `uv` version.
2. Before any migration or test, CI initializes its database with
   `POSTGRES_DB=meal_planner_disposable_test`; set CI `DATABASE_URL` to that
   same name in SQLAlchemy `postgresql+psycopg://` form. Before migration or tests, fail if
   either the parsed configured URL database name or `SELECT current_database()`
   differs from `meal_planner_disposable_test`. Run migrations to head and
   `alembic current --check-heads`, then run the full API suite with the same
   required URL. The current DB tests skip if `DATABASE_URL` is missing, so CI
   must require it and fail if the pytest summary/JUnit report contains any
   skipped tests; missing service, wrong name, connection failure, or any skip
   must fail the check. Do not use `meal_planner_dev` or `meal_planner_staging`
   in CI. No CI job may deploy or access staging credentials.
3. Before creating any provider resource, inspect the actual selected plan and
   billing screens. Continue only if Render and Neon both clearly show Free and
   $0, with no payment method, paid add-on, or upgrade required. If a screen
   requests a card or shows a possible charge, stop and ask Felipe. Keep
   resource names explicit (`meal-planner-staging`) and test data only.
4. Configure Render with root directory `services/api`, build command
   `uv sync --locked --no-dev`, and start command
   `uv run --no-sync uvicorn meal_planner_api.main:app --host 0.0.0.0 --port $PORT`.
   Render's Python runtime reads `.python-version` there; the committed file
   currently requests Python `3.13`, not `3.13.5`. If selecting an exact patch,
   set Render's `PYTHON_VERSION` to `3.13.5` (Render documents fully qualified
   released versions as supported); otherwise use the configured 3.13 line.
   The root contains `uv.lock`, as required by Render for `uv sync`. Keep
   **Auto-Deploy Off** in service settings. The Free plan does not support a
   Render pre-deploy command, so do not depend on Render to migrate. The
   `services/api` root does not include the repository-level `db/migrations`
   directory. Run staging migrations from a full local repository checkout,
   not from Render. First select the exact CI-verified commit SHA intended for
   deployment and check out that same SHA in the full repository. From
   `services/api` in that checkout, use a controlled shell and verify the
   configured staging URL database name and `SELECT current_database()` both
   equal `meal_planner_staging`; then run
   `uv run alembic -c alembic.ini upgrade head` and
   `uv run alembic -c alembic.ini current --check-heads` against that same URL.
   Confirm the checkout is still at the selected SHA and the identity/head
   checks succeeded before manually deploying that exact SHA using Render's
   Dashboard "Deploy a specific commit".
   Set server secrets in Render's dashboard. For device acceptance, launch
   Metro locally and open Expo Go on both test phones, supply the Render HTTPS
   URL and approved Clerk Development publishable key via the local shell (no
   environment-file edits), and keep Metro reachable over the local network.
   If a standalone build is separately approved, confirm the Apple membership
   prerequisite for iOS and applicable EAS quota before creating it.
5. Validate health, Clerk session verification, authenticated `/v1/me`,
   household scoping, and shared shopping-list add/read/check/remove between
   two test users. Use two different test households to verify tenant denials.
   Record cold-start and quota limits as expected staging constraints. For a
   Render cold-wake check, leave the service idle long enough to spin down,
   then make a signed-in request from a physical phone. Confirm the app presents
   an understandable loading state and a recoverable, visible API error with
   retry if wake-up is slow or fails; an unexplained indefinite spinner is a
   failed acceptance.
6. Monitor Render and Neon free-plan usage during tests. Stop testing before
   reaching the limits if convenient; if the limit is hit, accept service
   suspension/write rejection and wait or reduce data/usage. Do not upgrade to
   restore availability without separate approval.

### Rollback and cleanup

Disable the mobile build or point local development back to the local API; do
not change the app's production defaults. Disable/manual-stop the Render
service, remove its environment values, then delete the dedicated staging
Neon project only after confirming its exact name and that it contains test
data only. Preserve any requested test evidence separately without personal
data. Deleting the Neon project destroys the staging database; no automatic
restore of deleted project data is promised. Revoke/rotate any staging
credentials if exposed. Remove an EAS project/environment only if one was
created and its exact identity is verified. Do not touch the home-server,
`meal_planner_dev`, or `meal_planner_disposable_test` databases.

## What this $0 stage can and cannot prove

It can prove the app running on Expo Go on real devices can reach a public HTTPS
API, Clerk-authenticated requests work with configured staging trust, migrations
apply to hosted PostgreSQL, household authorization survives real
network/database execution, and two test users see the same household shopping
list across devices. It can also reveal cold-start, remote-DB connection, and
platform networking problems. It does not itself produce a standalone Meal
Planner binary.

It cannot establish production uptime/SLA, sustained performance, scalable
capacity, high availability, production-grade backups or tested recovery,
disaster recovery, private networking, formal security/compliance, monitoring
and alerting, production secret lifecycle, real customer support, production
Clerk behavior, App Store/Play release readiness, or reliable service after
free quotas are exhausted. Free staging is disposable test infrastructure,
not consumer production.

## Validation and open decisions

Automated validation should include the existing mobile
normal/cold suites, TypeScript, lint, API Ruff/Pytest, a clean disposable
PostgreSQL migration run in CI, `alembic current --check-heads`, Expo
configuration/dependency checks, health/authenticated API smoke tests, and
`git diff --check`. A successful CI PostgreSQL container does not replace the
separate staging identity check or cross-device acceptance.

### Approved product and cost decisions

- The selected path is Render Free + Neon Free + GitHub Actions, with a strict
  total cost ceiling of $0/month. Expo Go + a local Metro server is the first
  two-device client; the local API remains the normal development default.
- Reuse the existing Clerk Development instance for staging-only test
  activity. Never use Clerk Production or delete a Clerk user also used by
  local development.
- Use test-only staging identities and data. Felipe will manually review and
  clear staging-only test data within 30 days; do not automate deletion.
- No payment method, charge, paid service, or tier upgrade is authorized. If a
  provider's current plan or billing screen does not clearly confirm $0, stop.

### Current validation state and remaining work

On September 30, 2026, a local CI-equivalent run against a new, volume-free
PostgreSQL 17 container verified both the configured database URL and
`SELECT current_database()` as `meal_planner_disposable_test`, ran Ruff and
`alembic upgrade head` / `current --check-heads`, then passed all 56 API tests
with 0 skips. Mobile normal and cold runs each passed 27 suites / 178 tests;
TypeScript and lint passed. The initial hosted run also passed the API job
(56 passed, 0 skipped) and mobile normal/cold tests, but TypeScript failed
because the ignored `expo-env.d.ts` was absent in the clean checkout. The
workflow now runs the official Expo declaration-generation command before
type-checking. Follow-up push and pull-request runs both passed: each mobile
job passed normal and cold runs (27 suites / 178 tests each), TypeScript, lint,
Expo dependency compatibility (`Dependencies are up to date`), and Expo Doctor
(21/21); each PostgreSQL job passed all 56 tests with 0 skipped. Staging
resource creation remains paused; no provider resources or deployments have
been created.

After Felipe approved the four patch-only updates, the mobile manifest now
uses `@expo/ui ~57.0.21`, `expo ~57.0.26`, `expo-constants ~57.0.20`, and
`expo-router ~57.0.24`. The lockfile also updates only the related resolved
`expo-modules-core` patch to `57.0.20`; no SDK 58 or unrelated dependency
changes were made. Fresh `expo install --check` reports dependencies up to
date, and temporary Expo Doctor passes 21/21. Mobile normal and cold runs each
pass 27 suites / 178 tests; TypeScript and lint pass. The local disposable
PostgreSQL validation above passed the migration/head checks and 56 API tests
with 0 skips. The committed workflow's follow-up push and pull-request runs
passed as recorded above. Staging resource creation remains paused pending
review and explicit next-step approval, plus confirmation in the provider
dashboard that all selected services are Free/$0.

Before staging resource creation, the live provider account and billing
screens must be reviewed and must clearly show the approved Free plans and
$0 cost. No provider dashboard or payment setup has been performed yet.
