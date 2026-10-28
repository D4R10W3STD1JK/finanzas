import clsx from "clsx";
import { ChevronLeft, ChevronRight, Funnel, Paperclip, Plus, Receipt, Repeat, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { type TransactionFilters, useAccounts, useCategories, useTags, useTransactions } from "../api/hooks";
import type { Transaction, TransactionKind } from "../api/types";
import { Amount } from "../components/amount";
import { IconBadge } from "../components/icons";
import { AccountSelect, DateInput } from "../components/inputs";
import { EmptyState, PageHeader, PageLoader, Spinner } from "../components/ui";
import { formatDateShort, formatMoney, formatMonth, monthRange, todayISO } from "../lib/format";
import TransactionForm from "./TransactionForm";

const PAGE = 100;

function monthsFromToday(month: string | null): number {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return 0;
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}
const MAX_LIMIT = 500; // máximo que acepta la API por petición

export default function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const accountId = params.get("cuenta") ? Number(params.get("cuenta")) : null;
  // Enlaces desde el dashboard: ?mes=2026-10&categoria=5&tipo=expense
  const [monthOffset, setMonthOffset] = useState(() => monthsFromToday(params.get("mes")));
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<TransactionKind | "">(() => (params.get("tipo") as TransactionKind | null) ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(() => (params.get("categoria") ? Number(params.get("categoria")) : null));
  const [tagId, setTagId] = useState<number | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const month = monthRange(todayISO(), monthOffset);
  const usingRange = !!(rangeFrom || rangeTo);
  const filters: TransactionFilters = {
    date_from: usingRange ? rangeFrom || undefined : month.from,
    date_to: usingRange ? rangeTo || undefined : month.to,
    account_id: accountId ?? undefined,
    category_id: categoryId && categoryId > 0 ? categoryId : undefined,
    uncategorized: categoryId === -1 || undefined,
    kind: kind || undefined,
    tag_id: tagId ?? undefined,
    q: q.trim() || undefined,
    limit,
  };
  const { data, isPending, isFetching } = useTransactions(filters);
  const { data: accounts = [] } = useAccounts(true);
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();

  const byDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of data?.items ?? []) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
    return [...groups.entries()];
  }, [data]);

  const setAccount = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("cuenta", String(id));
    else next.delete("cuenta");
    setParams(next, { replace: true });
  };
  const activeFilters = [kind, categoryId, tagId, rangeFrom, rangeTo, accountId].filter(Boolean).length;
  const clearFilters = () => {
    setKind("");
    setCategoryId(null);
    setTagId(null);
    setRangeFrom("");
    setRangeTo("");
    setAccount(null);
  };

  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? "";

  return (
    <>
      <PageHeader
        title="Movimientos"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo
          </button>
        }
      />

      <div className="card mb-4 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!usingRange && (
            <div className="flex items-center">
              <button className="btn-ghost p-2" onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Mes anterior">
                <ChevronLeft className="size-4" />
              </button>
              <span className="w-36 text-center text-sm font-medium capitalize">{formatMonth(month.from)}</span>
              <button className="btn-ghost p-2" onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Mes siguiente">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar concepto o nota" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className={clsx("btn-secondary", activeFilters && "border-brand-500")} onClick={() => setShowFilters(!showFilters)}>
            <Funnel className="size-4" /> Filtros {activeFilters > 0 && `(${activeFilters})`}
          </button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
            <div>
              <label className="label">Cuenta</label>
              <AccountSelect value={accountId} onChange={setAccount} placeholder="Todas las cuentas" />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as TransactionKind | "")}>
                <option value="">Todos</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
                <option value="transfer">Transferencias</option>
                <option value="adjustment">Ajustes de saldo</option>
              </select>
            </div>
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Todas</option>
                <option value="-1">Sin categoría</option>
                {categories
                  .filter((c) => c.parent_id === null)
                  .map((p) => (
                    <optgroup key={p.id} label={`${p.name} (${p.kind === "income" ? "ingreso" : "gasto"})`}>
                      <option value={p.id}>{p.name} (todas)</option>
                      {categories
                        .filter((c) => c.parent_id === p.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">Etiqueta</label>
              <select className="input" value={tagId ?? ""} onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Todas</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <DateInput value={rangeFrom} onChange={setRangeFrom} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <DateInput value={rangeTo} onChange={setRangeTo} />
            </div>
            {activeFilters > 0 && (
              <button className="btn-ghost justify-self-start" onClick={clearFilters}>
                <X className="size-4" /> Quitar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {data && (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 px-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {data.total} movimiento{data.total === 1 ? "" : "s"}
            {accountId ? ` · ${accountName(accountId)}` : ""}
          </span>
          <span>
            Ingresos <strong className="amount text-income">{formatMoney(data.sum_income)}</strong>
          </span>
          <span>
            Gastos <strong className="amount text-expense">{formatMoney(data.sum_expense)}</strong>
          </span>
          {isFetching && <Spinner className="size-4 text-slate-400" />}
        </div>
      )}

      {isPending ? (
        <PageLoader />
      ) : !byDate.length ? (
        <div className="card">
          <EmptyState icon={<Receipt className="size-6" />} title="No hay movimientos">
            {activeFilters || q ? "Prueba a cambiar los filtros." : "Añade el primero con el botón «Nuevo»."}
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {byDate.map(([date, items]) => (
            <section key={date}>
              <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {formatDateShort(date)}
              </h3>
              <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((t) => {
                  const cat = categories.find((c) => c.id === t.category_id);
                  const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
                  const detail =
                    t.kind === "transfer"
                      ? `${accountName(t.account_id)} → ${accountName(t.to_account_id)}`
                      : t.kind === "adjustment"
                        ? `Ajuste · ${accountName(t.account_id)}`
                        : `${cat ? (parent ? `${parent.name} › ${cat.name}` : cat.name) : "Sin categoría"} · ${accountName(t.account_id)}`;
                  return (
                    <li key={t.id}>
                      <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setEditing(t.id)}>
                        {t.kind === "transfer" || t.kind === "adjustment" || !cat ? (
                          <IconBadge icon={t.kind === "transfer" ? "repeat" : "ellipsis"} color="#64748b" />
                        ) : (
                          <IconBadge icon={cat.icon} color={cat.color} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {t.concept}
                            {t.series_id && <Repeat className="size-3 shrink-0 text-slate-400" aria-label="Recurrente" />}
                            {t.attachments.length > 0 && <Paperclip className="size-3 shrink-0 text-slate-400" aria-label="Con adjuntos" />}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {detail}
                            {t.tags.length > 0 && ` · ${t.tags.map((tag) => tag.name).join(", ")}`}
                          </p>
                        </div>
                        <Amount kind={t.kind} value={t.amount} className="text-sm" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {data && data.items.length < data.total && limit < MAX_LIMIT && (
            <div className="flex justify-center">
              <button className="btn-secondary" onClick={() => setLimit(Math.min(limit + PAGE, MAX_LIMIT))} disabled={isFetching}>
                Cargar más
              </button>
            </div>
          )}
        </div>
      )}

      <TransactionForm open={creating} onClose={() => setCreating(false)} defaultAccountId={accountId} />
      <TransactionForm open={editing !== null} transactionId={editing} onClose={() => setEditing(null)} />
    </>
  );
}
