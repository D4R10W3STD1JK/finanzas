from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.domain.recurrence import ScheduleRule
from app.models.core import Account, Category, Money, Tag, TimestampMixin, Transaction
from app.models.enums import (
    AmountMode,
    BusinessDayAdjust,
    Frequency,
    OccurrenceStatus,
    TransactionKind,
    Unit,
    str_enum,
)


class RecurringSeries(TimestampMixin, Base):
    """Identidad de una serie recurrente. Las condiciones que cambian con el tiempo
    (importe, día, cuenta...) viven en sus versiones (``RecurringVersion``)."""

    __tablename__ = "recurring_series"
    __table_args__ = (
        CheckConstraint("kind <> 'adjustment'", name="no_adjustment"),
        CheckConstraint("max_occurrences IS NULL OR max_occurrences > 0", name="max_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[TransactionKind] = mapped_column(str_enum(TransactionKind))
    is_subscription: Mapped[bool] = mapped_column(Boolean, default=False)
    # Confirmar solas las ocurrencias de importe fijo cuando llega su fecha.
    auto_confirm: Mapped[bool] = mapped_column(Boolean, default=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    max_occurrences: Mapped[int | None] = mapped_column(Integer)
    # No se crean ocurrencias con fecha anterior a esta. Evita que dar de alta una serie
    # antigua (p. ej. el alquiler desde 2019) genere movimientos pasados que descuadren saldos.
    track_from: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    versions: Mapped[list["RecurringVersion"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="RecurringVersion.effective_from",
    )
    occurrences: Mapped[list["Occurrence"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="Occurrence.scheduled_date",
    )

    def version_at(self, d: date) -> "RecurringVersion | None":
        current = None
        for v in self.versions:
            if v.effective_from <= d:
                current = v
        return current or (self.versions[0] if self.versions else None)


recurring_version_tags = Table(
    "recurring_version_tags",
    Base.metadata,
    Column("version_id", ForeignKey("recurring_versions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class RecurringVersion(Base):
    """Tramo de una serie, vigente desde ``effective_from`` hasta el siguiente tramo."""

    __tablename__ = "recurring_versions"
    __table_args__ = (
        UniqueConstraint("series_id", "effective_from"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("interval >= 1", name="interval_positive"),
        CheckConstraint(
            "day_of_month IS NULL OR day_of_month = -1 OR day_of_month BETWEEN 1 AND 31",
            name="day_of_month_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_series.id", ondelete="CASCADE"), index=True
    )
    effective_from: Mapped[date] = mapped_column(Date)
    frequency: Mapped[Frequency] = mapped_column(str_enum(Frequency))
    interval: Mapped[int] = mapped_column(Integer, default=1)
    unit: Mapped[Unit | None] = mapped_column(str_enum(Unit))
    day_of_month: Mapped[int | None] = mapped_column(Integer)
    business_day_adjust: Mapped[BusinessDayAdjust] = mapped_column(
        str_enum(BusinessDayAdjust), default=BusinessDayAdjust.NONE
    )
    amount_mode: Mapped[AmountMode] = mapped_column(str_enum(AmountMode), default=AmountMode.FIXED)
    # En importes variables es el importe estimado.
    amount: Mapped[Decimal] = mapped_column(Money)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    concept: Mapped[str] = mapped_column(String(200))

    series: Mapped[RecurringSeries] = relationship(back_populates="versions")
    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    to_account: Mapped[Account | None] = relationship(foreign_keys=[to_account_id])
    category: Mapped[Category | None] = relationship()
    tags: Mapped[list[Tag]] = relationship(secondary=recurring_version_tags, order_by=Tag.name)

    def rule(self) -> ScheduleRule:
        return ScheduleRule(
            anchor=self.effective_from,
            frequency=self.frequency,
            interval=self.interval,
            unit=self.unit,
            day_of_month=self.day_of_month,
            adjust=self.business_day_adjust,
        )


class Occurrence(Base):
    __tablename__ = "occurrences"
    __table_args__ = (UniqueConstraint("series_id", "scheduled_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_series.id", ondelete="CASCADE"), index=True
    )
    version_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_versions.id", ondelete="SET NULL")
    )
    # Fecha teórica según la regla: identifica la ocurrencia dentro de la serie.
    scheduled_date: Mapped[date] = mapped_column(Date)
    # Fecha prevista real (tras ajuste a día hábil o edición manual).
    due_date: Mapped[date] = mapped_column(Date, index=True)
    expected_amount: Mapped[Decimal] = mapped_column(Money)
    status: Mapped[OccurrenceStatus] = mapped_column(
        str_enum(OccurrenceStatus), default=OccurrenceStatus.PLANNED, index=True
    )
    # Editada a mano: la regeneración de la serie no la toca y no se autoconfirma.
    is_overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)

    series: Mapped[RecurringSeries] = relationship(back_populates="occurrences")
    version: Mapped[RecurringVersion | None] = relationship()
    transaction: Mapped[Transaction | None] = relationship(back_populates="occurrence")
