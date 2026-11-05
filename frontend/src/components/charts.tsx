import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryExpense, Forecast, MonthFlow } from "../api/types";
import { compactEuro, useChartTheme } from "../lib/chartTheme";
import { formatDateShort, formatMoney, formatMonth } from "../lib/format";

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const monthShort = (iso: string) => MONTHS_SHORT[Number(iso.split("-")[1]) - 1];

/** Marcas del eje Y en pasos redondos (1, 2, 2,5 o 5 × 10ⁿ); por defecto incluye el 0. */
export function niceTicks(min: number, max: number, target = 4, includeZero = true): number[] {
  const lo = includeZero ? Math.min(0, min) : min;
  const hi = includeZero ? Math.max(0, max) : max;
  if (hi === lo) return [Math.floor(lo), Math.ceil(lo) + 1];
  const raw = (hi - lo) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw)!;
  const ticks = [];
  for (let t = Math.floor(lo / step) * step; t <= Math.ceil(hi / step) * step + step / 2; t += step) ticks.push(Math.round(t));
  return ticks;
}

function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-40 rounded-control border border-line bg-surface px-3 py-2.5 text-xs shadow-overlay">
      <p className="mb-1.5 font-semibold first-letter:uppercase">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 py-0.5">
          {r.color && <span className="size-2.5 rounded-sm" style={{ backgroundColor: r.color }} />}
          <span className="text-fg-subtle">{r.label}</span>
          <span className="amount ml-auto pl-3 font-semibold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

// --- Gastos por categoría (donut) ---

const MAX_SLICES = 7;

export interface DonutSlice {
  key: string;
  categoryId: number | null;
  name: string;
  value: number;
  share: number;
  fill: string;
}

/** Las 7 categorías con más gasto y el resto agrupado en "Otras". */
export function toSlices(items: CategoryExpense[], otherColor: string): DonutSlice[] {
  const slices = items.slice(0, MAX_SLICES).map((c) => ({
    key: String(c.category_id),
    categoryId: c.category_id,
    name: c.name,
    value: Number(c.amount),
    share: Number(c.share),
    fill: c.color,
  }));
  const rest = items.slice(MAX_SLICES);
  if (rest.length) {
    slices.push({
      key: "otras",
      categoryId: null,
      name: `Otras (${rest.length})`,
      value: rest.reduce((s, c) => s + Number(c.amount), 0),
      share: rest.reduce((s, c) => s + Number(c.share), 0),
      fill: otherColor,
    });
  }
  return slices;
}

export function CategoryDonut({
  slices,
  total,
  active,
  onActive,
}: {
  slices: DonutSlice[];
  total: number;
  active: string | null;
  onActive: (key: string | null) => void;
}) {
  const theme = useChartTheme();
  const current = slices.find((s) => s.key === active);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-60">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices.map((s) => ({ ...s, fillOpacity: active && s.key !== active ? 0.35 : 1 }))}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={slices.length > 1 ? 1.5 : 0}
            cornerRadius={4}
            stroke={theme.surface}
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            onMouseEnter={(_, i) => onActive(slices[i]?.key ?? null)}
            onMouseLeave={() => onActive(null)}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="max-w-[60%] truncate text-xs text-fg-subtle">{current ? current.name : "Total gastos"}</span>
        <span className="amount text-lg font-bold tracking-tight">{formatMoney(current ? current.value : total)}</span>
        {current && <span className="text-xs text-fg-subtle">{current.share.toLocaleString("es-ES")} %</span>}
      </div>
    </div>
  );
}

// --- Evolución mensual ---

