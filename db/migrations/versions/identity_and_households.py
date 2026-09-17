"""Identity and households.

Revision ID: identity_and_households
Revises:
Create Date: 2026-09-04
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "identity_and_households"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            identity_provider TEXT NOT NULL,
            identity_subject TEXT NOT NULL,
            normalized_email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMPTZ,
            CONSTRAINT users_identity_provider_not_blank
                CHECK (char_length(btrim(identity_provider)) > 0),
            CONSTRAINT users_identity_subject_not_blank
                CHECK (char_length(btrim(identity_subject)) > 0),
            CONSTRAINT users_normalized_email_is_canonical
                CHECK (
                    char_length(normalized_email) > 0
                    AND normalized_email = lower(btrim(normalized_email))
                ),
            CONSTRAINT users_display_name_not_blank
                CHECK (char_length(btrim(display_name)) > 0)
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX users_identity_provider_subject_unique
            ON users (identity_provider, identity_subject)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX users_normalized_email_active_unique
            ON users (normalized_email)
            WHERE deleted_at IS NULL
        """
    )

    op.execute(
        """
        CREATE TABLE households (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            time_zone TEXT NOT NULL,
            created_by_user_id UUID NOT NULL
                REFERENCES users (id) ON DELETE RESTRICT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMPTZ,
            CONSTRAINT households_name_not_blank
                CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT households_time_zone_not_blank
                CHECK (char_length(btrim(time_zone)) > 0)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX households_created_by_user_id_index
            ON households (created_by_user_id)
        """
    )

    op.execute(
        """
        CREATE TABLE household_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL
                REFERENCES households (id) ON DELETE RESTRICT,
            user_id UUID NOT NULL
                REFERENCES users (id) ON DELETE RESTRICT,
            role TEXT NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            removed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT household_members_role_is_valid
                CHECK (role IN ('owner', 'member')),
            CONSTRAINT household_members_removed_after_joined
                CHECK (removed_at IS NULL OR removed_at >= joined_at)
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX household_members_active_membership_unique
            ON household_members (household_id, user_id)
            WHERE removed_at IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX household_members_user_id_index
            ON household_members (user_id)
        """
    )

    op.execute(
        """
        CREATE TABLE household_invitations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL
                REFERENCES households (id) ON DELETE RESTRICT,
            normalized_email TEXT NOT NULL,
            invited_role TEXT NOT NULL DEFAULT 'member',
            created_by_user_id UUID NOT NULL
                REFERENCES users (id) ON DELETE RESTRICT,
            token_digest TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            expires_at TIMESTAMPTZ NOT NULL,
            accepted_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT household_invitations_normalized_email_is_canonical
                CHECK (
                    char_length(normalized_email) > 0
                    AND normalized_email = lower(btrim(normalized_email))
                ),
            CONSTRAINT household_invitations_invited_role_is_valid
                CHECK (invited_role IN ('owner', 'member')),
            CONSTRAINT household_invitations_token_digest_not_blank
                CHECK (char_length(btrim(token_digest)) > 0),
            CONSTRAINT household_invitations_status_is_valid
                CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
            CONSTRAINT household_invitations_expires_after_created
                CHECK (expires_at > created_at),
            CONSTRAINT household_invitations_status_timestamps_are_consistent
                CHECK (
                    (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL)
                    OR (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
                    OR (status = 'revoked' AND accepted_at IS NULL AND revoked_at IS NOT NULL)
                    OR (status = 'expired' AND accepted_at IS NULL AND revoked_at IS NULL)
                )
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX household_invitations_token_digest_unique
            ON household_invitations (token_digest)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX household_invitations_pending_email_unique
            ON household_invitations (household_id, normalized_email)
            WHERE status = 'pending'
        """
    )
    op.execute(
        """
        CREATE INDEX household_invitations_created_by_user_id_index
            ON household_invitations (created_by_user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE household_invitations")
    op.execute("DROP TABLE household_members")
    op.execute("DROP TABLE households")
    op.execute("DROP TABLE users")
