import clsx from "clsx";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  ChevronRight,
  Gauge,
  type LucideIcon,
  Plus,
  Table,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { useAccounts, useBudgetMonth, useDashboard, useForecast, useMe, useOccurrences } from "../api/hooks";
import type { Flow } from "../api/types";
import { Balance } from "../components/amount";
import {
  BalanceSparkline,
  CategoryDonut,
  EvolutionLegend,
  EvolutionTable,
  MonthlyEvolutionChart,
  toSlices,
  useToggle,
} from "../components/charts";
import { IconBadge } from "../components/icons";
import { OccurrenceList } from "../components/occurrences";
import { CardHeader, EmptyState, Modal, MonthSwitcher, Skeleton } from "../components/ui";
import { useChartTheme } from "../lib/chartTheme";
import { addDays, formatDate, formatMoney, formatMonth, fromISO, monthRange, todayISO } from "../lib/format";
import { ACCOUNT_TYPES } from "../lib/labels";
import { BudgetMeter } from "./Budgets";
import TransactionForm from "./TransactionForm";

const pct = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

const UPCOMING_VISIBLE = 6;

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return "Buenos días";
  if (h >= 14 && h < 21) return "Buenas tardes";
  return "Buenas noches";
}

/** Variación porcentual en una etiqueta de color; `upIsGood` decide si subir es bueno (ingresos) o malo (gastos). */
function DeltaChip({
  current,
  reference,
  label,
  title,
  upIsGood,
}: {
  current: number;
  reference: number | null;
  label: string;
  title?: string;
  upIsGood: boolean;
}) {
  if (reference === null || reference === 0) return null;
  const change = ((current - reference) / Math.abs(reference)) * 100;
  const rounded = Math.round(change);
  const good = rounded === 0 ? null : change > 0 === upIsGood;
  const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-1.5 text-xs whitespace-nowrap text-fg-subtle" title={title}>
      <span
        className={clsx(
          "amount inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
          good === true && "bg-positive-soft text-positive",
          good === false && "bg-negative-soft text-negative",
          good === null && "bg-surface-2 text-fg-muted",
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
  color,
  current,
  previous,
  average,
  averageMonths,
  previousName,
  upIsGood,
}: {
  label: string;
  previousName: string;
  field: "income" | "expense";
  color: string;
  current: Flow;
  previous: Flow | null | undefined;
  average: Flow | null | undefined;
  averageMonths: number;
  upIsGood: boolean;
}) {
  const value = Number(current[field]);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        <span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
      </div>
      <p className="amount mt-3 mb-2.5 text-[1.625rem] leading-none font-bold tracking-[-0.03em]">{formatMoney(value)}</p>
      <div className="space-y-1">
        <DeltaChip current={value} reference={previous ? Number(previous[field]) : null} label={`vs ${previousName}`} upIsGood={upIsGood} />
        <DeltaChip
          current={value}
          reference={average ? Number(average[field]) : null}
          label={averageMonths === 1 ? "vs media 1 mes" : `vs media ${averageMonths} m`}
          title={`Comparado con la media de los ${averageMonths} meses anteriores`}
          upIsGood={upIsGood}
        />
      </div>
    </div>
  );
}

type Tone = "critical" | "warning" | "info";
const ALERT_TONES: Record<Tone, string> = {
  critical: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-accent-soft text-accent-text",
};

