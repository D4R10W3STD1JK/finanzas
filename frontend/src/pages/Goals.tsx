import clsx from "clsx";
import { Archive, Minus, Pencil, Plus, Target, Trash, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccounts, useAddContribution, useDeleteContribution, useDeleteGoal, useGoals, useSaveGoal } from "../api/hooks";
import type { Goal, GoalMode } from "../api/types";
import { IconBadge } from "../components/icons";
import { AccountSelect, ColorPicker, DateInput, IconPicker, MoneyInput } from "../components/inputs";
import { Checkbox, ConfirmDialog, EmptyState, ErrorBox, Field, Modal, PageHeader, PageSkeleton, Segmented, Spinner } from "../components/ui";
import { formatDate, formatMoney, todayISO } from "../lib/format";

const STATUS: Record<string, { label: string; className: string }> = {
  completed: { label: "¡Conseguido!", className: "text-positive" },
  on_track: { label: "Vas bien", className: "text-positive" },
  behind: { label: "Vas por detrás del ritmo", className: "text-warning" },
  overdue: { label: "Se pasó la fecha", className: "text-danger" },
  no_date: { label: "Sin fecha límite", className: "text-fg-subtle" },
};

function GoalForm({ open, goal, onClose }: { open: boolean; goal: Goal | null; onClose: () => void }) {
  const save = useSaveGoal();
  const remove = useDeleteGoal();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<GoalMode>("manual");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [icon, setIcon] = useState("piggy-bank");
  const [color, setColor] = useState("#10b981");
  const [notes, setNotes] = useState("");
  const [archived, setArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    save.reset();
    setName(goal?.name ?? "");
    setTarget(goal?.target_amount ?? "");
    setDate(goal?.target_date ?? "");
    setMode(goal?.mode ?? "manual");
    setAccountId(goal?.account_id ?? null);
    setIcon(goal?.icon ?? "piggy-bank");
    setColor(goal?.color ?? "#10b981");
    setNotes(goal?.notes ?? "");
    setArchived(goal?.archived ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);

  const valid = name.trim() && target && Number(target) > 0 && (mode === "manual" || accountId);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={goal ? "Editar objetivo" : "Nuevo objetivo de ahorro"}
        footer={
          <>
            {goal && (
              <button className="btn-ghost mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
                Borrar
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={!valid || save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    id: goal?.id,
                    body: {
                      name: name.trim(),
                      target_amount: target,
                      target_date: date || null,
                      mode,
                      account_id: mode === "account" ? accountId : null,
                      icon,
                      color,
                      notes: notes.trim() || null,
                      archived,
                    },
                  },
                  { onSuccess: onClose },
                )
              }
            >
              {save.isPending && <Spinner className="size-4" />}
              Guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <IconBadge icon={icon} color={color} />
            <Field label="Nombre" className="flex-1">
              {(id) => <input id={id} className="input" placeholder="Ej. Fondo de emergencia, viaje…" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Importe objetivo">{(id) => <MoneyInput id={id} value={target} onChange={setTarget} />}</Field>
            <Field label="Fecha objetivo (opcional)">{(id) => <DateInput id={id} value={date} onChange={setDate} />}</Field>
          </div>
          <Field label="¿Cómo se mide el progreso?">
            {() => (
              <Segmented
                value={mode}
                options={[
                  { value: "manual", label: "Aportaciones a mano" },
                  { value: "account", label: "Saldo de una cuenta" },
                ]}
                onChange={setMode}
              />
            )}
          </Field>
          {mode === "account" ? (
            <Field label="Cuenta" hint="El progreso será el saldo de esta cuenta. Úsalo si tienes una cuenta dedicada a este objetivo.">
              {(id) => <AccountSelect id={id} value={accountId} onChange={setAccountId} />}
            </Field>
          ) : (
            <p className="text-sm text-fg-subtle">
              Irás apuntando lo que apartas (y lo que retiras) para este objetivo. No mueve dinero entre cuentas.
            </p>
          )}
          <Field label="Color">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
          <Field label="Icono">{() => <IconPicker value={icon} onChange={setIcon} color={color} />}</Field>
          <Field label="Notas">{(id) => <textarea id={id} className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          {goal && <Checkbox checked={archived} onChange={setArchived} label="Archivado" hint="Deja de aparecer en la lista" />}
          <ErrorBox error={save.error} />
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Borrar objetivo"
        message="Se borrará el objetivo y sus aportaciones apuntadas. Las cuentas y movimientos no cambian."
        confirmLabel="Borrar"
        danger
        busy={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(goal!.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
      />
    </>
  );
}

function ContributionForm({ goal, sign, onClose }: { goal: Goal | null; sign: 1 | -1; onClose: () => void }) {
  const add = useAddContribution();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  useEffect(() => {
    add.reset();
    setAmount("");
    setDate(todayISO());
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id, sign]);
  if (!goal) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${sign > 0 ? "Aportar a" : "Retirar de"} ${goal.name}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!amount || Number(amount) <= 0 || !date || add.isPending}
            onClick={() =>
              add.mutate(
                { id: goal.id, body: { amount: sign > 0 ? amount : `-${amount}`, date, notes: notes.trim() || null } },
                { onSuccess: onClose },
              )
            }
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus />}</Field>
        <Field label="Fecha">{(id) => <DateInput id={id} value={date} onChange={setDate} />}</Field>
        <Field label="Nota (opcional)">{(id) => <input id={id} className="input" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <ErrorBox error={add.error} />
      </div>
    </Modal>
  );
}

function GoalCard({ goal, onEdit, onContribute }: { goal: Goal; onEdit: () => void; onContribute: (sign: 1 | -1) => void }) {
  const { data: accounts = [] } = useAccounts(true);
  const removeContribution = useDeleteContribution();
  const [showHistory, setShowHistory] = useState(false);
  const account = accounts.find((a) => a.id === goal.account_id);
  const pct = Math.min(100, Math.max(0, Number(goal.pct)));
  const status = STATUS[goal.status];
  const done = goal.status === "completed";

  return (
    <div className={clsx("card flex flex-col p-4", goal.archived && "opacity-60")}>
      <div className="flex items-start gap-3">
        <IconBadge icon={done ? "star" : goal.icon} color={goal.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{goal.name}</p>
          <p className="text-xs text-fg-subtle">
            {goal.mode === "account" ? (
              <>
                Saldo de <Link to={`/movimientos?cuenta=${goal.account_id}`} className="hover:underline">{account?.name ?? "la cuenta"}</Link>
              </>
            ) : (
              "Aportaciones a mano"
            )}
            {goal.target_date && ` · hasta el ${formatDate(goal.target_date)}`}
          </p>
        </div>
        <button className="btn-ghost p-1.5" onClick={onEdit} aria-label={`Editar ${goal.name}`}>
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="amount text-2xl font-semibold">{formatMoney(goal.current)}</span>
        <span className="text-sm text-fg-subtle">
          de <span className="amount">{formatMoney(goal.target_amount)}</span> · {Number(goal.pct).toLocaleString("es-ES", { maximumFractionDigits: 0 })} %
        </span>
      </div>
      {/* Medidor: relleno del color del objetivo sobre una pista del mismo color, más clara */}
      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${goal.name}: ${pct} %`}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundColor: goal.color }} />
        <div className="relative h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
      </div>

      <p className={clsx("mt-3 flex items-center gap-1.5 text-sm font-medium", status.className)}>
        {done && <Trophy className="size-4" aria-hidden />}
        {status.label}
      </p>
      <div className="mt-1 space-y-0.5 text-sm text-fg-muted">
        {goal.monthly_needed && !done && (
          <p>
            Necesitas <strong className="amount">{formatMoney(goal.monthly_needed)}/mes</strong>{" "}
            {goal.days_left !== null && goal.days_left < 31 ? `(quedan ${goal.days_left} días)` : `hasta el ${formatDate(goal.target_date)}`}.
          </p>
        )}
        {!done && !goal.monthly_needed && (
          <p>
            Faltan <strong className="amount">{formatMoney(goal.remaining)}</strong>.
          </p>
        )}
        {goal.monthly_pace !== null && Number(goal.monthly_pace) !== 0 && (
          <p className="text-xs text-fg-subtle">
            Ritmo de los últimos 3 meses: {formatMoney(goal.monthly_pace)}/mes
          </p>
        )}
      </div>

      {goal.mode === "manual" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => onContribute(1)}>
            <Plus className="size-3.5" /> Aportar
          </button>
          <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => onContribute(-1)} disabled={Number(goal.current) <= 0}>
            <Minus className="size-3.5" /> Retirar
          </button>
          {goal.contributions.length > 0 && (
            <button className="btn-ghost ml-auto px-2.5 py-1.5 text-xs" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? "Ocultar" : `Historial (${goal.contributions.length})`}
            </button>
          )}
        </div>
      )}
      {showHistory && (
        <ul className="mt-2 divide-y divide-line text-sm">
          {goal.contributions.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1.5">
              <span className="text-xs text-fg-subtle">{formatDate(c.date)}</span>
              <span className="min-w-0 flex-1 truncate text-xs">{c.notes}</span>
              <span className={clsx("amount", Number(c.amount) < 0 && "text-expense")}>{formatMoney(c.amount, { sign: true })}</span>
              <button
                className="btn-ghost p-1"
                onClick={() => removeContribution.mutate({ id: goal.id, contributionId: c.id })}
                aria-label="Borrar aportación"
              >
                <Trash className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: goals, isPending } = useGoals(showArchived);
  const [form, setForm] = useState<{ goal: Goal | null } | null>(null);
  const [contributing, setContributing] = useState<{ goal: Goal; sign: 1 | -1 } | null>(null);

  if (isPending) return <PageSkeleton />;
  const list = goals ?? [];
  const active = list.filter((g) => !g.archived);
  const saved = active.reduce((s, g) => s + Math.max(0, Number(g.current)), 0);
  const target = active.reduce((s, g) => s + Number(g.target_amount), 0);

  return (
    <>
      <PageHeader
        title="Objetivos de ahorro"
        subtitle={active.length ? <>Llevas <strong className="amount">{formatMoney(saved)}</strong> de {formatMoney(target)} entre {active.length} objetivo{active.length > 1 ? "s" : ""}</> : undefined}
        actions={
          <>
            <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)}>
              <Archive className="size-4" /> {showArchived ? "Ocultar archivados" : "Ver archivados"}
            </button>
            <button className="btn-primary" onClick={() => setForm({ goal: null })}>
              <Plus className="size-4" /> Nuevo objetivo
            </button>
          </>
        }
      />
      {!list.length ? (
        <div className="card">
          <EmptyState icon={<Target className="size-6" />} title="Aún no hay objetivos">
            Crea uno para el fondo de emergencia, un viaje o cualquier cosa para la que quieras ahorrar.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={() => setForm({ goal: g })} onContribute={(sign) => setContributing({ goal: g, sign })} />
          ))}
        </div>
      )}
      <GoalForm open={form !== null} goal={form?.goal ?? null} onClose={() => setForm(null)} />
      <ContributionForm goal={contributing?.goal ?? null} sign={contributing?.sign ?? 1} onClose={() => setContributing(null)} />
    </>
  );
}
