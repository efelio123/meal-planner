"""Explicit per-member content permissions."""

from alembic import op
import sqlalchemy as sa

revision = "member_permissions"
down_revision = "recipe_ingredient_sections"
branch_labels = None
depends_on = None
KEYS = (
    "shopping.add",
    "shopping.check",
    "shopping.edit",
    "shopping.remove",
    "shopping.clear_purchased",
    "shopping.clear_all",
    "recipes.create",
    "recipes.edit",
    "recipes.archive",
    "recipes.restore",
    "plan.add",
    "plan.edit",
    "plan.remove",
    "catalog.items.create",
    "catalog.items.edit",
    "catalog.items.archive",
    "catalog.categories.create",
    "catalog.categories.edit",
    "catalog.categories.archive",
    "catalog.stores.create",
    "catalog.stores.edit",
    "catalog.stores.archive",
    "catalog.units.create",
    "catalog.units.edit",
    "catalog.units.archive",
)


def upgrade():
    op.add_column(
        "household_members",
        sa.Column(
            "permissions_revision", sa.Integer(), nullable=False, server_default="1"
        ),
    )
    op.create_check_constraint(
        "ck_members_permissions_revision",
        "household_members",
        "permissions_revision > 0",
    )
    op.create_table(
        "household_member_permissions",
        sa.Column(
            "membership_id",
            sa.UUID(),
            sa.ForeignKey("household_members.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("action_key", sa.Text(), primary_key=True),
        sa.CheckConstraint(
            "action_key IN (" + ",".join("'" + key + "'" for key in KEYS) + ")",
            name="ck_member_permission_action",
        ),
    )
    connection = op.get_bind()
    for key in KEYS:
        connection.execute(
            sa.text("""INSERT INTO household_member_permissions (membership_id, action_key)
            SELECT id, :key FROM household_members WHERE role='member' AND removed_at IS NULL"""),
            {"key": key},
        )


def downgrade():
    connection = op.get_bind()
    changed = connection.execute(
        sa.text("""SELECT 1 FROM household_members hm
        WHERE hm.permissions_revision > 1 OR (hm.role='member' AND hm.removed_at IS NULL AND
        (SELECT count(*) FROM household_member_permissions p WHERE p.membership_id=hm.id) != :count) LIMIT 1"""),
        {"count": len(KEYS)},
    ).scalar_one_or_none()
    if changed:
        raise RuntimeError(
            "Saved member permissions would be lost. Use an explicitly reviewed recovery plan."
        )
    op.drop_table("household_member_permissions")
    op.drop_constraint(
        "ck_members_permissions_revision", "household_members", type_="check"
    )
    op.drop_column("household_members", "permissions_revision")
