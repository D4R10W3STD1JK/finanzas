import { CalendarClock, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAccounts, useCategories, useSeriesList } from "../api/hooks";
import type { Series } from "../api/types";
import { Amount } from "../components/amount";
import { IconBadge } from "../components/icons";
import { Badge, EmptyState, GroupLabel, ListSkeleton, PageHeader } from "../components/ui";
import { formatDate } from "../lib/format";
import { describeFrequency } from "../lib/labels";
import SeriesForm from "./SeriesForm";

const GROUPS = [
  { kind: "income", title: "Ingresos" },
  { kind: "expense", title: "Gastos" },
  { kind: "transfer", title: "Transferencias" },
] as const;

function SeriesRow({ s }: { s: Series }) {
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts(true);
  const cat = categories.find((c) => c.id === s.current.category_id);
  const account = accounts.find((a) => a.id === s.current.account_id);
  return (
    <li>
      <Link to={`/recurrentes/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
        <IconBadge icon={cat?.icon ?? "repeat"} color={cat?.color ?? "#71717a"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{s.name}</span>
            {s.is_subscription && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Suscripción</Badge>}
            {s.current.amount_mode === "variable" && <Badge>Variable</Badge>}
            {s.pending_count > 0 && (
              <Badge className="bg-warning-soft text-warning">{s.pending_count} pendiente{s.pending_count > 1 ? "s" : ""}</Badge>
            )}
            {s.finished && <Badge>Finalizada</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-subtle">
            {describeFrequency(s.current)}
            {account && ` · ${account.name}`}
            {s.next_occurrence && ` · próximo ${formatDate(s.next_occurrence.due_date)}`}
          </p>
        </div>
        <Amount kind={s.kind} value={s.current.amount} className="text-sm font-semibold" />
        <ChevronRight className="size-4 text-fg-faint" />
      </Link>
    </li>
  );
}

export default function RecurringPage() {
  const { data, isPending } = useSeriesList();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Recurrentes"
        subtitle="Nóminas, recibos, suscripciones y cualquier pago o cobro que se repite"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo
          </button>
        }
      />
      {isPending ? (
        <ListSkeleton rows={8} />
      ) : !data?.length ? (
        <div className="card">
          <EmptyState icon={<CalendarClock className="size-6" />} title="Aún no hay recurrentes">
            Añade tu nómina, el alquiler, la luz o tus suscripciones para ver lo que viene.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map(({ kind, title }) => {
            const items = data.filter((s) => s.kind === kind);
            if (!items.length) return null;
            return (
              <section key={kind}>
                <GroupLabel className="mb-2">
                  {title} · {items.length}
                </GroupLabel>
                <ul className="card divide-y divide-line overflow-hidden">
                  {items.map((s) => (
                    <SeriesRow key={s.id} s={s} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <SeriesForm open={creating} onClose={() => setCreating(false)} mode="create" />
    </>
  );
}
