import { ArrowLeft, Pencil, Settings2, Trash } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAccounts, useCategories, useDeleteSeries, useSeries } from "../api/hooks";
import { Amount } from "../components/amount";
import { OccurrenceList } from "../components/occurrences";
import { Badge, ConfirmDialog, ErrorBox, PageHeader, PageLoader } from "../components/ui";
import { formatDate, todayISO } from "../lib/format";
import { ADJUSTS, KIND_LABELS, describeFrequency } from "../lib/labels";
import SeriesForm, { type SeriesFormMode } from "./SeriesForm";

export default function SeriesDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: s, isPending, error } = useSeries(id);
  const { data: accounts = [] } = useAccounts(true);
  const { data: categories = [] } = useCategories();
  const remove = useDeleteSeries();
  const [form, setForm] = useState<SeriesFormMode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  if (isPending) return <PageLoader />;
  if (!s) return <ErrorBox error={error} />;

  const today = todayISO();
  const past = s.occurrences.filter((o) => o.due_date < today).reverse();
  const future = s.occurrences.filter((o) => o.due_date >= today);
  const accountName = (aid: number | null) => accounts.find((a) => a.id === aid)?.name ?? "—";
  const categoryName = (cid: number | null) => {
    const c = categories.find((x) => x.id === cid);
    if (!c) return "Sin categoría";
    const parent = categories.find((x) => x.id === c.parent_id);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const end = s.end_date ? `hasta el ${formatDate(s.end_date)}` : s.max_occurrences ? `${s.max_occurrences} veces` : "sin fin";
  const visiblePast = showAllPast ? past : past.slice(0, 6);

  return (
    <>
      <Link to="/recurrentes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="size-4" /> Recurrentes
      </Link>
      <PageHeader
        title={s.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {KIND_LABELS[s.kind]} · {describeFrequency(s.current)} · desde el {formatDate(s.start_date)}, {end}
            {s.is_subscription && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Suscripción</Badge>}
          </span>
        }
        actions={
          <>
            <button className="btn-primary" onClick={() => setForm("terms")}>
              <Pencil className="size-4" /> Cambiar importe o condiciones
            </button>
            <button className="btn-secondary" onClick={() => setForm("settings")}>
              <Settings2 className="size-4" /> Ajustes
            </button>
            <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)} aria-label="Borrar">
              <Trash className="size-4" />
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-4">
            <h2 className="mb-1 font-semibold">Próximas</h2>
            {future.length ? (
              <OccurrenceList items={future.slice(0, 12)} showSeries={false} />
            ) : (
              <p className="py-4 text-sm text-slate-500 dark:text-slate-400">No hay más ocurrencias previstas.</p>
            )}
          </section>
          {past.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-1 font-semibold">Historial</h2>
              <OccurrenceList items={visiblePast} showSeries={false} />
              {past.length > visiblePast.length && (
                <button className="btn-ghost mt-2 w-full" onClick={() => setShowAllPast(true)}>
                  Ver las {past.length} anteriores
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-4 text-sm">
            <h2 className="mb-3 font-semibold">Condiciones actuales</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">{s.current.amount_mode === "variable" ? "Importe estimado" : "Importe"}</dt>
                <dd>
                  <Amount kind={s.kind} value={s.current.amount} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Cuenta</dt>
                <dd className="text-right">
                  {accountName(s.current.account_id)}
                  {s.kind === "transfer" && ` → ${accountName(s.current.to_account_id)}`}
                </dd>
              </div>
              {s.kind !== "transfer" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Categoría</dt>
                  <dd className="text-right">{categoryName(s.current.category_id)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Día no hábil</dt>
                <dd>{ADJUSTS[s.current.business_day_adjust]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Confirmación</dt>
                <dd>{s.auto_confirm ? "Automática" : "Manual"}</dd>
              </div>
            </dl>
            {s.notes && <p className="mt-3 border-t border-slate-100 pt-3 text-slate-600 dark:border-slate-800 dark:text-slate-300">{s.notes}</p>}
          </section>

          {s.versions.length > 1 && (
            <section className="card p-4 text-sm">
              <h2 className="mb-3 font-semibold">Cambios de condiciones</h2>
              <ol className="space-y-2">
                {[...s.versions].reverse().map((v) => (
                  <li key={v.id} className="flex justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Desde el {formatDate(v.effective_from)}</span>
                    <span className="text-right">
                      <Amount kind={s.kind} value={v.amount} />
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{describeFrequency(v)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>

      <SeriesForm
        open={form !== null}
        mode={form ?? "settings"}
        series={s}
        defaultFrom={future.find((o) => o.status === "planned")?.scheduled_date}
        onClose={() => setForm(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Borrar recurrente"
        message="Se borrará la serie y sus ocurrencias previstas. Los movimientos ya confirmados se conservan. Si solo quieres que deje de repetirse, ponle una fecha de fin en Ajustes."
        confirmLabel="Borrar serie"
        danger
        busy={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(s.id, { onSuccess: () => navigate("/recurrentes") })}
      />
    </>
  );
}
