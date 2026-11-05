"""multiuser: cada usuario con sus propios datos

Revision ID: 0004
Revises: 0003

Añade user_id a todas las tablas de datos. Lo que ya existe pasa a ser del primer usuario
(el creado en la instalación). Las preferencias pasan a ser por usuario y los nombres de
etiqueta solo tienen que ser únicos dentro de cada usuario.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = [
    "accounts",
    "categories",
    "tags",
    "transactions",
    "attachments",
    "recurring_series",
    "recurring_versions",
    "occurrences",
    "budgets",
    "budget_overrides",
    "savings_goals",
    "goal_contributions",
    "app_settings",
]


def upgrade() -> None:
    first_user = "(SELECT MIN(id) FROM users)"
    for table in TABLES:
        op.add_column(table, sa.Column("user_id", sa.Integer(), nullable=True))
        op.execute(f"UPDATE {table} SET user_id = {first_user}")
        # Sin usuarios no puede haber datos que asignar; si los hubiera, mejor fallar aquí que perderlos.
        op.alter_column(table, "user_id", nullable=False)
        op.create_foreign_key(f"fk_{table}_user_id_users", table, "users", ["user_id"], ["id"], ondelete="CASCADE")
        if table != "app_settings":
            op.create_index(f"ix_{table}_user_id", table, ["user_id"])

    op.drop_constraint("pk_app_settings", "app_settings", type_="primary")
    op.create_primary_key("pk_app_settings", "app_settings", ["user_id", "key"])

    op.drop_constraint("uq_tags_name", "tags", type_="unique")
    op.create_unique_constraint("uq_tags_user_id", "tags", ["user_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_tags_user_id", "tags", type_="unique")
    op.create_unique_constraint("uq_tags_name", "tags", ["name"])
    op.drop_constraint("pk_app_settings", "app_settings", type_="primary")
    op.create_primary_key("pk_app_settings", "app_settings", ["key"])
    for table in reversed(TABLES):
        if table != "app_settings":
            op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_constraint(f"fk_{table}_user_id_users", table, type_="foreignkey")
        op.drop_column(table, "user_id")
