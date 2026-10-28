"""Motor de recurrencias puro: fechas, casos límite y tramos."""

from datetime import date

import pytest

from app.domain.calendar_es import BusinessCalendar
from app.domain.recurrence import (
    LAST_DAY,
    BusinessDayAdjust,
    Frequency,
    ScheduleRule,
    Unit,
    build_schedule,
    months_per_period,
    weekdays_only,
)


def dates(rule: ScheduleRule, n: int) -> list[date]:
    it = rule.dates()
    return [next(it) for _ in range(n)]


def scheduled(items) -> list[date]:
    return [i.scheduled for i in items]


class TestFechas:
    def test_dia_31_se_ajusta_al_ultimo_dia_sin_desplazarse(self):
        rule = ScheduleRule(anchor=date(2024, 1, 31), frequency=Frequency.MONTHLY)
        assert dates(rule, 6) == [
            date(2024, 1, 31),
            date(2024, 2, 29),  # bisiesto
            date(2024, 3, 31),  # vuelve al 31, no se queda en el 29
            date(2024, 4, 30),
            date(2024, 5, 31),
            date(2024, 6, 30),
        ]

    def test_dia_31_en_anio_no_bisiesto(self):
        rule = ScheduleRule(anchor=date(2025, 1, 31), frequency=Frequency.MONTHLY)
        assert dates(rule, 3) == [date(2025, 1, 31), date(2025, 2, 28), date(2025, 3, 31)]

    def test_ultimo_dia_del_mes(self):
        rule = ScheduleRule(anchor=date(2023, 1, 15), frequency=Frequency.MONTHLY, day_of_month=LAST_DAY)
        assert dates(rule, 4) == [date(2023, 1, 31), date(2023, 2, 28), date(2023, 3, 31), date(2023, 4, 30)]

    def test_anual_29_de_febrero(self):
        rule = ScheduleRule(anchor=date(2024, 2, 29), frequency=Frequency.YEARLY)
        assert dates(rule, 5) == [
            date(2024, 2, 29),
            date(2025, 2, 28),
            date(2026, 2, 28),
            date(2027, 2, 28),
            date(2028, 2, 29),  # vuelve al 29 en el siguiente bisiesto
        ]

    def test_trimestral_desde_30_de_noviembre(self):
        rule = ScheduleRule(anchor=date(2025, 11, 30), frequency=Frequency.QUARTERLY)
        assert dates(rule, 5) == [
            date(2025, 11, 30),
            date(2026, 2, 28),
            date(2026, 5, 30),
            date(2026, 8, 30),
            date(2026, 11, 30),
        ]

    def test_semestral_cruza_anio(self):
        rule = ScheduleRule(anchor=date(2025, 8, 31), frequency=Frequency.SEMIANNUAL)
        assert dates(rule, 3) == [date(2025, 8, 31), date(2026, 2, 28), date(2026, 8, 31)]

    def test_dia_del_mes_anterior_al_inicio_empieza_el_mes_siguiente(self):
        rule = ScheduleRule(anchor=date(2026, 1, 20), frequency=Frequency.MONTHLY, day_of_month=5)
        assert dates(rule, 3) == [date(2026, 2, 5), date(2026, 3, 5), date(2026, 4, 5)]

    def test_dia_del_mes_posterior_al_inicio_empieza_ese_mes(self):
        rule = ScheduleRule(anchor=date(2026, 1, 3), frequency=Frequency.MONTHLY, day_of_month=5)
        assert dates(rule, 2) == [date(2026, 1, 5), date(2026, 2, 5)]

    def test_diaria_y_semanal(self):
        daily = ScheduleRule(anchor=date(2024, 2, 28), frequency=Frequency.DAILY)
        assert dates(daily, 3) == [date(2024, 2, 28), date(2024, 2, 29), date(2024, 3, 1)]
        weekly = ScheduleRule(anchor=date(2026, 12, 28), frequency=Frequency.WEEKLY)
        assert dates(weekly, 2) == [date(2026, 12, 28), date(2027, 1, 4)]

    def test_personalizada_cada_10_dias(self):
        rule = ScheduleRule(anchor=date(2026, 1, 1), frequency=Frequency.CUSTOM, interval=10, unit=Unit.DAY)
        assert dates(rule, 5) == [
            date(2026, 1, 1),
            date(2026, 1, 11),
            date(2026, 1, 21),
            date(2026, 1, 31),
            date(2026, 2, 10),
        ]

    def test_personalizada_cada_2_semanas_y_cada_2_meses(self):
        weeks = ScheduleRule(anchor=date(2026, 1, 2), frequency=Frequency.CUSTOM, interval=2, unit=Unit.WEEK)
        assert dates(weeks, 3) == [date(2026, 1, 2), date(2026, 1, 16), date(2026, 1, 30)]
        months = ScheduleRule(anchor=date(2025, 12, 31), frequency=Frequency.CUSTOM, interval=2, unit=Unit.MONTH)
        assert dates(months, 3) == [date(2025, 12, 31), date(2026, 2, 28), date(2026, 4, 30)]

    def test_intervalo_multiplica_frecuencia_base(self):
        rule = ScheduleRule(anchor=date(2026, 1, 15), frequency=Frequency.QUARTERLY, interval=2)
        assert dates(rule, 3) == [date(2026, 1, 15), date(2026, 7, 15), date(2027, 1, 15)]

    def test_personalizada_sin_unidad_falla(self):
        with pytest.raises(ValueError):
            dates(ScheduleRule(anchor=date(2026, 1, 1), frequency=Frequency.CUSTOM, interval=3), 1)


