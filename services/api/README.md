# Meal Planner API

## Local Clerk authentication

Authenticated routes require server-only environment configuration. Keep values
in an ignored local file or shell session; never expose them as `EXPO_PUBLIC_*`
values or commit them.

```powershell
$env:CLERK_SECRET_KEY = "sk_..."
# Set only when this Clerk native-client session token contains an azp claim.
# $env:CLERK_AUTHORIZED_PARTIES = "<the exact azp value issued for this native Clerk client>"
# Optional: set only after configuring a matching Clerk JWT audience.
# $env:CLERK_AUDIENCE = "https://api.example.test"
```

The API accepts only Clerk `session_token` values through `Authorization:
Bearer ...`. It verifies them with Clerk's official Python SDK and provisions a
local user on every protected route, so clients do not need to call `/v1/me`
first. The API obtains email/name only from Clerk's server-side user resource.
When an `azp` claim is present, `CLERK_AUTHORIZED_PARTIES` must match the real
value Clerk issues for the native client; `localhost:8081` is not a safe
placeholder. If the session token has no `azp` claim, omit this setting rather
than inventing a value. `CLERK_AUDIENCE` is optional and must be omitted unless
the Clerk instance has a matching audience configured.

For a physical device, bind the development server to the trusted LAN interface
and use the computer's LAN IP in the mobile `EXPO_PUBLIC_API_BASE_URL`; never
use that setting for a public deployment.

## Local PostgreSQL and migrations

The local PostgreSQL service is defined in the repository-root `compose.yaml`.
It binds only to `127.0.0.1`, uses the named Docker volume
`meal_planner_postgres_data`, and requires a locally supplied password. Do not
commit a `.env` file or real credentials.

From the repository root in PowerShell:

```powershell
$env:POSTGRES_PASSWORD = "choose-a-local-development-password"
docker compose up -d postgres
```

Set `DATABASE_URL` in the shell where Alembic runs. It must use SQLAlchemy's
Psycopg dialect; URL-encode the password if it contains URL-reserved characters.

```powershell
$env:DATABASE_URL = "postgresql+psycopg://meal_planner:<url-encoded-password>@localhost:5432/meal_planner_dev"
```

From `services/api`, apply and inspect handwritten migrations:

```powershell
uv run alembic -c alembic.ini upgrade head
uv run alembic -c alembic.ini current --check-heads
uv run alembic -c alembic.ini history
```

To create a future revision, run `uv run alembic -c alembic.ini revision -m
"describe change"`, then write the migration SQL by hand. Do not use
`--autogenerate`.

### Disposable migration-test database

Migration integration tests run only when `DATABASE_URL` targets
`meal_planner_disposable_test`. Create it once from the repository root after
starting PostgreSQL:

```powershell
docker compose exec postgres createdb -U meal_planner meal_planner_disposable_test
```

To reset it, first verify the name is exactly `meal_planner_disposable_test`,
then run these commands. Never use these commands against `meal_planner_dev`.

```powershell
docker compose exec postgres dropdb -U meal_planner --if-exists meal_planner_disposable_test
docker compose exec postgres createdb -U meal_planner meal_planner_disposable_test
```

Set `DATABASE_URL` to that database, apply migrations, and run the tests:

```powershell
uv run alembic -c alembic.ini upgrade head
uv run pytest
```

## Household-management API

Household management uses the household ID in each route; the device's active
household preference is never an authorization input. All routes require a
verified Clerk session and active membership in that exact, non-deleted
household. Owner operations are checked again by the API.

| Method and route | Purpose |
| --- | --- |
| `GET /v1/households/{household_id}` | Read household name, IANA time zone, and caller role. |
| `PATCH /v1/households/{household_id}` | Owner updates name and/or time zone. |
| `GET /v1/households/{household_id}/members` | List active members. Owners receive email; members do not. |
| `GET /v1/households/{household_id}/members/{membership_id}` | Read one active member with the same email privacy rule. |
| `PATCH /v1/households/{household_id}/members/{membership_id}` | Owner changes role to `owner` or `member`. |
| `DELETE /v1/households/{household_id}/members/{membership_id}` | Owner removes an active member. |
| `DELETE /v1/households/{household_id}/leave` | Caller leaves that household; distinct from owner removal. |
| `DELETE /v1/households/{household_id}` | Owner “Delete household” action. The API denies future access and retains associated rows. |
| `GET /v1/households/{household_id}/invitations` | Owner lists unexpired pending invitations; codes and hashes are never returned. |
| `POST /v1/households/{household_id}/invitations/{invitation_id}/reissue` | Owner atomically replaces a pending code; the new raw code is returned once. |

Household write transactions lock the household row before checking role and
changing membership, invitations, household state, or shopping items. This
serializes last-owner checks and “Delete household” against concurrent writes.
At least one active owner must remain. Membership removal preserves its row;
accepting an invitation after a former member was removed creates a new row.

Request-shape errors such as malformed UUIDs are `422`; semantic household
validation is `400`. Owner-invariant failures are `409 LAST_OWNER`; an email
already in that household is `409 HOUSEHOLD_MEMBER_ALREADY_EXISTS`; another
unexpired invitation for the same address is `409 INVITATION_ALREADY_PENDING`.
Invitation acceptance rechecks active membership while holding the household
lock and revokes a now-redundant invitation before returning the member
conflict. Invitation codes remain development-only/manual sharing, expire
after seven days, and are stored only as SHA-256 digests.
