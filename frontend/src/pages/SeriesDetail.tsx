import { ArrowLeft, Pencil, Settings2, Trash } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAccounts, useCategories, useDeleteSeries, useSeries } from "../api/hooks";
import { Amount } from "../components/amount";
import { OccurrenceList } from "../components/occurrences";
import { Badge, CardHeader, ConfirmDialog, ErrorBox, ListSkeleton, PageHeader, Skeleton } from "../components/ui";
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

  if (isPending)
    return (
      <div>
        <Skeleton className="mb-4 h-4 w-28" />
        <Skeleton className="mb-7 h-8 w-72" />
        <ListSkeleton rows={6} />
      </div>
    );
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
      <Link to="/recurrentes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-fg-subtle hover:text-fg">
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
            <button className="btn-ghost text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmDelete(true)} aria-label="Borrar serie" title="Borrar serie">
              <Trash className="size-4" />
            </button>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card px-5 pt-5 pb-2">
            <CardHeader title="Próximas" className="mb-1" />
            {future.length ? (
              <OccurrenceList items={future.slice(0, 12)} showSeries={false} />
            ) : (
              <p className="pt-1 pb-4 text-sm text-fg-subtle">No hay más ocurrencias previstas.</p>
            )}
          </section>
          {past.length > 0 && (
            <section className="card px-5 pt-5 pb-2">
              <CardHeader title="Historial" className="mb-1" />
              <OccurrenceList items={visiblePast} showSeries={false} />
              {past.length > visiblePast.length && (
                <button className="btn-ghost mb-2 w-full text-[13px]" onClick={() => setShowAllPast(true)}>
                  Ver las {past.length} anteriores
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="card p-5 text-sm">
            <CardHeader title="Condiciones actuales" className="mb-2" />
            <dl className="divide-y divide-line [&>div]:py-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">{s.current.amount_mode === "variable" ? "Importe estimado" : "Importe"}</dt>
                <dd className="font-medium">
                  <Amount kind={s.kind} value={s.current.amount} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Cuenta</dt>
                <dd className="text-right font-medium">
                  {accountName(s.current.account_id)}
                  {s.kind === "transfer" && ` → ${accountName(s.current.to_account_id)}`}
                </dd>
              </div>
              {s.kind !== "transfer" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-subtle">Categoría</dt>
                  <dd className="text-right font-medium">{categoryName(s.current.category_id)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Día no hábil</dt>
                <dd className="font-medium">{ADJUSTS[s.current.business_day_adjust]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Confirmación</dt>
                <dd className="font-medium">{s.auto_confirm ? "Automática" : "Manual"}</dd>
              </div>
            </dl>
            {s.notes && <p className="mt-3 border-t border-line pt-3 text-fg-muted">{s.notes}</p>}
          </section>

          {s.versions.length > 1 && (
            <section className="card p-5 text-sm">
              <CardHeader title="Cambios de condiciones" className="mb-2" />
              <ol className="divide-y divide-line [&>li]:py-2.5">
                {[...s.versions].reverse().map((v) => (
                  <li key={v.id} className="flex justify-between gap-3">
                    <span className="text-fg-subtle">Desde el {formatDate(v.effective_from)}</span>
                    <span className="text-right">
                      <Amount kind={s.kind} value={v.amount} />
                      <span className="block text-xs text-fg-subtle">{describeFrequency(v)}</span>
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
