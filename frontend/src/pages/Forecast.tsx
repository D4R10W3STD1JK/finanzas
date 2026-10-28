import clsx from "clsx";
import { CircleAlert, CircleCheck, Pencil, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAppSettings, useForecast, useSaveSettings } from "../api/hooks";
import { ForecastChart } from "../components/charts";
import { MoneyInput } from "../components/inputs";
import { Checkbox, ErrorBox, PageHeader, PageLoader, Segmented, Spinner } from "../components/ui";
import { formatDate, formatMoney, formatMonth } from "../lib/format";

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

  if (isPending || !f) return <PageLoader />;
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

      {f.first_below_threshold ? (
        <div className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/60 dark:bg-red-950/40">
          <TriangleAlert className="size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
          <div>
            <p className="font-semibold">Aviso: el saldo total bajaría del umbral</p>
            <p className="text-slate-600 dark:text-slate-300">
              El {formatDate(f.first_below_threshold.date)} quedaría en{" "}
              <strong className="amount">{formatMoney(f.first_below_threshold.balance)}</strong>, por debajo de {formatMoney(f.threshold)}. El punto más bajo
              sería <strong className="amount">{formatMoney(f.lowest.balance)}</strong> el {formatDate(f.lowest.date)}.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <CircleCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <p>
            <span className="font-semibold">Sin problemas a la vista:</span> el saldo total se mantiene por encima de {formatMoney(f.threshold)} hasta el{" "}
            {formatDate(f.end_date)}.
          </p>
        </div>
      )}
      {accountAlerts.map((a) => (
        <div key={a.account_id} className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/40">
          <CircleAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p>
            <span className="font-semibold">{a.name}:</span>{" "}
            {a.type === "credit_card"
              ? `superaría el límite de la tarjeta (${formatMoney(Math.abs(Number(a.floor)))})`
              : "se quedaría en negativo"}{" "}
            el {formatDate(a.min_date)}, con <strong className="amount">{formatMoney(a.min)}</strong>.
          </p>
        </div>
      ))}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Saldo total hoy</p>
          <p className="amount mt-1 text-2xl font-semibold">{formatMoney(f.start_balance)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Previsto el {formatDate(f.end_date)}</p>
          <p className={clsx("amount mt-1 text-2xl font-semibold", Number(f.end_balance) < 0 && "text-expense")}>{formatMoney(f.end_balance)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Mínimo previsto ({formatDate(f.lowest.date)})</p>
          <p className={clsx("amount mt-1 text-2xl font-semibold", Number(f.lowest.balance) < Number(f.threshold) && "text-expense")}>
            {formatMoney(f.lowest.balance)}
          </p>
        </div>
      </div>

      <section className="card mt-6 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            Saldo total previsto {isFetching && <Spinner className="size-4 text-slate-400" />}
          </h2>
          <ThresholdEditor value={f.threshold} />
        </div>
        <ForecastChart data={f} />
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
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
          <h2 className="mb-2 font-semibold">Mes a mes</h2>
          <table className="w-full min-w-[34rem] text-sm lg:min-w-0">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr className="border-b border-slate-100 dark:border-slate-800">
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
                <tr key={m.month} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
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
                    <span className="block text-xs font-normal text-slate-400">{formatDate(m.min_date)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-x-auto p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Por cuenta</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-2 text-left font-medium">Cuenta</th>
                <th className="py-2 text-right font-medium">Mínimo</th>
                <th className="py-2 text-right font-medium">Final</th>
              </tr>
            </thead>
            <tbody>
              {f.accounts.map((a) => (
                <tr key={a.account_id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="py-2">
                    <Link to={`/movimientos?cuenta=${a.account_id}`} className="hover:underline">
                      {a.name}
                    </Link>
                    {!a.include_in_total && <span className="block text-xs text-slate-400">fuera del total</span>}
                  </td>
                  <td className={clsx("amount py-2 text-right", a.below_floor && "font-semibold text-expense")}>
                    <span className="inline-flex items-center gap-1">
                      {a.below_floor && <TriangleAlert className="size-3.5" aria-label="Por debajo del mínimo" />}
                      {formatMoney(a.min)}
                    </span>
                    <span className="block text-xs font-normal text-slate-400">{formatDate(a.min_date)}</span>
                  </td>
                  <td className="amount py-2 text-right">{formatMoney(a.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Se parte del saldo real de hoy y se suman los recurrentes previstos (los variables con su importe estimado), los recurrentes vencidos sin confirmar
        y los movimientos que ya hayas apuntado con fecha futura. Las cuentas archivadas no se incluyen.
      </p>
    </>
  );
}
