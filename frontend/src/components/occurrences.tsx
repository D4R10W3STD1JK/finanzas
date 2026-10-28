import clsx from "clsx";
import { Check, MoreHorizontal, Pencil, RotateCcw, SkipForward, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useCategories, useConfirmOccurrence, useEditOccurrence, useOccurrenceAction } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { formatDate, formatDateShort, formatMoney, relativeDay, todayISO } from "../lib/format";
import { Amount } from "./amount";
import { IconBadge } from "./icons";
import { AccountSelect, CategorySelect, DateInput, MoneyInput } from "./inputs";
import { Badge, ErrorBox, Field, Modal, Spinner } from "./ui";

export function StatusBadge({ occ }: { occ: Occurrence }) {
  if (occ.status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Confirmada</Badge>;
  if (occ.status === "skipped") return <Badge>Omitida</Badge>;
  if (occ.due_date < todayISO())
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">Pendiente</Badge>;
  return <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">Prevista</Badge>;
}

/** Confirmar una ocurrencia: permite indicar el importe real (imprescindible en las variables). */
export function ConfirmOccurrenceModal({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const confirm = useConfirmOccurrence();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (!occ) return;
    setAmount(occ.amount_mode === "variable" ? "" : occ.expected_amount);
    setDate(occ.due_date);
    setAccountId(occ.account_id);
    setCategoryId(occ.category_id);
    confirm.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occ?.id]);

  if (!occ) return null;
  const submit = () =>
    confirm.mutate(
      { id: occ.id, body: { amount, date, account_id: accountId, category_id: categoryId } },
      { onSuccess: onClose },
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Confirmar: ${occ.series_name}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={!amount || !date || !accountId || confirm.isPending}>
            {confirm.isPending && <Spinner className="size-4" />}
            Confirmar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {occ.amount_mode === "variable" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Importe estimado: <strong className="amount">{formatMoney(occ.expected_amount)}</strong>. Indica el importe real del recibo.
          </p>
        )}
        <Field label={occ.amount_mode === "variable" ? "Importe real" : "Importe"}>
          {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus />}
        </Field>
        <Field label="Fecha">{(id) => <DateInput id={id} value={date} onChange={setDate} />}</Field>
        <Field label={occ.kind === "transfer" ? "Cuenta de origen" : "Cuenta"}>
          {(id) => <AccountSelect id={id} value={accountId} onChange={setAccountId} exclude={occ.to_account_id} />}
        </Field>
        {occ.kind !== "transfer" && (
          <Field label="Categoría">
            {(id) => (
              <CategorySelect id={id} kind={occ.kind === "income" ? "income" : "expense"} value={categoryId} onChange={setCategoryId} />
            )}
          </Field>
        )}
        <ErrorBox error={confirm.error} />
      </div>
    </Modal>
  );
}

/** Editar solo esta ocurrencia (fecha, importe previsto, nota) sin tocar la serie. */
export function EditOccurrenceModal({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const edit = useEditOccurrence();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!occ) return;
    setAmount(occ.expected_amount);
    setDate(occ.due_date);
    setNotes(occ.notes ?? "");
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occ?.id]);

  if (!occ) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar solo esta ocurrencia"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!amount || !date || edit.isPending}
            onClick={() =>
              edit.mutate({ id: occ.id, body: { expected_amount: amount, due_date: date, notes: notes || null } }, { onSuccess: onClose })
            }
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Prevista para el {formatDate(occ.scheduled_date)}. El resto de la serie no cambia y esta ocurrencia ya no se confirmará sola.
        </p>
        <Field label={occ.amount_mode === "variable" ? "Importe estimado" : "Importe"}>
          {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}
        </Field>
        <Field label="Fecha">{(id) => <DateInput id={id} value={date} onChange={setDate} />}</Field>
        <Field label="Nota">{(id) => <input id={id} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <ErrorBox error={edit.error} />
      </div>
    </Modal>
  );
}

function ActionsMenu({ occ, onEdit, onConfirm }: { occ: Occurrence; onEdit: () => void; onConfirm: () => void }) {
  const action = useOccurrenceAction();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const items: { label: string; icon: typeof Check; run: () => void }[] = [];
  if (occ.status === "planned") {
    if (occ.due_date > todayISO()) items.push({ label: "Confirmar ya", icon: Check, run: onConfirm });
    items.push({ label: "Editar esta ocurrencia", icon: Pencil, run: onEdit });
    items.push({ label: "Omitir", icon: SkipForward, run: () => action.mutate({ id: occ.id, action: "skip" }) });
    if (occ.is_overridden)
      items.push({ label: "Volver a los valores de la serie", icon: RotateCcw, run: () => action.mutate({ id: occ.id, action: "reset" }) });
  } else if (occ.status === "confirmed") {
    items.push({ label: "Deshacer confirmación", icon: Undo2, run: () => action.mutate({ id: occ.id, action: "unconfirm" }) });
  } else {
    items.push({ label: "Restaurar", icon: Undo2, run: () => action.mutate({ id: occ.id, action: "unskip" }) });
  }

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost p-1.5" onClick={() => setOpen((o) => !o)} aria-label="Más acciones" disabled={action.isPending}>
        {action.isPending ? <Spinner className="size-4" /> : <MoreHorizontal className="size-4" />}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {items.map(({ label, icon: I, run }) => (
            <button
              key={label}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              onClick={() => {
                setOpen(false);
                run();
              }}
            >
              <I className="size-4 text-slate-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lista de ocurrencias con acciones (confirmar, editar, omitir...). */
export function OccurrenceList({ items, showSeries = true }: { items: Occurrence[]; showSeries?: boolean }) {
  const { data: categories = [] } = useCategories();
  const [confirming, setConfirming] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const today = todayISO();

  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((occ) => {
          const cat = categories.find((c) => c.id === occ.category_id);
          const amount = occ.actual_amount ?? occ.expected_amount;
          return (
            <li key={occ.id} className={clsx("flex items-center gap-3 py-2.5", occ.status === "skipped" && "opacity-50")}>
              {showSeries &&
                (cat ? <IconBadge icon={cat.icon} color={cat.color} size="sm" /> : <IconBadge icon="repeat" color="#64748b" size="sm" />)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {showSeries ? (
                    <Link to={`/recurrentes/${occ.series_id}`} className="truncate text-sm font-medium hover:underline">
                      {occ.series_name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{formatDate(occ.due_date)}</span>
                  )}
                  {occ.is_overridden && occ.status === "planned" && (
                    <span title="Editada a mano">
                      <Pencil className="size-3 text-slate-400" />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {showSeries && (
                    <span>
                      {formatDateShort(occ.due_date)} · {relativeDay(occ.due_date, today)}
                    </span>
                  )}
                  <StatusBadge occ={occ} />
                  {occ.amount_mode === "variable" && occ.status === "planned" && <span>estimado</span>}
                </div>
              </div>
              <Amount kind={occ.kind} value={amount} className="text-sm" />
              {occ.status === "planned" && occ.due_date <= today && (
                <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setConfirming(occ)} title="Confirmar">
                  <Check className="size-3.5" />
                  <span className="hidden sm:inline">Confirmar</span>
                </button>
              )}
              <ActionsMenu occ={occ} onEdit={() => setEditing(occ)} onConfirm={() => setConfirming(occ)} />
            </li>
          );
        })}
      </ul>
      <ConfirmOccurrenceModal occ={confirming} onClose={() => setConfirming(null)} />
      <EditOccurrenceModal occ={editing} onClose={() => setEditing(null)} />
    </>
  );
}