export function MonthlyEvolutionChart({ data, lastInProgress = false }: { data: MonthFlow[]; lastInProgress?: boolean }) {
  const theme = useChartTheme();
  const last = data.length - 1;
  const rows = data.map((m, i) => {
    const savings = m.has_data ? Number(m.savings) : null;
    // El mes en curso aún no ha terminado: su ahorro se une con una línea discontinua para no
    // leerlo como un desplome.
    const partial = lastInProgress && i === last;
    return {
      month: m.month,
      label: monthShort(m.month),
      income: m.has_data ? Number(m.income) : null,
      expense: m.has_data ? Number(m.expense) : null,
      savings: partial ? null : savings,
      savingsPartial: lastInProgress && i >= last - 1 ? savings : null,
      partial,
    };
  });

  const values = rows.flatMap((r) => [r.income, r.expense, r.savings, r.savingsPartial]).filter((v): v is number => v !== null);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lastLabel = rows[last]?.label;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={3} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: theme.grid }}
          interval="preserveStartEnd"
          minTickGap={4}
          tick={({ x, y, payload }) => (
            <text
              x={x}
              y={Number(y) + 12}
              textAnchor="middle"
              fontSize={11}
              fontWeight={payload.value === lastLabel ? 700 : 500}
              fill={payload.value === lastLabel ? "var(--fg)" : theme.axis}
            >
              {payload.value}
            </text>
          )}
        />
        <YAxis
          ticks={ticks}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          tickFormatter={compactEuro}
          tickLine={false}
          axisLine={false}
          tick={{ fill: theme.axis, fontSize: 11 }}
          width={64}
        />
        <ReferenceLine y={0} stroke={theme.muted} />
        <Tooltip
          cursor={{ fill: theme.grid, fillOpacity: 0.5, radius: 6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof rows)[number];
            const title = formatMonth(row.month) + (row.partial ? " (en curso)" : "");
            if (row.income === null) return <TooltipBox title={title} rows={[{ label: "Sin datos", value: "" }]} />;
            return (
              <TooltipBox
                title={title}
                rows={[
                  { color: theme.income, label: "Ingresos", value: formatMoney(row.income) },
                  { color: theme.expense, label: "Gastos", value: formatMoney(row.expense) },
                  { color: theme.savings, label: "Ahorro", value: formatMoney(row.savings ?? row.savingsPartial) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="income" name="Ingresos" fill={theme.income} maxBarSize={16} radius={[4, 4, 1, 1]} isAnimationActive={false} />
        <Bar dataKey="expense" name="Gastos" fill={theme.expense} maxBarSize={16} radius={[4, 4, 1, 1]} isAnimationActive={false} />
        <Line
          dataKey="savings"
          name="Ahorro"
          type="monotone"
          stroke={theme.savings}
          strokeWidth={2}
          dot={{ r: 3.5, fill: theme.savings, stroke: theme.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: theme.savings, stroke: theme.surface, strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        {lastInProgress && (
          <Line
            dataKey="savingsPartial"
            name="Ahorro (en curso)"
            type="monotone"
            stroke={theme.savings}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last && p.cx !== undefined && p.cy !== undefined ? (
                <circle key="partial" cx={p.cx} cy={p.cy} r={3.5} fill={theme.surface} stroke={theme.savings} strokeWidth={2} />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={false}
            legendType="none"
            tooltipType="none"
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Línea de tendencia del saldo total (sin ejes): un vistazo a cómo ha ido el último año. */
export function BalanceSparkline({ values, label, className }: { values: number[]; label: string; className?: string }) {
  if (values.length < 2) return null;
  const W = 240;
  const H = 72;
  const pad = 6;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [pad + (i * (W - 2 * pad)) / (values.length - 1), pad + (1 - (v - lo) / span) * (H - 2 * pad)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={className}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity={0.2} />
          <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${lx.toFixed(1)} ${H} L${pad} ${H} Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function EvolutionLegend({ inProgress = false }: { inProgress?: boolean }) {
  const theme = useChartTheme();
  const items = [
    { label: "Ingresos", color: theme.income, kind: "bar" },
    { label: "Gastos", color: theme.expense, kind: "bar" },
    { label: "Ahorro (ingresos − gastos)", color: theme.savings, kind: "line" },
    ...(inProgress ? [{ label: "Mes en curso", color: theme.savings, kind: "dashed" }] : []),
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-fg-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.kind === "bar" ? (
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          ) : i.kind === "dashed" ? (
            <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="h-0.5 w-3.5 rounded" style={{ backgroundColor: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Vista de tabla equivalente al gráfico (accesible y para ver cifras exactas). */
export function EvolutionTable({ data }: { data: MonthFlow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-fg-subtle">
          <tr className="border-b border-line">
            <th className="py-2 text-left font-medium">Mes</th>
            <th className="py-2 text-right font-medium">Ingresos</th>
            <th className="py-2 text-right font-medium">Gastos</th>
            <th className="py-2 text-right font-medium">Ahorro</th>
            <th className="py-2 text-right font-medium">Tasa</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((m) => (
            <tr key={m.month} className="border-b border-line/60 last:border-0">
              <td className="py-1.5 capitalize">{formatMonth(m.month)}</td>
              {m.has_data ? (
                <>
                  <td className="amount py-1.5 text-right">{formatMoney(m.income)}</td>
                  <td className="amount py-1.5 text-right">{formatMoney(m.expense)}</td>
                  <td className={`amount py-1.5 text-right ${Number(m.savings) < 0 ? "text-expense" : ""}`}>{formatMoney(m.savings)}</td>
                  <td className="amount py-1.5 text-right">{m.savings_rate !== null ? `${Number(m.savings_rate).toLocaleString("es-ES")} %` : "—"}</td>
                </>
              ) : (
                <td colSpan={4} className="py-1.5 text-right text-fg-faint">
                  Sin datos
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useToggle(initial = false): [boolean, () => void] {
  const [v, setV] = useState(initial);
  return [v, () => setV((x) => !x)];
}

// --- Previsión del saldo ---

export function ForecastChart({ data }: { data: Forecast }) {
  const theme = useChartTheme();
  const rows = data.points.map((p) => ({ date: p.date, balance: Number(p.balance) }));
  const threshold = Number(data.threshold);
  const values = rows.map((r) => r.balance);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // En una línea el eje no tiene por qué empezar en 0. El umbral se muestra si está cerca de los datos;
  // si queda muy por debajo, se indica con un texto para no aplastar la curva.
  const showThreshold = threshold >= lo - Math.max(hi - lo, Math.abs(hi) * 0.1) && threshold <= hi;
  const ticks = niceTicks(showThreshold ? Math.min(lo, threshold) : lo, Math.max(hi, threshold > hi ? threshold : hi), 4, false);
  const lowest = data.lowest;
  // El mínimo se marca con un punto; su importe y fecha están en la tarjeta «Mínimo previsto».
  // Una marca por mes en el eje X
  const monthTicks = rows.filter((r) => r.date.endsWith("-01")).map((r) => r.date);

  return (
    <>
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
        <XAxis
          dataKey="date"
          ticks={monthTicks}
          tickFormatter={(d: string) => monthShort(d)}
          tickLine={false}
          axisLine={{ stroke: theme.grid }}
          tick={{ fill: theme.axis, fontSize: 11 }}
          minTickGap={4}
        />
        <YAxis
          ticks={ticks}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          tickFormatter={compactEuro}
          tickLine={false}
          axisLine={false}
          tick={{ fill: theme.axis, fontSize: 11 }}
          width={64}
        />
        <Tooltip
          cursor={{ stroke: theme.axis, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof rows)[number];
            return <TooltipBox title={formatDateShort(row.date)} rows={[{ label: "Saldo previsto", value: formatMoney(row.balance) }]} />;
          }}
        />
        {(showThreshold || threshold > hi) && (
        <ReferenceLine
          y={threshold}
          stroke={theme.critical}
          strokeWidth={1}
          label={{ value: `Umbral ${formatMoney(threshold)}`, position: "insideBottomLeft", fill: theme.axis, fontSize: 11 }}
        />
        )}
        <Area
          dataKey="balance"
          type="stepAfter"
          stroke={theme.income}
          strokeWidth={2}
          fill={theme.income}
          fillOpacity={0.1}
          baseValue={ticks[0]}
          dot={false}
          activeDot={{ r: 4, fill: theme.income, stroke: theme.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={lowest.date}
          y={Number(lowest.balance)}
          r={5}
          fill={theme.income}
          stroke={theme.surface}
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
    {!showThreshold && threshold <= hi && (
      <p className="text-xs text-fg-subtle">
        El umbral de aviso ({formatMoney(threshold)}) queda muy por debajo de la previsión y no se dibuja.
      </p>
    )}
    </>
  );
}
