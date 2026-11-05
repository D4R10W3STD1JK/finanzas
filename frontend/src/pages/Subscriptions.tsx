import { Repeat } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAccounts, useCategories, useRecurringCosts } from "../api/hooks";
import { IconBadge } from "../components/icons";
import { Badge, EmptyState, PageHeader, PageSkeleton, Segmented } from "../components/ui";
import { daysBetween, formatDate, formatMoney, todayISO } from "../lib/format";
import { describeFrequency } from "../lib/labels";

type Sort = "renewal" | "cost";

function renewalText(iso: string | null, today: string): { text: string; soon: boolean } {
  if (!iso) return { text: "Sin próxima renovación", soon: false };
  const n = daysBetween(today, iso);
  const text = n === 0 ? "Se renueva hoy" : n === 1 ? "Se renueva mañana" : `Se renueva en ${n} días`;
  return { text, soon: n <= 7 };
}

export default function SubscriptionsPage() {
  const { data, isPending } = useRecurringCosts();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts(true);
  const [sort, setSort] = useState<Sort>("renewal");
  const today = todayISO();

  if (isPending) return <PageSkeleton />;
  const subs = (data?.items ?? []).filter((i) => i.is_subscription);
  subs.sort((a, b) =>
    sort === "cost"
      ? Number(b.monthly) - Number(a.monthly)
      : (a.next_due_date ?? "9999").localeCompare(b.next_due_date ?? "9999"),
  );

  return (
    <>
      <PageHeader title="Suscripciones" subtitle="Lo que pagas por servicios que se renuevan solos" />
      {!subs.length ? (
        <div className="card">
          <EmptyState icon={<Repeat className="size-6" />} title="No hay suscripciones">
            Marca un recurrente como «Es una suscripción» (en sus Ajustes) para verlo aquí.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-5">
              <p className="stat-label">Al mes</p>
              <p className="stat-value">{formatMoney(data!.subscriptions.monthly)}</p>
            </div>
            <div className="card p-5">
              <p className="stat-label">Al año</p>
              <p className="stat-value">{formatMoney(data!.subscriptions.annual)}</p>
            </div>
            <div className="card p-5">
              <p className="stat-label">Suscripciones activas</p>
              <p className="stat-value">{subs.length}</p>
            </div>
          </div>

          <div className="mt-6 mb-3 flex items-center justify-between gap-3">
            <h2 className="card-title">Detalle</h2>
            <div className="w-64">
              <Segmented
                value={sort}
                options={[
                  { value: "renewal", label: "Por renovación" },
                  { value: "cost", label: "Por coste" },
                ]}
                onChange={setSort}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((s) => {
              const cat = categories.find((c) => c.id === s.category_id);
              const account = accounts.find((a) => a.id === s.account_id);
              const renewal = renewalText(s.next_due_date, today);
              return (
                <Link key={s.series_id} to={`/recurrentes/${s.series_id}`} className="card flex flex-col p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <IconBadge icon={cat?.icon ?? "repeat"} color={cat?.color ?? "#8b5cf6"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-xs text-fg-subtle">
                        {formatMoney(s.base_amount)} · {describeFrequency(s).toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="amount text-xl font-semibold">{formatMoney(s.monthly)}</span>
                    <span className="text-xs text-fg-subtle">/mes · {formatMoney(s.annual)}/año</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
                    <Badge
                      className={
                        renewal.soon
                          ? "bg-warning-soft text-warning"
                          : "bg-surface-2 text-fg-muted"
                      }
                    >
                      {renewal.text}
                    </Badge>
                    {s.next_due_date && <span className="text-fg-subtle">{formatDate(s.next_due_date)}</span>}
                  </div>
                  <p className="mt-2 text-xs text-fg-subtle">
                    {s.last_12m_count > 0 ? `Pagado en los últimos 12 meses: ${formatMoney(s.last_12m_total)}` : "Aún sin pagos registrados"}
                    {account && ` · ${account.name}`}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