/** Aviso compacto: icono según la gravedad, título, detalle y un enlace o acción. */
function AlertCard({
  tone,
  icon: I,
  title,
  children,
  to,
  onClick,
  action,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: ReactNode;
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  action: string;
}) {
  const body = (
    <>
      <span className={clsx("grid size-9 shrink-0 place-items-center rounded-control", ALERT_TONES[tone])}>
        <I className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[13px] text-fg-subtle">{children}</span>
      </span>
      <span className="inline-flex shrink-0 items-center text-[13px] font-semibold text-accent-text">
        {action}
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </>
  );
  const cls = "card flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60";
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy aria-label="Cargando">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-7 h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <Skeleton className="h-40 rounded-card sm:col-span-2 lg:col-span-1" />
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[5fr_3fr]">
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const today = todayISO();
  const [offset, setOffset] = useState(0);
  const month = monthRange(today, offset).from;
  const me = useMe();
  const dash = useDashboard(offset === 0 ? undefined : month);
  const accounts = useAccounts();
  const pending = useOccurrences({ status: ["planned"], date_to: addDays(today, -1) });
  const upcoming = useOccurrences({ status: ["planned"], date_from: today, date_to: addDays(today, 30) });
  const forecast = useForecast(3);
  const budgets = useBudgetMonth(offset === 0 ? undefined : month);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [activeSlice, setActiveSlice] = useState<string | null>(null);
  const [showTable, toggleTable] = useToggle();
  const [allUpcoming, toggleAllUpcoming] = useToggle();
  const theme = useChartTheme();

  if (dash.isPending || accounts.isPending) return <HomeSkeleton />;
  if (!dash.data) return null;
  const d = dash.data;
  const slices = toSlices(d.expenses_by_category, theme.axis);
  const monthParam = d.month.slice(0, 7);
  const totalExpense = Number(d.current.expense);
  const monthDate = fromISO(d.month);
  const monthName = monthDate.toLocaleDateString("es-ES", { month: "long" });
  const sameYear = monthDate.getFullYear() === fromISO(today).getFullYear();
  const previousName = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1).toLocaleDateString("es-ES", { month: "long" });

  // Saldo: cierre de cada mes con datos; la variación es la del mes mostrado.
  const history = d.balance_history.filter((h) => h.has_data && h.balance !== null).map((h) => Number(h.balance));
  const shown = d.balance_history[d.balance_history.length - 1];
  const before = d.balance_history[d.balance_history.length - 2];
  const monthChange = shown?.balance != null && before?.has_data && before.balance != null ? Number(shown.balance) - Number(before.balance) : null;
  const totalAccounts = (accounts.data ?? []).filter((a) => a.include_in_total).sort((a, b) => Number(b.balance) - Number(a.balance));

  const attention = budgets.data?.items.filter((b) => b.status !== "ok") ?? [];
  const worst = attention.find((b) => b.status === "over") ?? attention[0];
  const below = forecast.data?.first_below_threshold;
  const pendingItems = pending.data ?? [];
  const upcomingItems = upcoming.data ?? [];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-fg-subtle">
            {greeting()}
            {me.data && `, ${me.data.username}`}
          </p>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">
            Resumen de {monthName}
            {!sameYear && ` ${monthDate.getFullYear()}`}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {offset !== 0 && (
            <button className="btn-ghost text-accent-text" onClick={() => setOffset(0)}>
              Volver a hoy
            </button>
          )}
          <MonthSwitcher label={formatMonth(d.month)} onPrev={() => setOffset(offset - 1)} onNext={() => setOffset(offset + 1)} />
          {/* En el móvil ya está el botón «+» de la barra inferior. */}
          <button className="btn-primary hidden min-h-10 lg:inline-flex" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo movimiento
          </button>
        </div>
      </header>

      <section aria-label="Indicadores del mes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="card flex items-stretch justify-between gap-5 overflow-hidden px-5.5 py-5 sm:col-span-2 lg:col-span-1">
          <div className="flex min-w-0 flex-col justify-between gap-3.5">
            <p className="text-[13px] font-medium text-fg-muted">Saldo total hoy</p>
            <div>
              <p className="amount text-[2.5rem] leading-none font-bold tracking-[-0.035em]">
                <Balance value={d.total_balance} />
              </p>
              {monthChange !== null && (
                <p className="mt-2.5 flex items-center gap-2 text-[13px] text-fg-subtle">
                  <span
                    className={clsx(
                      "amount inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                      monthChange >= 0 ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
                    )}
                  >
                    {monthChange >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                    {formatMoney(monthChange, { sign: true })}
                  </span>
                  {d.is_current_month ? "este mes" : `en ${monthName}`}
                </p>
              )}
            </div>
            {totalAccounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {totalAccounts.slice(0, 3).map((a) => (
                  <Link
                    key={a.id}
                    to={`/movimientos?cuenta=${a.id}`}
                    className="amount rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted hover:text-fg"
                  >
                    {a.name} {formatMoney(a.balance)}
                  </Link>
                ))}
                {totalAccounts.length > 3 && (
                  <Link to="/cuentas" className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted hover:text-fg">
                    +{totalAccounts.length - 3}
                  </Link>
                )}
              </div>
            )}
          </div>
          <BalanceSparkline
            values={history}
            label={`Evolución del saldo total en los últimos ${history.length} meses`}
            className="hidden h-24 max-w-64 min-w-28 flex-1 self-end sm:block"
          />
        </div>

        <FlowTile
          label="Ingresos"
          field="income"
          color={theme.income}
          current={d.current}
          previous={d.previous}
          average={d.average}
          averageMonths={d.average_months}
          previousName={previousName}
          upIsGood
        />
        <FlowTile
          label="Gastos"
          field="expense"
          color={theme.expense}
          current={d.current}
          previous={d.previous}
          average={d.average}
          averageMonths={d.average_months}
          previousName={previousName}
          upIsGood={false}
        />
        <div className="card p-5">
          <p className="text-[13px] font-medium text-fg-muted">Ahorro del mes</p>
          <p className={clsx("amount mt-3 mb-3 text-[1.625rem] leading-none font-bold tracking-[-0.03em]", Number(d.current.savings) < 0 && "text-negative")}>
            {formatMoney(d.current.savings)}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, Number(d.current.savings_rate ?? 0)))}%` }} />
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Tasa <strong className="amount text-fg">{pct(d.current.savings_rate)}</strong> · 12 meses{" "}
            <strong className="amount text-fg">{pct(d.last_12_months.savings_rate)}</strong>
          </p>
        </div>
      </section>

      {(below || worst || pendingItems.length > 0) && (
        <section aria-label="Avisos" className="mt-4 grid gap-3 md:grid-cols-2">
          {below && (
            <AlertCard
              tone="critical"
              icon={TriangleAlert}
              to="/prevision"
              action="Ver previsión"
              title={below.date <= today ? "Tu saldo ya está por debajo del umbral" : `Tu saldo bajaría a ${formatMoney(below.balance)}`}
            >
              {below.date <= today
                ? `El umbral de aviso es ${formatMoney(forecast.data!.threshold)}`
                : `El ${formatDate(below.date)}, por debajo del umbral de ${formatMoney(forecast.data!.threshold)}`}
            </AlertCard>
          )}
          {worst && (
            <AlertCard
              tone={worst.status === "over" ? "critical" : "warning"}
              icon={Gauge}
              to="/presupuestos"
              action="Ver"
              title={
                attention.length === 1
                  ? worst.status === "over"
                    ? `${worst.name}: presupuesto superado`
                    : `${worst.name} está al ${Number(worst.pct).toLocaleString("es-ES")} % del presupuesto`
                  : `${attention.length} presupuestos necesitan atención`
              }
            >
              {attention.length === 1
                ? worst.status === "over"
                  ? `Te has pasado ${formatMoney(-Number(worst.remaining))}`
                  : `Quedan ${formatMoney(worst.remaining)} este mes`
                : attention.map((b) => b.name).join(", ")}
            </AlertCard>
          )}
          {pendingItems.length > 0 && (
            <AlertCard
              tone="warning"
              icon={CalendarClock}
              onClick={() => setReviewing(true)}
              action="Revisar"
              title={`${pendingItems.length} ${pendingItems.length === 1 ? "recurrente" : "recurrentes"} por confirmar`}
            >
              <span className="block truncate">{pendingItems.map((o) => o.series_name).join(", ")}</span>
            </AlertCard>
          )}
        </section>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[5fr_3fr]">
        <section className="card min-w-0 p-5">
          <CardHeader
            title="Ingresos y gastos"
            subtitle={<EvolutionLegend inProgress={d.is_current_month && !showTable} />}
            action={
              <button className="btn-ghost px-2 py-1 text-xs" onClick={toggleTable}>
                {showTable ? <ChartColumn className="size-3.5" /> : <Table className="size-3.5" />}
                {showTable ? "Ver gráfico" : "Ver tabla"}
              </button>
            }
          />
          {!d.evolution.some((m) => m.has_data) ? (
            <EmptyState icon={<ChartColumn className="size-6" />} title="Aún no hay meses con movimientos">
              La evolución aparecerá en cuanto apuntes tus primeros ingresos y gastos.
            </EmptyState>
          ) : showTable ? (
            <EvolutionTable data={d.evolution} />
          ) : (
            <MonthlyEvolutionChart data={d.evolution} lastInProgress={d.is_current_month} />
          )}
        </section>

        <section className="card min-w-0 p-5">
          <CardHeader
            title="Gastos por categoría"
            subtitle={<span className="inline-block first-letter:uppercase">{formatMonth(d.month)}</span>}
            action={
              slices.length > 0 && (
                <Link to={`/movimientos?mes=${monthParam}&tipo=expense`} className="link text-[13px]">
                  Detalle
                </Link>
              )
            }
          />
          {slices.length ? (
            <div className="flex flex-wrap items-center gap-5">
              <div className="mx-auto w-40 shrink-0">
                <CategoryDonut slices={slices} total={totalExpense} active={activeSlice} onActive={setActiveSlice} />
              </div>
              <ul className="min-w-48 flex-1 space-y-0.5">
                {slices.map((s) => (
                  <li key={s.key}>
                    <Link
                      to={s.key === "otras" ? `/movimientos?mes=${monthParam}&tipo=expense` : `/movimientos?mes=${monthParam}&categoria=${s.categoryId ?? -1}`}
                      onMouseEnter={() => setActiveSlice(s.key)}
                      onMouseLeave={() => setActiveSlice(null)}
                      className={clsx(
                        "flex min-h-8 items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-surface-2",
                        activeSlice === s.key && "bg-surface-2",
                      )}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="amount font-semibold">{formatMoney(s.value)}</span>
                      <span className="amount w-11 text-right text-xs text-fg-subtle">{pct(s.share)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={<ChartColumn className="size-6" />} title="Sin gastos este mes" />
          )}
        </section>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[5fr_3fr]">
        <section className="card min-w-0 px-5 pt-5 pb-2">
          <CardHeader
            title="Próximos 30 días"
            subtitle={
              d.upcoming.count > 0 && (
                <>
                  Cobros <strong className="amount text-positive">{formatMoney(d.upcoming.income)}</strong> · Pagos{" "}
                  <strong className="amount text-fg">{formatMoney(d.upcoming.expense)}</strong>
                </>
              )
            }
            action={
              <Link to="/recurrentes" className="link text-[13px]">
                Recurrentes
              </Link>
            }
          />
          {upcomingItems.length ? (
            <>
              <OccurrenceList items={allUpcoming ? upcomingItems : upcomingItems.slice(0, UPCOMING_VISIBLE)} dateBlock />
              {upcomingItems.length > UPCOMING_VISIBLE && (
                <button className="btn-ghost mb-2 w-full text-[13px]" onClick={toggleAllUpcoming}>
                  {allUpcoming ? "Mostrar menos" : `Mostrar los ${upcomingItems.length}`}
                </button>
              )}
            </>
          ) : (
            <EmptyState icon={<CalendarCheck className="size-6" />} title="Nada previsto">
              Crea tus gastos e ingresos fijos en{" "}
              <Link to="/recurrentes" className="link">
                Recurrentes
              </Link>
              .
            </EmptyState>
          )}
        </section>

        <div className="grid gap-5">
          {budgets.data && budgets.data.items.length > 0 && (
            <section className="card p-5">
              <CardHeader
                title="Presupuestos"
                subtitle={budgets.data.is_current_month && `Llevas el ${Number(budgets.data.month_elapsed_pct).toLocaleString("es-ES")} % del mes`}
                action={
                  <Link to="/presupuestos" className="link text-[13px]">
                    Ver todos
                  </Link>
                }
              />
              <ul className="space-y-4">
                {[...budgets.data.items]
                  .sort((a, b) => Number(b.pct) - Number(a.pct))
                  .slice(0, 4)
                  .map((b) => (
                    <li key={b.budget_id}>
                      <div className="mb-2 flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate font-semibold">{b.name}</span>
                        <span className="amount text-fg-subtle">
                          <strong className={clsx("font-semibold", b.status === "over" ? "text-danger" : b.status === "warning" ? "text-warning" : "text-fg")}>
                            {formatMoney(b.spent)}
                          </strong>{" "}
                          / {formatMoney(b.limit)}
                        </span>
                      </div>
                      <BudgetMeter item={b} elapsedPct={budgets.data.is_current_month ? Number(budgets.data.month_elapsed_pct) : undefined} />
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="card px-5 pt-5 pb-2">
            <CardHeader
              title="Cuentas"
              action={
                <Link to="/cuentas" className="link text-[13px]">
                  Gestionar
                </Link>
              }
            />
            {accounts.data?.length ? (
              <ul className="divide-y divide-line">
                {accounts.data.map((a) => (
                  <li key={a.id}>
                    <Link to={`/movimientos?cuenta=${a.id}`} className="flex items-center gap-3 py-3">
                      <IconBadge icon={a.icon} color={a.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="text-xs text-fg-subtle">{ACCOUNT_TYPES[a.type]}</p>
                      </div>
                      <Balance value={a.balance} className="text-sm font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Plus className="size-6" />} title="Aún no hay cuentas">
                <Link to="/cuentas" className="link">
                  Crea tu primera cuenta
                </Link>{" "}
                para empezar.
              </EmptyState>
            )}
          </section>
        </div>
      </div>

      <Modal open={reviewing} onClose={() => setReviewing(false)} title="Pendientes de confirmar">
        <p className="mb-2 text-sm text-fg-subtle">Recurrentes vencidos que no se confirman solos (importe variable o gestionados a mano).</p>
        {pendingItems.length ? (
          <OccurrenceList items={pendingItems} />
        ) : (
          <EmptyState icon={<CalendarCheck className="size-6" />} title="Todo confirmado" />
        )}
      </Modal>
      <TransactionForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
