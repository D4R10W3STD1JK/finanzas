import { Info, PiggyBank } from "lucide-react";
import { Link } from "react-router";
import { useCategories, useProvisions } from "../api/hooks";
import type { Provision } from "../api/types";
import { IconBadge } from "../components/icons";
import { EmptyState, PageHeader, PageLoader } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { describeFrequency } from "../lib/labels";

/** Medidor: el relleno marca lo acumulado; la pista es un tono más claro de la misma gama. */
function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-sky-100 dark:bg-sky-950" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function daysText(n: number) {
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  return `en ${n} días`;
}

function ProvisionCard({ p }: { p: Provision }) {
  const { data: categories = [] } = useCategories();
  const cat = categories.find((c) => c.id === p.category_id);
  const progress = Number(p.progress);
  const lessThanMonth = p.days_left < 31;

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <IconBadge icon={cat?.icon ?? "calendar"} color={cat?.color ?? "#64748b"} />
        <div className="min-w-0 flex-1">
          <Link to={`/recurrentes/${p.series_id}`} className="block truncate font-medium hover:underline">
            {p.name}
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {describeFrequency(p)} · próximo pago {formatDate(p.due_date)} ({daysText(p.days_left)})
          </p>
        </div>
        <span className="amount font-semibold">{formatMoney(p.amount)}</span>
      </div>

      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">Deberías llevar apartado</span>
        <span>
          <strong className="amount">{formatMoney(p.accumulated)}</strong>{" "}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({progress.toLocaleString("es-ES", { maximumFractionDigits: 0 })} %)
          </span>
        </span>
      </div>
      <div className="mt-1.5">
        <Meter value={progress} label={`${p.name}: ${progress} % acumulado`} />
      </div>

      <p className="mt-3 text-sm">
        {lessThanMonth ? (
          <>
            Falta <strong className="amount">{formatMoney(p.remaining)}</strong> y el pago es {daysText(p.days_left)}: apártalo ya.
          </>
        ) : (
          <>
            Aparta <strong className="amount">{formatMoney(p.monthly_to_go)}/mes</strong> hasta el {formatDate(p.due_date)}.
          </>
        )}
      </p>
      {p.started_late ? (
        <p className="mt-1 flex gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Empezaste a seguirlo el {formatDate(p.cycle_start)}, a mitad de ciclo, así que la hucha arranca de cero y la cuota es mayor que la normal (
          {formatMoney(p.ideal_monthly)}/mes).
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cuota normal: {formatMoney(p.ideal_monthly)}/mes.</p>
      )}
      {p.basis !== "fixed" && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Importe {p.basis === "average" ? "según la media real de los últimos 12 meses" : "estimado"}.
        </p>
      )}
    </div>
  );
}

export default function ProvisionsPage() {
  const { data, isPending } = useProvisions();
  if (isPending || !data) return <PageLoader />;
  const progress = Number(data.progress);

  return (
    <>
      <PageHeader title="Provisiones" subtitle="Hucha virtual para los gastos trimestrales, semestrales y anuales (IBI, seguros…)" />
      {!data.items.length ? (
        <div className="card">
          <EmptyState icon={<PiggyBank className="size-6" />} title="No hay gastos no mensuales">
            Cuando añadas en <Link to="/recurrentes" className="text-brand-600 hover:underline">Recurrentes</Link> un gasto trimestral, semestral o anual,
            aquí verás cuánto apartar cada mes.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="card p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">Aparta cada mes</p>
              <p className="amount mt-1 text-2xl font-semibold">{formatMoney(data.monthly_to_go)}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Para llegar a tiempo a los próximos pagos. En régimen normal serían {formatMoney(data.ideal_monthly)}/mes.
              </p>
            </div>
            <div className="card p-4 lg:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">Hucha virtual</p>
                <p className="text-sm">
                  <strong className="amount text-2xl font-semibold">{formatMoney(data.accumulated)}</strong>{" "}
                  <span className="text-slate-500 dark:text-slate-400">de {formatMoney(data.needed)}</span>
                </p>
              </div>
              <div className="mt-3">
                <Meter value={progress} label={`Hucha virtual: ${progress} %`} />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Lo que deberías tener apartado hoy para {data.items.length === 1 ? "el próximo pago no mensual" : `los ${data.items.length} próximos pagos no mensuales`}. Es
                un cálculo teórico: no mueve dinero.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((p) => (
              <ProvisionCard key={p.series_id} p={p} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
