import { Archive, Pencil, Plus, Scale, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccounts, useDeleteAccount, useReconcile, useSaveAccount } from "../api/hooks";
import type { Account, AccountType } from "../api/types";
import { Balance } from "../components/amount";
import { IconBadge } from "../components/icons";
import { ColorPicker, DateInput, IconPicker, MoneyInput } from "../components/inputs";
import { Badge, Checkbox, ConfirmDialog, EmptyState, ErrorBox, Field, Modal, PageHeader, PageLoader, Spinner } from "../components/ui";
import { formatDate, formatMoney, todayISO } from "../lib/format";
import { ACCOUNT_TYPES } from "../lib/labels";

const DEFAULT_ICONS: Record<AccountType, [string, string]> = {
  bank: ["landmark", "#3b82f6"],
  cash: ["wallet", "#22c55e"],
  credit_card: ["credit-card", "#ef4444"],
  savings: ["piggy-bank", "#8b5cf6"],
  investment: ["trending-up", "#14b8a6"],
};

function AccountForm({ open, account, onClose }: { open: boolean; account: Account | null; onClose: () => void }) {
  const save = useSaveAccount();
  const remove = useDeleteAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [initial, setInitial] = useState("");
  const [initialDate, setInitialDate] = useState(todayISO());
  const [creditLimit, setCreditLimit] = useState("");
  const [icon, setIcon] = useState("landmark");
  const [color, setColor] = useState("#3b82f6");
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [archived, setArchived] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    save.reset();
    remove.reset();
    setName(account?.name ?? "");
    setType(account?.type ?? "bank");
    setInitial(account?.initial_balance ?? "");
    setInitialDate(account?.initial_balance_date ?? todayISO());
    setCreditLimit(account?.credit_limit ?? "");
    setIcon(account?.icon ?? "landmark");
    setColor(account?.color ?? "#3b82f6");
    setIncludeInTotal(account?.include_in_total ?? true);
    setArchived(account?.archived ?? false);
    setNotes(account?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  const changeType = (t: AccountType) => {
    if (!account && icon === DEFAULT_ICONS[type][0]) {
      setIcon(DEFAULT_ICONS[t][0]);
      setColor(DEFAULT_ICONS[t][1]);
    }
    setType(t);
  };

  const submit = () =>
    save.mutate(
      {
        id: account?.id,
        body: {
          name: name.trim(),
          type,
          initial_balance: initial || "0",
          initial_balance_date: initialDate,
          credit_limit: type === "credit_card" && creditLimit ? creditLimit : null,
          icon,
          color,
          include_in_total: includeInTotal,
          archived,
          sort_order: account?.sort_order ?? 0,
          notes: notes.trim() || null,
        },
      },
      { onSuccess: onClose },
    );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={account ? "Editar cuenta" : "Nueva cuenta"}
        footer={
          <>
            {account && (
              <button className="btn-ghost mr-auto text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
                Borrar
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={submit} disabled={!name.trim() || !initialDate || save.isPending}>
              {save.isPending && <Spinner className="size-4" />}
              Guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              {(id) => <input id={id} className="input" value={name} placeholder="Ej. Cuenta nómina" onChange={(e) => setName(e.target.value)} autoFocus />}
            </Field>
            <Field label="Tipo">
              {(id) => (
                <select id={id} className="input" value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
                  {Object.entries(ACCOUNT_TYPES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Saldo inicial"
              hint={type === "credit_card" ? "Lo que debías en esa fecha, en negativo (ej. -250,00)" : "Saldo en la fecha indicada"}
            >
              {(id) => <MoneyInput id={id} value={initial} onChange={setInitial} allowNegative />}
            </Field>
            <Field label="Fecha del saldo inicial">{(id) => <DateInput id={id} value={initialDate} onChange={setInitialDate} />}</Field>
            {type === "credit_card" && (
              <Field label="Límite de crédito">{(id) => <MoneyInput id={id} value={creditLimit} onChange={setCreditLimit} />}</Field>
            )}
          </div>
          <Field label="Color">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
          <Field label="Icono">{() => <IconPicker value={icon} onChange={setIcon} color={color} />}</Field>
          <div className="space-y-3">
            <Checkbox checked={includeInTotal} onChange={setIncludeInTotal} label="Incluir en el saldo total" />
            {account && <Checkbox checked={archived} onChange={setArchived} label="Archivada" hint="No aparece en las listas, pero conserva su historial" />}
          </div>
          <Field label="Notas">{(id) => <textarea id={id} className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <ErrorBox error={save.error ?? remove.error} />
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Borrar cuenta"
        message="Solo se pueden borrar cuentas sin movimientos ni recurrentes. Si tiene historial, archívala."
        confirmLabel="Borrar"
        danger
        busy={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(account!.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
            onError: () => setConfirmDelete(false),
          })
        }
      />
    </>
  );
}

function ReconcileModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const reconcile = useReconcile();
  const [real, setReal] = useState("");
  const [date, setDate] = useState(todayISO());
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    reconcile.reset();
    setReal(account?.balance ?? "");
    setDate(todayISO());
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  if (!account) return null;
  const diff = real ? Number(real) - Number(account.balance) : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Conciliar ${account.name}`}
      size="sm"
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>
            Cerrar
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={!real || reconcile.isPending}
              onClick={() =>
                reconcile.mutate(
                  { id: account.id, body: { real_balance: real, date } },
                  {
                    onSuccess: (tx) =>
                      setResult(tx ? `Se ha creado un ajuste de ${formatMoney(tx.amount, { sign: true })}.` : "El saldo ya cuadraba: no hace falta ajuste."),
                  },
                )
              }
            >
              Ajustar saldo
            </button>
          </>
        )
      }
    >
      {result ? (
        <p className="text-sm">{result}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Saldo calculado hoy: <strong className="amount text-slate-900 dark:text-slate-100">{formatMoney(account.balance)}</strong>. Escribe el saldo
            real que ves en el banco y se creará un movimiento de ajuste por la diferencia.
          </p>
          <Field label="Saldo real">{(id) => <MoneyInput id={id} value={real} onChange={setReal} allowNegative autoFocus />}</Field>
          <Field label="A fecha de">{(id) => <DateInput id={id} value={date} onChange={setDate} />}</Field>
          {date === todayISO() && diff !== 0 && (
            <p className="text-sm">
              Diferencia: <strong className={diff < 0 ? "text-expense" : "text-income"}>{formatMoney(diff, { sign: true })}</strong>
            </p>
          )}
          <ErrorBox error={reconcile.error} />
        </div>
      )}
    </Modal>
  );
}

export default function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isPending } = useAccounts(showArchived);
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [reconciling, setReconciling] = useState<Account | null>(null);

  const visible = data ?? [];
  const total = visible.filter((a) => a.include_in_total && !a.archived).reduce((s, a) => s + Number(a.balance), 0);

  return (
    <>
      <PageHeader
        title="Cuentas"
        subtitle={<>Saldo total: <strong className="amount">{formatMoney(total)}</strong></>}
        actions={
          <>
            <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)}>
              <Archive className="size-4" /> {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nueva cuenta
            </button>
          </>
        }
      />
      {isPending ? (
        <PageLoader />
      ) : !visible.length ? (
        <div className="card">
          <EmptyState icon={<Wallet className="size-6" />} title="Aún no hay cuentas">
            Crea tu cuenta bancaria, el efectivo o la tarjeta para empezar a registrar movimientos.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <div key={a.id} className={`card flex flex-col p-4 ${a.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <IconBadge icon={a.icon} color={a.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ACCOUNT_TYPES[a.type]}
                    {!a.include_in_total && " · fuera del total"}
                  </p>
                </div>
                {a.archived && <Badge>Archivada</Badge>}
              </div>
              <Balance value={a.balance} className="mt-3 text-2xl font-semibold" />
              {a.type === "credit_card" && a.credit_limit && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Disponible {formatMoney(Number(a.credit_limit) + Number(a.balance))} de {formatMoney(a.credit_limit)}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Saldo inicial {formatMoney(a.initial_balance)} el {formatDate(a.initial_balance_date)}
              </p>
              <div className="mt-3 flex gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Link to={`/movimientos?cuenta=${a.id}`} className="btn-ghost flex-1 px-2 text-xs">
                  Movimientos
                </Link>
                <button className="btn-ghost flex-1 px-2 text-xs" onClick={() => setReconciling(a)}>
                  <Scale className="size-3.5" /> Conciliar
                </button>
                <button className="btn-ghost flex-1 px-2 text-xs" onClick={() => setEditing(a)}>
                  <Pencil className="size-3.5" /> Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <AccountForm open={creating || editing !== null} account={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <ReconcileModal account={reconciling} onClose={() => setReconciling(null)} />
    </>
  );
}
