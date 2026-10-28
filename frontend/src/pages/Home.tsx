import { CalendarCheck, CircleAlert, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAccounts, useOccurrences, useTransactions } from "../api/hooks";
import { Balance } from "../components/amount";
import { IconBadge } from "../components/icons";
import { OccurrenceList } from "../components/occurrences";
import { EmptyState, PageHeader, PageLoader } from "../components/ui";
import { addDays, formatMoney, formatMonth, monthRange, todayISO } from "../lib/format";
import { ACCOUNT_TYPES } from "../lib/labels";
import TransactionForm from "./TransactionForm";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p
        className={`amount mt-1 text-xl font-semibold ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function HomePage() {
  const today = todayISO();
  const month = monthRange(today);
  const accounts = useAccounts();
  const monthTx = useTransactions({ date_from: month.from, date_to: month.to, limit: 1 });
  const pending = useOccurrences({ status: ["planned"], date_to: addDays(today, -1) });
  const upcoming = useOccurrences({ status: ["planned"], date_from: today, date_to: addDays(today, 30) });
  const [creating, setCreating] = useState(false);

  if (accounts.isPending) return <PageLoader />;
  const list = accounts.data ?? [];
  const total = list.filter((a) => a.include_in_total).reduce((sum, a) => sum + Number(a.balance), 0);
  const income = Number(monthTx.data?.sum_income ?? 0);
  const expense = Number(monthTx.data?.sum_expense ?? 0);

  return (
    <>
      <PageHeader
        title="Inicio"
        subtitle={`Resumen de ${formatMonth(today)}`}
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo movimiento
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 card bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white lg:col-span-1 dark:from-brand-700 dark:to-emerald-900">
          <p className="text-xs font-medium tracking-wide uppercase opacity-80">Saldo total</p>
          <p className="amount mt-1 text-2xl font-semibold">{formatMoney(total)}</p>
        </div>
        <Stat label="Ingresos del mes" value={formatMoney(income)} tone="income" />
        <Stat label="Gastos del mes" value={formatMoney(expense)} tone="expense" />
        <Stat label="Ahorro del mes" value={formatMoney(income - expense)} />
      </div>

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

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card p-4 lg:col-span-3">
          <h2 className="mb-2 font-semibold">Próximos 30 días</h2>
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
          {list.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((a) => (
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
