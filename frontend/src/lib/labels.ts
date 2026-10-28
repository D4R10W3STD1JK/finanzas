import type { AccountType, AmountMode, BusinessDayAdjust, Frequency, OccurrenceStatus, TransactionKind, Unit } from "../api/types";

export const ACCOUNT_TYPES: Record<AccountType, string> = {
  bank: "Cuenta bancaria",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  savings: "Ahorro",
  investment: "Inversión",
};

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
  adjustment: "Ajuste de saldo",
};

export const FREQUENCIES: Record<Frequency, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
  custom: "Personalizada",
};

export const UNITS: Record<Unit, [string, string]> = {
  day: ["día", "días"],
  week: ["semana", "semanas"],
  month: ["mes", "meses"],
};

export const ADJUSTS: Record<BusinessDayAdjust, string> = {
  none: "No ajustar",
  previous: "Día hábil anterior",
  next: "Día hábil siguiente",
};

export const AMOUNT_MODES: Record<AmountMode, string> = {
  fixed: "Importe fijo",
  variable: "Importe variable (estimado)",
};

export const OCCURRENCE_STATUS: Record<OccurrenceStatus, string> = {
  planned: "Prevista",
  confirmed: "Confirmada",
  skipped: "Omitida",
};

export function describeFrequency(v: {
  frequency: Frequency;
  interval: number;
  unit?: Unit | null;
  day_of_month?: number | null;
}): string {
  let text: string;
  if (v.frequency === "custom" && v.unit) {
    const [one, many] = UNITS[v.unit];
    text = v.interval === 1 ? `Cada ${one}` : `Cada ${v.interval} ${many}`;
  } else {
    text = FREQUENCIES[v.frequency];
    if (v.interval > 1) text += ` (cada ${v.interval})`;
  }
  const monthly = ["monthly", "quarterly", "semiannual", "yearly"].includes(v.frequency) || v.unit === "month";
  if (monthly && v.day_of_month) {
    text += v.day_of_month === -1 ? ", último día" : `, día ${v.day_of_month}`;
  }
  return text;
}
