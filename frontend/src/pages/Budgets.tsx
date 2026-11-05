import clsx from "clsx";
import { CircleAlert, CircleCheck, Gauge, MoreHorizontal, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useBudgetMonth, useDeleteBudget, useSaveBudget, useSetBudgetOverride, useTransactions } from "../api/hooks";
import type { BudgetMonth, BudgetStatus } from "../api/types";
import { IconBadge } from "../components/icons";
import { CategorySelect, MoneyInput } from "../components/inputs";
import { ConfirmDialog, EmptyState, ErrorBox, Field, Modal, MonthSwitcher, PageHeader, PageSkeleton, Spinner } from "../components/ui";
import { formatMoney, formatMonth, monthRange, todayISO } from "../lib/format";

// Medidor: el relleno marca la gravedad (acento → ámbar → rojo); la pista es un tono suave de la misma gama.
const TONES = {
  ok: { fill: "bg-accent", track: "bg-track", label: "En marcha", icon: CircleCheck, text: "text-accent-text" },
  warning: { fill: "bg-warning", track: "bg-warning-soft", label: "Cerca del límite", icon: CircleAlert, text: "text-warning" },
  over: { fill: "bg-danger", track: "bg-danger-soft", label: "Superado", icon: TriangleAlert, text: "text-danger" },
} as const;

type Tone = keyof typeof TONES;

export function BudgetMeter({ item, elapsedPct }: { item: BudgetStatus; elapsedPct?: number }) {
  const tone = TONES[item.status as Tone];
  const limit = Number(item.limit);
  const spentPct = limit > 0 ? Math.min(100, (Number(item.spent) / limit) * 100) : 100;
  const committedPct = limit > 0 ? Math.min(100 - spentPct, (Number(item.committed) / limit) * 100) : 0;
  return (
    <div
      className={clsx("relative h-2.5 w-full overflow-hidden rounded-full", tone.track)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(item.pct)}
      aria-label={`${item.name}: ${item.pct} % gastado`}
    >
      <div className="flex h-full">
        <div className={clsx("h-full", tone.fill)} style={{ width: `${spentPct}%` }} />
        {committedPct > 0 && (
          <div
            className={clsx("h-full opacity-40", tone.fill)}
            style={{ width: `${committedPct}%`, marginLeft: spentPct > 0 ? 2 : 0 }}
            title="Previsto por recurrentes"
          />
        )}
      </div>
      {elapsedPct !== undefined && elapsedPct > 0 && elapsedPct < 100 && (
        <div className="absolute inset-y-0 w-0.5 bg-fg/60" style={{ left: `${elapsedPct}%` }} title="Día del mes en que estamos" />
      )}
    </div>
  );
}

