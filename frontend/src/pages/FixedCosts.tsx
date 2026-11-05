import { CalendarClock } from "lucide-react";
import { Link } from "react-router";
import { useCategories, useRecurringCosts } from "../api/hooks";
import type { RecurringCost } from "../api/types";
import { IconBadge } from "../components/icons";
import { Badge, EmptyState, PageHeader, PageSkeleton } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { describeFrequency } from "../lib/labels";

function BasisNote({ item }: { item: RecurringCost }) {
  if (item.basis === "average")
    return (
      <span title={`Media de ${item.last_12m_count} recibos reales de los últimos 12 meses`}>
        media real ({item.last_12m_count} recibos)
      </span>
    );
  if (item.basis === "estimate") return <span>estimado</span>;
  return null;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "income" | "expense" }) {
  return (
    <div className="card p-5">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

function CostTable({ items, title, total }: { items: RecurringCost[]; title: string; total: number }) {
  const { data: categories = [] } = useCategories();
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => Number(i.monthly)));

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="card-title">{title}</h2>
        <span className="text-sm text-fg-subtle">
          <strong className="amount text-fg">{formatMoney(total)}</strong> al mes
        </span>
      </div>
      {/* Cabecera solo en pantallas anchas; en móvil cada fila se apila */}
      <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_4rem] gap-3 border-b border-line pb-2 text-xs font-medium text-fg-subtle md:grid">
        <span>Concepto</span>
        <span className="text-right">Cada pago</span>
        <span className="text-right">Al mes</span>
        <span className="text-right">Al año</span>
        <span className="text-right">% total</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((i) => {
          const cat = categories.find((c) => c.id === i.category_id);
          const share = total ? (Number(i.monthly) / total) * 100 : 0;
          return (
            <li key={i.series_id} className="py-2.5">
              <Link
                to={`/recurrentes/${i.series_id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_4rem]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <IconBadge icon={cat?.icon ?? "repeat"} color={cat?.color ?? "#64748b"} size="sm" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium hover:underline">
                      {i.name}
                      {i.is_subscription && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Suscripción</Badge>}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {describeFrequency(i)}
                      {i.basis !== "fixed" && " · "}
                      <BasisNote item={i} />
                    </span>
                  </span>
                </span>
                <span className="amount hidden text-right text-sm text-fg-subtle md:block">{formatMoney(i.base_amount)}</span>
                <span className="amount text-right text-sm font-semibold">{formatMoney(i.monthly)}</span>
                <span className="amount hidden text-right text-sm md:block">{formatMoney(i.annual)}</span>
                <span className="amount hidden text-right text-xs text-fg-subtle md:block">
                  {share.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
                </span>
                {/* Barra de magnitud: mismo tono para todas, la longitud es el dato */}
                <span className="col-span-full flex items-center gap-2 pl-10">
                  <span className="h-1.5 flex-1 rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(Number(i.monthly) / max) * 100}%` }} />
                  </span>
                  <span className="amount text-xs text-fg-subtle md:hidden">{formatMoney(i.annual)}/año</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function FixedCostsPage() {
  const { data, isPending } = useRecurringCosts();
  if (isPending) return <PageSkeleton />;
  if (!data) return null;

  const expenses = data.items.filter((i) => i.kind === "expense");
  const incomes = data.items.filter((i) => i.kind === "income");
  const transfers = data.items.filter((i) => i.kind === "transfer");
  const net = Number(data.net_monthly);
  const nextBig = expenses
    .filter((i) => i.next_due_date && ["quarterly", "semiannual", "yearly"].includes(i.frequency))
    .sort((a, b) => a.next_due_date!.localeCompare(b.next_due_date!))[0];

  return (
    <>
      <PageHeader
        title="Gastos fijos"
        subtitle="Todos tus recurrentes convertidos a su coste mensual y anual, sea cual sea su frecuencia"
      />
      {!data.items.length ? (
        <div className="card">
          <EmptyState icon={<CalendarClock className="size-6" />} title="Aún no hay recurrentes activos">
            Añádelos en <Link to="/recurrentes" className="text-accent-text hover:underline">Recurrentes</Link>.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Gastos fijos al mes" value={formatMoney(data.expense.monthly)} sub={`${data.expense.count} recurrentes`} />
            <Tile label="Gastos fijos al año" value={formatMoney(data.expense.annual)} />
            <Tile label="Ingresos fijos al mes" value={formatMoney(data.income.monthly)} tone="income" />
            <Tile
              label="Margen mensual"
              value={formatMoney(net)}
              tone={net < 0 ? "expense" : undefined}
              sub={
                Number(data.income.monthly) > 0
                  ? `Los fijos se llevan el ${((Number(data.expense.monthly) / Number(data.income.monthly)) * 100).toLocaleString("es-ES", { maximumFractionDigits: 0 })} % de tus ingresos fijos`
                  : "Ingresos fijos menos gastos fijos"
              }
            />
          </div>
          {nextBig && (
            <p className="mt-3 text-sm text-fg-subtle">
              Próximo pago no mensual: <strong className="text-fg">{nextBig.name}</strong> el {formatDate(nextBig.next_due_date)} por{" "}
              <strong className="amount text-fg">{formatMoney(nextBig.next_amount)}</strong> (equivale a {formatMoney(nextBig.monthly)} al mes).
            </p>
          )}
          <div className="mt-6 space-y-6">
            <CostTable title="Gastos" items={expenses} total={Number(data.expense.monthly)} />
            <CostTable title="Ingresos" items={incomes} total={Number(data.income.monthly)} />
            <CostTable title="Transferencias periódicas (ahorro, traspasos)" items={transfers} total={Number(data.transfer.monthly)} />
          </div>
          <p className="mt-4 text-xs text-fg-subtle">
            En los recibos variables se usa la media de los importes reales de los últimos 12 meses; si aún no hay ninguno, el importe estimado.
          </p>
        </>
      )}
    </>
  );
}
