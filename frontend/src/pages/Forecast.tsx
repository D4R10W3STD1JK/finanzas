import clsx from "clsx";
import { CircleAlert, CircleCheck, Pencil, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAppSettings, useForecast, useSaveSettings } from "../api/hooks";
import { ForecastChart } from "../components/charts";
import { MoneyInput } from "../components/inputs";
import { Checkbox, ErrorBox, Notice, PageHeader, PageSkeleton, Segmented, Spinner } from "../components/ui";
import { formatDate, formatMoney, formatMonth, todayISO } from "../lib/format";

type Horizon = "3" | "6" | "12";

function ThresholdEditor({ value }: { value: string }) {
  const { data: settings } = useAppSettings();
  const save = useSaveSettings();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(value);

  if (!editing)
    return (
      <button className="btn-ghost px-2 py-1 text-sm" onClick={() => (setAmount(value), setEditing(true))}>
        Umbral de aviso: <strong className="amount">{formatMoney(value)}</strong>
        <Pencil className="size-3.5" />
      </button>
    );
  return (
    <div className="flex items-center gap-2">
      <div className="w-36">
        <MoneyInput value={amount} onChange={setAmount} allowNegative autoFocus />
      </div>
      <button
        className="btn-primary"
        disabled={amount === "" || save.isPending || !settings}
        onClick={() =>
          save.mutate({ ...settings!, low_balance_threshold: amount }, { onSuccess: () => setEditing(false) })
        }
      >
        {save.isPending && <Spinner className="size-4" />}
        Guardar
      </button>
      <button className="btn-ghost" onClick={() => setEditing(false)}>
        Cancelar
      </button>
      <ErrorBox error={save.error} />
    </div>
  );
}

