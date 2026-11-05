import clsx from "clsx";
import { ChevronLeft, ChevronRight, Funnel, Paperclip, Plus, Receipt, Repeat, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { type TransactionFilters, useAccounts, useCategories, useTags, useTransactions } from "../api/hooks";
import type { Transaction, TransactionKind } from "../api/types";
import { Amount } from "../components/amount";
import { IconBadge } from "../components/icons";
import { AccountSelect, DateInput } from "../components/inputs";
import { EmptyState, ListSkeleton, PageHeader, Spinner } from "../components/ui";
import { formatDateShort, formatMoney, formatMonth, monthRange, relativeDay, todayISO } from "../lib/format";
import TransactionForm from "./TransactionForm";

const PAGE = 100;

function monthsFromToday(month: string | null): number {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return 0;
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}
const MAX_LIMIT = 500; // máximo que acepta la API por petición

const KIND_FILTERS: Record<TransactionKind, string> = {
  expense: "Gastos",
  income: "Ingresos",
  transfer: "Transferencias",
  adjustment: "Ajustes de saldo",
};

/** Efecto del día en el saldo: ingresos y ajustes suman, gastos restan; las transferencias no cuentan. */
function dayNet(items: Transaction[]): number {
  return items.reduce((sum, t) => {
    if (t.kind === "income" || t.kind === "adjustment") return sum + Number(t.amount);
    if (t.kind === "expense") return sum - Number(t.amount);
    return sum;
  }, 0);
}

function dayLabel(iso: string, today: string): string {
  const rel = relativeDay(iso, today);
  return rel === "hoy" || rel === "ayer" ? `${rel} · ${formatDateShort(iso)}` : formatDateShort(iso);
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1.5 pl-2.5 text-xs font-semibold text-accent-text hover:bg-accent-soft/70"
      aria-label={`Quitar filtro ${label}`}
    >
      {label}
      <X className="size-3.5" />
    </button>
  );
}

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
  const today = todayISO();
  const chips = [
    accountId && { key: "cuenta", label: accountName(accountId), remove: () => setAccount(null) },
    kind && { key: "tipo", label: KIND_FILTERS[kind], remove: () => setKind("") },
    categoryId && {
      key: "categoria",
      label: categoryId === -1 ? "Sin categoría" : (categories.find((c) => c.id === categoryId)?.name ?? "Categoría"),
      remove: () => setCategoryId(null),
    },
    tagId && { key: "etiqueta", label: `#${tags.find((t) => t.id === tagId)?.name ?? ""}`, remove: () => setTagId(null) },
    rangeFrom && { key: "desde", label: `Desde ${formatDateShort(rangeFrom)}`, remove: () => setRangeFrom("") },
    rangeTo && { key: "hasta", label: `Hasta ${formatDateShort(rangeTo)}`, remove: () => setRangeTo("") },
  ].filter((c): c is { key: string; label: string; remove: () => void } => !!c);

  return (
    <>
      <PageHeader
        title="Movimientos"
        actions={
          <button className="btn-primary hidden lg:inline-flex" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo movimiento
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!usingRange && (
          <div className="card flex items-center rounded-control p-0.5">
            <button className="btn-ghost p-2" onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-32 text-center text-sm font-semibold capitalize" aria-live="polite">
              {formatMonth(month.from)}
            </span>
            <button className="btn-ghost p-2" onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Mes siguiente">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input className="input pl-9" placeholder="Buscar concepto o nota" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button
          className={clsx("btn-secondary", (showFilters || activeFilters > 0) && "text-accent-text ring-accent")}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <Funnel className="size-4" /> Filtros
          {activeFilters > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-accent-fg tabular-nums">{activeFilters}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Cuenta</label>
            <AccountSelect value={accountId} onChange={setAccount} placeholder="Todas las cuentas" />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as TransactionKind | "")}>
              <option value="">Todos</option>
              {Object.entries(KIND_FILTERS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
        </div>
      )}

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <FilterChip key={c.key} label={c.label} onRemove={c.remove} />
          ))}
          {chips.length > 1 && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={clearFilters}>
              Quitar todos
            </button>
          )}
        </div>
      )}

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-sm">
          <span className="text-fg-subtle">
            {data.total} movimiento{data.total === 1 ? "" : "s"}
          </span>
          <span className="text-fg-muted">
            Ingresos <strong className="amount text-positive">{formatMoney(data.sum_income)}</strong>
          </span>
          <span className="text-fg-muted">
            Gastos <strong className="amount text-fg">{formatMoney(data.sum_expense)}</strong>
          </span>
          <span className="text-fg-muted">
            Balance{" "}
            <strong className={clsx("amount", Number(data.sum_income) - Number(data.sum_expense) < 0 ? "text-negative" : "text-positive")}>
              {formatMoney(Number(data.sum_income) - Number(data.sum_expense), { sign: true })}
            </strong>
          </span>
          {isFetching && <Spinner className="size-4 text-fg-faint" />}
        </div>
      )}

      {isPending ? (
        <ListSkeleton rows={8} />
      ) : !byDate.length ? (
        <div className="card">
          <EmptyState icon={<Receipt className="size-6" />} title="No hay movimientos">
            {activeFilters || q ? "Prueba a cambiar o quitar los filtros." : "Apunta el primero con el botón «+»."}
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-5">
          {byDate.map(([date, items]) => {
            const net = dayNet(items);
            return (
              <section key={date} aria-label={formatDateShort(date)}>
                {/* La cabecera del día se queda fija bajo la barra superior mientras se recorren sus movimientos. */}
                <div className="sticky top-[57px] z-10 -mx-1 mb-1.5 flex items-baseline justify-between bg-canvas px-2 py-1.5 lg:top-0">
                  <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase first-letter:uppercase">{dayLabel(date, today)}</h3>
                  {net !== 0 && (
                    <span className={clsx("amount text-xs font-semibold", net > 0 ? "text-positive" : "text-fg-subtle")}>
                      {formatMoney(net, { sign: true })}
                    </span>
                  )}
                </div>
                <ul className="card divide-y divide-line overflow-hidden">
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
                        <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60" onClick={() => setEditing(t.id)}>
                          {t.kind === "transfer" || t.kind === "adjustment" || !cat ? (
                            <IconBadge icon={t.kind === "transfer" ? "repeat" : "ellipsis"} color="#71717a" />
                          ) : (
                            <IconBadge icon={cat.icon} color={cat.color} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                              {t.concept}
                              {t.series_id && <Repeat className="size-3 shrink-0 text-fg-faint" aria-label="Recurrente" />}
                              {t.attachments.length > 0 && <Paperclip className="size-3 shrink-0 text-fg-faint" aria-label="Con adjuntos" />}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-fg-subtle">
                              {detail}
                              {t.tags.length > 0 && ` · ${t.tags.map((tag) => `#${tag.name}`).join(" ")}`}
                            </p>
                          </div>
                          <Amount kind={t.kind} value={t.amount} className="text-sm font-semibold" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
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
