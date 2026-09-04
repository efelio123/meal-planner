# Meal Planner API

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
