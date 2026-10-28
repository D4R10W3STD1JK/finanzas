import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, CalendarCheck, TriangleAlert, ChartColumn, ChevronLeft, ChevronRight, CircleAlert, Plus, Table } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAccounts, useBudgetMonth, useDashboard, useForecast, useOccurrences } from "../api/hooks";
import type { Flow } from "../api/types";
import { Balance } from "../components/amount";
import { CategoryDonut, EvolutionLegend, EvolutionTable, MonthlyEvolutionChart, toSlices, useToggle } from "../components/charts";
import { IconBadge } from "../components/icons";
import { OccurrenceList } from "../components/occurrences";
import { EmptyState, PageHeader, PageLoader } from "../components/ui";
import { useChartTheme } from "../lib/chartTheme";
import { addDays, formatDate, formatMoney, formatMonth, monthRange, todayISO } from "../lib/format";
import { ACCOUNT_TYPES } from "../lib/labels";
import { BudgetMeter } from "./Budgets";
import TransactionForm from "./TransactionForm";

const pct = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

/** Variación porcentual con flecha; `upIsGood` decide si subir es bueno (ingresos) o malo (gastos). */
function Delta({ current, reference, label, upIsGood }: { current: number; reference: number | null; label: string; upIsGood: boolean }) {
  if (reference === null || reference === 0) return null;
  const change = ((current - reference) / Math.abs(reference)) * 100;
  const rounded = Math.round(change);
  const good = rounded === 0 ? null : change > 0 === upIsGood;
  const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      <span
        className={clsx(
          "inline-flex items-center gap-0.5 font-medium",
          good === true && "text-income",
          good === false && "text-expense",
        )}
      >
        <Arrow className="size-3.5" aria-hidden />
        {rounded > 0 ? "+" : ""}
        {rounded.toLocaleString("es-ES")} %
      </span>
      {label}
    </p>
  );
}

