"""Scoped widget devices, durable acknowledgements and check-state fencing."""

import sqlalchemy as sa
from alembic import op

revision = "widget_devices"
down_revision = "calendar_sync"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE shopping_list_items ADD COLUMN check_version bigint NOT NULL DEFAULT 1 CHECK (check_version > 0)"
    )
    op.execute("""CREATE FUNCTION advance_shopping_check_version() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.check_version := OLD.check_version + 1; RETURN NEW; END $$""")
    # Explicit same-state check/re-add is also a new intent, including old app clients.
    op.execute("""CREATE TRIGGER shopping_check_version BEFORE UPDATE OF is_checked
        ON shopping_list_items FOR EACH ROW EXECUTE FUNCTION advance_shopping_check_version()""")
    op.execute("""CREATE TABLE widget_devices (
        id uuid PRIMARY KEY,
        household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        membership_id uuid NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
        generation uuid NOT NULL,
        secret_digest text NOT NULL UNIQUE CHECK (length(secret_digest)=64),
        permissions_revision integer NOT NULL,
        registered_role text NOT NULL CHECK (registered_role IN ('owner','member')),
        week_start integer NOT NULL CHECK (week_start BETWEEN 0 AND 6),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    op.execute(
        "CREATE INDEX widget_devices_user_home ON widget_devices(user_id,household_id)"
    )
    op.execute("""CREATE TABLE widget_operations (
        device_id uuid NOT NULL REFERENCES widget_devices(id) ON DELETE CASCADE,
        operation_id uuid NOT NULL,
        request_digest text NOT NULL,
        result jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(device_id,operation_id)
    )""")


def downgrade():
    if (
        op.get_bind()
        .execute(sa.text("SELECT EXISTS(SELECT 1 FROM widget_devices)"))
        .scalar_one()
    ):
        raise RuntimeError(
            "Widget connections exist. Revoke, back up and review before removing them."
        )
    op.drop_table("widget_operations")
    op.drop_table("widget_devices")
    op.execute("DROP TRIGGER shopping_check_version ON shopping_list_items")
    op.execute("DROP FUNCTION advance_shopping_check_version()")
    op.drop_column("shopping_list_items", "check_version")