function BudgetForm({
  open,
  onClose,
  item,
  presetCategory,
  presetAmount,
}: {
  open: boolean;
  onClose: () => void;
  item: BudgetStatus | null;
  presetCategory?: number | null;
  presetAmount?: string;
}) {
  const save = useSaveBudget();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [alertPct, setAlertPct] = useState(80);
  const lastMonth = monthRange(todayISO(), -1);
  const previous = useTransactions({ category_id: categoryId ?? undefined, kind: "expense", date_from: lastMonth.from, date_to: lastMonth.to, limit: 1 });

  useEffect(() => {
    if (!open) return;
    save.reset();
    setCategoryId(item?.category_id ?? presetCategory ?? null);
    setAmount(item?.base_amount ?? presetAmount ?? "");
    setAlertPct(item?.alert_pct ?? 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.budget_id, presetCategory]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Presupuesto de ${item.name}` : "Nuevo presupuesto"}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!categoryId || !amount || Number(amount) <= 0 || save.isPending}
            onClick={() =>
              save.mutate({ id: item?.budget_id, body: { category_id: categoryId!, amount, alert_pct: alertPct } }, { onSuccess: onClose })
            }
          >
            {save.isPending && <Spinner className="size-4" />}
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!item && (
          <Field label="Categoría" hint="Si eliges una categoría principal, incluye todas sus subcategorías">
            {(id) => <CategorySelect
                id={id}
                kind="expense"
                value={categoryId}
                onChange={setCategoryId}
                emptyLabel="Elige una categoría"
                parentSuffix="(toda la categoría)"
              />}
          </Field>
        )}
        <Field
          label="Importe mensual"
          hint={
            categoryId && previous.data
              ? `El mes pasado gastaste ${formatMoney(previous.data.sum_expense)} en esta categoría`
              : "El mismo cada mes; los meses especiales se ajustan aparte"
          }
        >
          {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus={!!item} />}
        </Field>
        <Field label={`Avisar al llegar al ${alertPct} %`}>
          {(id) => (
            <input id={id} type="range" min={50} max={100} step={5} value={alertPct} onChange={(e) => setAlertPct(Number(e.target.value))} className="w-full accent-accent" />
          )}
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

function OverrideForm({ item, month, onClose }: { item: BudgetStatus | null; month: string; onClose: () => void }) {
  const setOverride = useSetBudgetOverride();
  const [amount, setAmount] = useState("");
  useEffect(() => {
    setOverride.reset();
    setAmount(item?.limit ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.budget_id]);
  if (!item) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${item.name}: solo en ${formatMonth(month)}`}
      size="sm"
      footer={
        <>
          {item.is_override && (
            <button
              className="btn-ghost mr-auto"
              onClick={() => setOverride.mutate({ id: item.budget_id, month, amount: null }, { onSuccess: onClose })}
            >
              Quitar excepción
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={amount === "" || setOverride.isPending}
            onClick={() => setOverride.mutate({ id: item.budget_id, month, amount }, { onSuccess: onClose })}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-subtle">
          El presupuesto normal es de {formatMoney(item.base_amount)} al mes. Aquí puedes poner otro importe solo para este mes (por ejemplo, más ocio en agosto).
        </p>
        <Field label="Importe de este mes">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus />}</Field>
        <ErrorBox error={setOverride.error} />
      </div>
    </Modal>
  );
}

function RowMenu({ onEdit, onOverride, onDelete }: { onEdit: () => void; onOverride: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const items = [
    { label: "Cambiar importe o aviso", run: onEdit },
    { label: "Importe distinto este mes", run: onOverride },
    { label: "Borrar presupuesto", run: onDelete, danger: true },
  ];
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost p-1.5" onClick={() => setOpen(!open)} aria-label="Acciones">
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-control border border-line bg-surface p-1 shadow-overlay">
          {items.map((i) => (
            <button
              key={i.label}
              className={clsx("block w-full px-3 py-2 text-left text-sm hover:bg-surface-2", i.danger && "text-danger")}
              onClick={() => {
                setOpen(false);
                i.run();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetRow({ item, data, onEdit, onOverride, onDelete }: { item: BudgetStatus; data: BudgetMonth; onEdit: () => void; onOverride: () => void; onDelete: () => void }) {
  const tone = TONES[item.status as Tone];
  const ToneIcon = tone.icon;
  const remaining = Number(item.remaining);
  const monthParam = data.month.slice(0, 7);
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <IconBadge icon={item.icon} color={item.color} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <Link to={`/movimientos?mes=${monthParam}&categoria=${item.category_id}`} className="text-sm font-medium break-words hover:underline">
              {item.name}
            </Link>
            <span className={clsx("inline-flex items-center gap-1 text-xs font-medium", tone.text)}>
              <ToneIcon className="size-3.5" aria-hidden />
              {tone.label}
            </span>
            {item.is_override && <span className="text-xs text-fg-subtle">· importe especial este mes</span>}
          </div>
        </div>
        <span className="amount text-right text-sm">
          <strong>{formatMoney(item.spent)}</strong> <span className="text-fg-subtle">de {formatMoney(item.limit)}</span>
        </span>
        <RowMenu onEdit={onEdit} onOverride={onOverride} onDelete={onDelete} />
      </div>
      <div className="mt-2 pl-10">
        <BudgetMeter item={item} elapsedPct={data.is_current_month ? Number(data.month_elapsed_pct) : undefined} />
        <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-fg-subtle">
          <span>
            {remaining >= 0 ? (
              <>
                Quedan <strong className="amount text-fg-muted">{formatMoney(remaining)}</strong>
              </>
            ) : (
              <>
                Te has pasado <strong className="amount text-danger">{formatMoney(-remaining)}</strong>
              </>
            )}{" "}
            · {Number(item.pct).toLocaleString("es-ES")} % · aviso al {item.alert_pct} %
          </span>
          {Number(item.committed) > 0 && (
            <span className={clsx(item.will_exceed && "font-medium text-warning")}>
              + {formatMoney(item.committed)} previstos de recurrentes{item.will_exceed && remaining >= 0 ? ": se superaría" : ""}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

export default function BudgetsPage() {
  const [offset, setOffset] = useState(0);
  const month = monthRange(todayISO(), offset).from;
  const { data, isPending, isFetching } = useBudgetMonth(offset === 0 ? undefined : month);
  const remove = useDeleteBudget();
  const [form, setForm] = useState<{ item: BudgetStatus | null; category?: number | null; amount?: string } | null>(null);
  const [override, setOverride] = useState<BudgetStatus | null>(null);
  const [deleting, setDeleting] = useState<BudgetStatus | null>(null);

  if (isPending || !data) return <PageSkeleton />;
  const totalLimit = Number(data.total_limit);
  const totalSpent = Number(data.total_spent);

  return (
    <>
      <PageHeader
        title="Presupuestos"
        actions={
          <>
            {isFetching && <Spinner className="size-4 self-center text-fg-faint" />}
            <MonthSwitcher label={formatMonth(data.month)} onPrev={() => setOffset(offset - 1)} onNext={() => setOffset(offset + 1)} />
            <button className="btn-primary" onClick={() => setForm({ item: null })}>
              <Plus className="size-4" /> Nuevo presupuesto
            </button>
          </>
        }
      />

      {!data.items.length ? (
        <div className="card">
          <EmptyState icon={<Gauge className="size-6" />} title="Aún no hay presupuestos">
            Pon un límite mensual a las categorías en las que quieras controlar el gasto (alimentación, ocio…). Te avisaremos al acercarte.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-5">
              <p className="stat-label">Presupuestado</p>
              <p className="stat-value">{formatMoney(totalLimit)}</p>
            </div>
            <div className="card p-5">
              <p className="stat-label">Gastado</p>
              <p className="stat-value">{formatMoney(totalSpent)}</p>
              <p className="text-xs text-fg-subtle">
                {totalLimit > 0 && `${Math.round((totalSpent / totalLimit) * 100)} % del total`}
                {data.is_current_month && ` · llevamos el ${Math.round(Number(data.month_elapsed_pct))} % del mes`}
              </p>
            </div>
            <div className="card p-5">
              <p className="stat-label">Disponible</p>
              <p className={clsx("stat-value", totalLimit - totalSpent < 0 && "text-expense")}>{formatMoney(totalLimit - totalSpent)}</p>
              {Number(data.total_committed) > 0 && (
                <p className="text-xs text-fg-subtle">de los que {formatMoney(data.total_committed)} ya están previstos en recurrentes</p>
              )}
            </div>
          </div>
          <section className="card mt-6 px-4 py-1">
            <ul className="divide-y divide-line">
              {data.items.map((i) => (
                <BudgetRow
                  key={i.budget_id}
                  item={i}
                  data={data}
                  onEdit={() => setForm({ item: i })}
                  onOverride={() => setOverride(i)}
                  onDelete={() => setDeleting(i)}
                />
              ))}
            </ul>
          </section>
          {data.is_current_month && (
            <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
              <span className="inline-block h-3 w-0.5 bg-fg/60" /> marca el día del mes en que estamos: si la barra la pasa, vas gastando más
              rápido que el ritmo del mes. La parte clara es lo previsto por recurrentes.
            </p>
          )}
        </>
      )}

      {data.unbudgeted.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="card-title">Gasto sin presupuesto</h2>
          <p className="mb-2 text-sm text-fg-subtle">
            {formatMoney(data.unbudgeted_total)} en categorías sin límite este mes.
          </p>
          <ul className="divide-y divide-line">
            {data.unbudgeted.map((u) => (
              <li key={u.category_id ?? "none"} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{u.name}</span>
                <span className="amount">{formatMoney(u.amount)}</span>
                {u.category_id && (
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => setForm({ item: null, category: u.category_id, amount: String(Math.ceil(Number(u.amount) / 10) * 10) })}
                  >
                    <Plus className="size-3.5" /> Presupuestar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <BudgetForm open={form !== null} item={form?.item ?? null} presetCategory={form?.category} presetAmount={form?.amount} onClose={() => setForm(null)} />
      <OverrideForm item={override} month={data.month} onClose={() => setOverride(null)} />
      <ConfirmDialog
        open={deleting !== null}
        title="Borrar presupuesto"
        message={`Se borrará el presupuesto de «${deleting?.name}» y sus excepciones. Los movimientos no cambian.`}
        confirmLabel="Borrar"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting!.budget_id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}