function FlowTile({
  label,
  field,
  current,
  previous,
  average,
  averageMonths,
  upIsGood,
}: {
  label: string;
  field: "income" | "expense";
  current: Flow;
  previous: Flow | null | undefined;
  average: Flow | null | undefined;
  averageMonths: number;
  upIsGood: boolean;
}) {
  const value = Number(current[field]);
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="amount mt-1 text-2xl font-semibold">{formatMoney(value)}</p>
      <div className="mt-1.5 space-y-0.5">
        <Delta current={value} reference={previous ? Number(previous[field]) : null} label="vs mes anterior" upIsGood={upIsGood} />
        <Delta
          current={value}
          reference={average ? Number(average[field]) : null}
          label={`vs media de ${averageMonths} ${averageMonths === 1 ? "mes" : "meses"}`}
          upIsGood={upIsGood}
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  const today = todayISO();
  const [offset, setOffset] = useState(0);
  const month = monthRange(today, offset).from;
  const dash = useDashboard(offset === 0 ? undefined : month);
  const accounts = useAccounts();
  const pending = useOccurrences({ status: ["planned"], date_to: addDays(today, -1) });
  const upcoming = useOccurrences({ status: ["planned"], date_from: today, date_to: addDays(today, 30) });
  const forecast = useForecast(3);
  const budgets = useBudgetMonth(offset === 0 ? undefined : month);
  const [creating, setCreating] = useState(false);
  const [activeSlice, setActiveSlice] = useState<string | null>(null);
  const [showTable, toggleTable] = useToggle();
  const theme = useChartTheme();

  if (dash.isPending || accounts.isPending) return <PageLoader />;
  if (!dash.data) return null;
  const d = dash.data;
  const slices = toSlices(d.expenses_by_category, theme.axis);
  const monthParam = d.month.slice(0, 7);
  const totalExpense = Number(d.current.expense);

  return (
    <>
      <PageHeader
        title="Inicio"
        subtitle={
          <span className="inline-flex items-center gap-1">
            <button className="btn-ghost p-1" onClick={() => setOffset(offset - 1)} aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-28 text-center first-letter:uppercase">
              {formatMonth(d.month)}
              {d.is_current_month && " (en curso)"}
            </span>
            <button className="btn-ghost p-1" onClick={() => setOffset(offset + 1)} aria-label="Mes siguiente">
              <ChevronRight className="size-4" />
            </button>
            {offset !== 0 && (
              <button className="ml-1 text-brand-600 hover:underline dark:text-brand-500" onClick={() => setOffset(0)}>
                Volver a hoy
              </button>
            )}
          </span>
        }
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo movimiento
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white sm:col-span-2 lg:col-span-1 dark:from-brand-700 dark:to-emerald-900">
          <p className="text-sm opacity-85">Saldo total hoy</p>
          <p className="amount mt-1 text-3xl font-semibold">{formatMoney(d.total_balance)}</p>
          <p className="mt-1.5 text-xs opacity-85">
            {(() => {
              const n = accounts.data?.filter((a) => a.include_in_total).length ?? 0;
              return `En ${n} ${n === 1 ? "cuenta" : "cuentas"}`;
            })()}
          </p>
        </div>
        <FlowTile label="Ingresos" field="income" current={d.current} previous={d.previous} average={d.average} averageMonths={d.average_months} upIsGood />
        <FlowTile label="Gastos" field="expense" current={d.current} previous={d.previous} average={d.average} averageMonths={d.average_months} upIsGood={false} />
        <div className="card p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Ahorro del mes</p>
          <p className={clsx("amount mt-1 text-2xl font-semibold", Number(d.current.savings) < 0 && "text-expense")}>
            {formatMoney(d.current.savings)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Tasa de ahorro <strong className="text-slate-900 dark:text-slate-100">{pct(d.current.savings_rate)}</strong>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Últimos 12 meses <strong className="text-slate-900 dark:text-slate-100">{pct(d.last_12_months.savings_rate)}</strong>
          </p>
        </div>
      </div>

      {forecast.data?.first_below_threshold && (
        <Link
          to="/prevision"
          className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm hover:underline dark:border-red-900/60 dark:bg-red-950/40"
        >
          <TriangleAlert className="size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
          <span>
            <strong>Aviso de previsión:</strong> el {formatDate(forecast.data.first_below_threshold.date)} tu saldo total bajaría a{" "}
            <strong className="amount">{formatMoney(forecast.data.first_below_threshold.balance)}</strong>, por debajo del umbral de{" "}
            {formatMoney(forecast.data.threshold)}. Ver previsión
          </span>
        </Link>
      )}

      {budgets.data && budgets.data.items.some((b) => b.status !== "ok") && (
        <section className="mt-6 card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <CircleAlert className="size-4.5 text-amber-500" aria-hidden /> Presupuestos que necesitan atención
            </h2>
            <Link to="/presupuestos" className="text-sm text-brand-600 hover:underline dark:text-brand-500">
              Ver todos
            </Link>
          </div>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {budgets.data.items
              .filter((b) => b.status !== "ok")
              .map((b) => (
                <li key={b.budget_id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate">{b.name}</span>
                    <span className="amount text-slate-500 dark:text-slate-400">
                      {formatMoney(b.spent)} / {formatMoney(b.limit)}
                    </span>
                  </div>
                  <BudgetMeter item={b} elapsedPct={budgets.data.is_current_month ? Number(budgets.data.month_elapsed_pct) : undefined} />
                  <p className={`mt-0.5 text-xs ${b.status === "over" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {b.status === "over" ? `Superado en ${formatMoney(-Number(b.remaining))}` : `${Number(b.pct).toLocaleString("es-ES")} % gastado · quedan ${formatMoney(b.remaining)}`}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      )}

      {(pending.data?.length ?? 0) > 0 && (
        <section className="mt-6 card border-amber-300 p-4 dark:border-amber-500/40">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <CircleAlert className="size-4.5 text-amber-500" /> Pendientes de confirmar
          </h2>
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            Recurrentes vencidos que no se confirman solos (importe variable o gestionados a mano).
          </p>
          <OccurrenceList items={pending.data!} />
        </section>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
        <section className="card p-4 lg:col-span-2">
          <h2 className="font-semibold">Gastos por categoría</h2>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400 first-letter:uppercase">{formatMonth(d.month)}</p>
          {slices.length ? (
            <>
              <CategoryDonut slices={slices} total={totalExpense} active={activeSlice} onActive={setActiveSlice} />
              <ul className="mt-4 space-y-0.5">
                {slices.map((s) => (
                  <li key={s.key}>
                    <Link
                      to={s.key === "otras" ? `/movimientos?mes=${monthParam}&tipo=expense` : `/movimientos?mes=${monthParam}&categoria=${s.categoryId ?? -1}`}
                      onMouseEnter={() => setActiveSlice(s.key)}
                      onMouseLeave={() => setActiveSlice(null)}
                      className={clsx(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60",
                        activeSlice === s.key && "bg-slate-50 dark:bg-slate-800/60",
                      )}
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="amount font-medium">{formatMoney(s.value)}</span>
                      <span className="amount w-12 text-right text-xs text-slate-500 dark:text-slate-400">{pct(s.share)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState icon={<ChartColumn className="size-6" />} title="Sin gastos este mes" />
          )}
        </section>

        <section className="card p-4 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Evolución de los últimos 12 meses</h2>
              <div className="mt-1">
                <EvolutionLegend />
              </div>
            </div>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={toggleTable}>
              {showTable ? <ChartColumn className="size-3.5" /> : <Table className="size-3.5" />}
              {showTable ? "Ver gráfico" : "Ver tabla"}
            </button>
          </div>
          {!d.evolution.some((m) => m.has_data) ? (
            <EmptyState icon={<ChartColumn className="size-6" />} title="Aún no hay meses con movimientos">
              La evolución aparecerá en cuanto apuntes tus primeros ingresos y gastos.
            </EmptyState>
          ) : showTable ? (
            <EvolutionTable data={d.evolution} />
          ) : (
            <MonthlyEvolutionChart data={d.evolution} />
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card p-4 lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Próximos 30 días</h2>
            {d.upcoming.count > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Cobros <strong className="amount text-income">{formatMoney(d.upcoming.income)}</strong> · Pagos{" "}
                <strong className="amount text-slate-900 dark:text-slate-100">{formatMoney(d.upcoming.expense)}</strong>
              </span>
            )}
          </div>
          {upcoming.data?.length ? (
            <OccurrenceList items={upcoming.data} />
          ) : (
            <EmptyState icon={<CalendarCheck className="size-6" />} title="Nada previsto">
              Crea tus gastos e ingresos fijos en <Link to="/recurrentes" className="text-brand-600 hover:underline">Recurrentes</Link>.
            </EmptyState>
          )}
        </section>

        <section className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Cuentas</h2>
            <Link to="/cuentas" className="text-sm text-brand-600 hover:underline dark:text-brand-500">
              Gestionar
            </Link>
          </div>
          {accounts.data?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.data.map((a) => (
                <li key={a.id}>
                  <Link to={`/movimientos?cuenta=${a.id}`} className="flex items-center gap-3 py-2.5">
                    <IconBadge icon={a.icon} color={a.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{ACCOUNT_TYPES[a.type]}</p>
                    </div>
                    <Balance value={a.balance} className="text-sm font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Plus className="size-6" />} title="Aún no hay cuentas">
              <Link to="/cuentas" className="text-brand-600 hover:underline">Crea tu primera cuenta</Link> para empezar.
            </EmptyState>
          )}
        </section>
      </div>

      <TransactionForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