class TestAjusteDiaHabil:
    def rule(self, adjust):
        # 28/02/2026 es sábado
        return ScheduleRule(anchor=date(2026, 2, 28), frequency=Frequency.MONTHLY, adjust=adjust)

    def test_anterior_habil(self):
        items = build_schedule([(0, self.rule(BusinessDayAdjust.PREVIOUS))], until=date(2026, 3, 31),
                               is_business_day=weekdays_only)
        assert [(i.scheduled, i.due) for i in items] == [
            (date(2026, 2, 28), date(2026, 2, 27)),
            (date(2026, 3, 28), date(2026, 3, 27)),
        ]

    def test_siguiente_habil(self):
        items = build_schedule([(0, self.rule(BusinessDayAdjust.NEXT))], until=date(2026, 2, 28),
                               is_business_day=weekdays_only)
        assert items[0].due == date(2026, 3, 2)

    def test_sin_ajuste(self):
        items = build_schedule([(0, self.rule(BusinessDayAdjust.NONE))], until=date(2026, 2, 28),
                               is_business_day=weekdays_only)
        assert items[0].due == date(2026, 2, 28)

    def test_festivos_comunitat_valenciana(self):
        cal = BusinessCalendar("ES", "VC")
        # 9/10/2026 (vie) Día de la Comunitat, fin de semana y 12/10 (lun) Fiesta Nacional → martes 13
        rule = ScheduleRule(anchor=date(2026, 10, 9), frequency=Frequency.MONTHLY, adjust=BusinessDayAdjust.NEXT)
        items = build_schedule([(0, rule)], until=date(2026, 10, 31), is_business_day=cal.is_business_day)
        assert items[0].due == date(2026, 10, 13)
        # 19/03/2026 San José (jue), festivo en la Comunitat Valenciana
        assert not cal.is_business_day(date(2026, 3, 19))
        # Semana Santa 2026: Viernes Santo 3/4 y Lunes de Pascua 6/4 → el anterior hábil es el jueves 2
        rule = ScheduleRule(anchor=date(2026, 4, 6), frequency=Frequency.YEARLY, adjust=BusinessDayAdjust.PREVIOUS)
        items = build_schedule([(0, rule)], until=date(2026, 4, 30), is_business_day=cal.is_business_day)
        assert items[0].due == date(2026, 4, 2)


class TestCalendarioSerie:
    def monthly(self, anchor, **kw):
        return ScheduleRule(anchor=anchor, frequency=Frequency.MONTHLY, **kw)

    def test_fecha_fin(self):
        items = build_schedule([(0, self.monthly(date(2026, 1, 10)))], until=date(2030, 1, 1),
                               end_date=date(2026, 4, 10))
        assert scheduled(items) == [date(2026, 1, 10), date(2026, 2, 10), date(2026, 3, 10), date(2026, 4, 10)]

    def test_numero_de_repeticiones(self):
        items = build_schedule([(0, self.monthly(date(2026, 1, 10)))], until=date(2030, 1, 1), max_count=3)
        assert scheduled(items) == [date(2026, 1, 10), date(2026, 2, 10), date(2026, 3, 10)]
        assert [i.index for i in items] == [0, 1, 2]

    def test_until_corta_el_horizonte(self):
        items = build_schedule([(0, self.monthly(date(2026, 1, 10)))], until=date(2026, 3, 9))
        assert scheduled(items) == [date(2026, 1, 10), date(2026, 2, 10)]

    def test_cambio_de_importe_mantiene_fechas(self):
        v1 = self.monthly(date(2026, 1, 1))
        v2 = self.monthly(date(2026, 4, 1))
        items = build_schedule([("v1", v1), ("v2", v2)], until=date(2026, 6, 30))
        assert [(i.key, i.scheduled.month) for i in items] == [
            ("v1", 1), ("v1", 2), ("v1", 3), ("v2", 4), ("v2", 5), ("v2", 6),
        ]

    def test_cambio_de_dia_a_mitad_de_serie(self):
        v1 = self.monthly(date(2026, 1, 1))
        v2 = self.monthly(date(2026, 3, 10), day_of_month=1)  # desde el 10/3, el día 1 → primera el 1/4
        items = build_schedule([("v2", v2), ("v1", v1)], until=date(2026, 5, 31))  # orden de entrada indiferente
        assert [(i.key, i.scheduled) for i in items] == [
            ("v1", date(2026, 1, 1)),
            ("v1", date(2026, 2, 1)),
            ("v1", date(2026, 3, 1)),
            ("v2", date(2026, 4, 1)),
            ("v2", date(2026, 5, 1)),
        ]

    def test_repeticiones_cuentan_toda_la_serie(self):
        v1 = self.monthly(date(2026, 1, 5))
        v2 = self.monthly(date(2026, 3, 5))
        items = build_schedule([(1, v1), (2, v2)], until=date(2030, 1, 1), max_count=4)
        assert [(i.key, i.scheduled.month) for i in items] == [(1, 1), (1, 2), (2, 3), (2, 4)]


def test_meses_por_periodo():
    assert months_per_period(Frequency.MONTHLY) == 1
    assert months_per_period(Frequency.QUARTERLY) == 3
    assert months_per_period(Frequency.YEARLY) == 12
    assert months_per_period(Frequency.CUSTOM, 2, Unit.MONTH) == 2
    assert months_per_period(Frequency.WEEKLY) == pytest.approx(7 * 12 / 365.25)
