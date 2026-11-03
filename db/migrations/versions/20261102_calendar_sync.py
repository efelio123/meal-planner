"""One manager and one native calendar writer per household."""

from alembic import op
import sqlalchemy as sa

revision = "calendar_sync"
down_revision = "member_permissions"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE household_calendar_integrations (
        household_id uuid PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
        manager_membership_id uuid REFERENCES household_members(id) ON DELETE SET NULL,
        enabled boolean NOT NULL DEFAULT false,
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        breakfast_time text NOT NULL DEFAULT '08:00' CHECK (breakfast_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        lunch_time text NOT NULL DEFAULT '12:00' CHECK (lunch_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        dinner_time text NOT NULL DEFAULT '18:00' CHECK (dinner_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes IN (15,30,60,90,120)),
        binding_id uuid NOT NULL DEFAULT gen_random_uuid(),
        writer_digest text,
        writer_id uuid,
        writer_label text,
        run_id uuid,
        run_revision integer,
        run_cleanup boolean NOT NULL DEFAULT false,
        run_deadline timestamptz,
        last_success_at timestamptz,
        exported_source_ids uuid[] NOT NULL DEFAULT '{}',
        scan_start date,
        scan_end date,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    op.execute("""INSERT INTO household_calendar_integrations (household_id,manager_membership_id)
        SELECT h.id, (SELECT m.id FROM household_members m
            WHERE m.household_id=h.id AND m.role='owner' AND m.removed_at IS NULL
            ORDER BY (m.user_id=h.created_by_user_id) DESC, m.joined_at, m.id LIMIT 1)
        FROM households h WHERE h.deleted_at IS NULL""")


def downgrade():
    if (
        op.get_bind()
        .execute(
            sa.text("""SELECT EXISTS (SELECT 1 FROM household_calendar_integrations
        WHERE revision > 1 OR writer_digest IS NOT NULL OR enabled OR run_id IS NOT NULL)""")
        )
        .scalar_one()
    ):
        raise RuntimeError(
            "Calendar configuration exists. Review and back up before removing it."
        )
    op.drop_table("household_calendar_integrations")