export default function ForecastPage() {
  const [horizon, setHorizon] = useState<Horizon>("3");
  const { data: settings } = useAppSettings();
  const saveSettings = useSaveSettings();
  const { data: f, isPending, isFetching } = useForecast(Number(horizon) as 3 | 6 | 12);

  if (isPending || !f) return <PageSkeleton />;
  const accountAlerts = f.accounts.filter((a) => a.below_floor);
  const hasVariable = f.variable.months > 0;

  return (
    <>
      <PageHeader
        title="Previsión"
        subtitle="Cómo evolucionará tu saldo con los recurrentes y lo ya apuntado"
        actions={
          <div className="w-64">
            <Segmented
              value={horizon}
              options={[
                { value: "3", label: "3 meses" },
                { value: "6", label: "6 meses" },
                { value: "12", label: "12 meses" },
              ]}
              onChange={setHorizon}
            />
          </div>
        }
      />

      <div className="mb-5 space-y-3">
        {f.first_below_threshold ? (
          <Notice
            tone="critical"
            icon={TriangleAlert}
            title={f.first_below_threshold.date <= todayISO() ? "Tu saldo total ya está por debajo del umbral" : "Aviso: el saldo total bajaría del umbral"}
          >
            {f.first_below_threshold.date > todayISO() && (
              <>
                El {formatDate(f.first_below_threshold.date)} quedaría en{" "}
                <strong className="amount text-fg">{formatMoney(f.first_below_threshold.balance)}</strong>, por debajo de {formatMoney(f.threshold)}.{" "}
              </>
            )}
            El punto más bajo sería <strong className="amount text-fg">{formatMoney(f.lowest.balance)}</strong> el {formatDate(f.lowest.date)}.
          </Notice>
        ) : (
          <Notice tone="positive" icon={CircleCheck} title="Sin problemas a la vista">
            El saldo total se mantiene por encima de {formatMoney(f.threshold)} hasta el {formatDate(f.end_date)}.
          </Notice>
        )}
        {accountAlerts.map((a) => (
          <Notice key={a.account_id} tone="warning" icon={CircleAlert} title={a.name}>
            {a.type === "credit_card"
              ? `Superaría el límite de la tarjeta (${formatMoney(Math.abs(Number(a.floor)))})`
              : "Se quedaría en negativo"}{" "}
            el {formatDate(a.min_date)}, con <strong className="amount text-fg">{formatMoney(a.min)}</strong>.
          </Notice>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-5">
          <p className="stat-label">Saldo total hoy</p>
          <p className="stat-value">{formatMoney(f.start_balance)}</p>
        </div>
        <div className="card p-5">
          <p className="stat-label">Previsto el {formatDate(f.end_date)}</p>
          <p className={clsx("stat-value", Number(f.end_balance) < 0 && "text-expense")}>{formatMoney(f.end_balance)}</p>
        </div>
        <div className="card p-5">
          <p className="stat-label">Mínimo previsto ({formatDate(f.lowest.date)})</p>
          <p className={clsx("stat-value", Number(f.lowest.balance) < Number(f.threshold) && "text-expense")}>
            {formatMoney(f.lowest.balance)}
          </p>
        </div>
      </div>

      <section className="card mt-6 p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title flex items-center gap-2">
            Saldo total previsto {isFetching && <Spinner className="size-4 text-fg-faint" />}
          </h2>
          <ThresholdEditor value={f.threshold} />
        </div>
        <ForecastChart data={f} />
        <div className="mt-3 border-t border-line pt-3">
          <Checkbox
            checked={f.include_variable}
            onChange={(v) => settings && saveSettings.mutate({ ...settings, forecast_include_variable: v })}
            label={
              hasVariable
                ? `Incluir el gasto no recurrente habitual: ${formatMoney(f.variable.expense)}/mes${Number(f.variable.income) > 0 ? ` (e ingresos de ${formatMoney(f.variable.income)}/mes)` : ""}`
                : "Incluir el gasto no recurrente habitual"
            }
            hint={
              hasVariable
                ? `Media de los últimos ${f.variable.months} ${f.variable.months === 1 ? "mes" : "meses"} completos (supermercado, gasolina, ocio…), repartida por días.`
                : "Aún no hay ningún mes completo con movimientos. En cuanto lo haya, se usará su media."
            }
          />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card overflow-x-auto p-4 lg:col-span-3">
          <h2 className="card-title mb-3">Mes a mes</h2>
          <table className="w-full min-w-[34rem] text-sm lg:min-w-0">
            <thead className="text-xs text-fg-subtle">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Mes</th>
                <th className="py-2 text-right font-medium">Inicio</th>
                <th className="py-2 text-right font-medium">Ingresos</th>
                <th className="py-2 text-right font-medium">Gastos</th>
                <th className="py-2 text-right font-medium">Final</th>
                <th className="py-2 text-right font-medium">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {f.monthly.map((m) => (
                <tr key={m.month} className="border-b border-line/60 last:border-0">
                  <td className="py-2 first-letter:uppercase">{formatMonth(m.month)}</td>
                  <td className="amount py-2 text-right">{formatMoney(m.start)}</td>
                  <td className="amount py-2 text-right">{formatMoney(m.income)}</td>
                  <td className="amount py-2 text-right">{formatMoney(m.expense)}</td>
                  <td className="amount py-2 text-right font-medium">{formatMoney(m.end)}</td>
                  <td className={clsx("amount py-2 text-right", m.below_threshold && "font-semibold text-expense")}>
                    <span className="inline-flex items-center gap-1">
                      {m.below_threshold && <TriangleAlert className="size-3.5" aria-label="Por debajo del umbral" />}
                      {formatMoney(m.min)}
                    </span>
                    <span className="block text-xs font-normal text-fg-faint">{formatDate(m.min_date)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-x-auto p-4 lg:col-span-2">
          <h2 className="card-title mb-3">Por cuenta</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-fg-subtle">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Cuenta</th>
                <th className="py-2 text-right font-medium">Mínimo</th>
                <th className="py-2 text-right font-medium">Final</th>
              </tr>
            </thead>
            <tbody>
              {f.accounts.map((a) => (
                <tr key={a.account_id} className="border-b border-line/60 last:border-0">
                  <td className="py-2">
                    <Link to={`/movimientos?cuenta=${a.account_id}`} className="hover:underline">
                      {a.name}
                    </Link>
                    {!a.include_in_total && <span className="block text-xs text-fg-faint">fuera del total</span>}
                  </td>
                  <td className={clsx("amount py-2 text-right", a.below_floor && "font-semibold text-expense")}>
                    <span className="inline-flex items-center gap-1">
                      {a.below_floor && <TriangleAlert className="size-3.5" aria-label="Por debajo del mínimo" />}
                      {formatMoney(a.min)}
                    </span>
                    <span className="block text-xs font-normal text-fg-faint">{formatDate(a.min_date)}</span>
                  </td>
                  <td className="amount py-2 text-right">{formatMoney(a.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="mt-4 text-xs text-fg-subtle">
        Se parte del saldo real de hoy y se suman los recurrentes previstos (los variables con su importe estimado), los recurrentes vencidos sin confirmar
        y los movimientos que ya hayas apuntado con fecha futura. Las cuentas archivadas no se incluyen.
      </p>
    </>
  );
}
