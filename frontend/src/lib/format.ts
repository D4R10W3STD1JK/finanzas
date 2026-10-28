// Formato español: 1.234,56 € y dd/mm/aaaa.
// Ojo: Intl con "es-ES" no agrupa los miles en números de 4 cifras (1234,56) salvo con useGrouping "always".

const moneyFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const numberFmt = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

/** Importe de la API ("1234.56") → "1.234,56 €". */
export function formatMoney(value: string | number | null | undefined, opts?: { sign?: boolean }): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  const text = moneyFmt.format(n);
  return opts?.sign && n > 0 ? `+${text}` : text;
}

/** Importe sin símbolo de moneda, para rellenar campos de formulario: "1234.5" → "1.234,50". */
export function formatAmountInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return numberFmt.format(Number(value));
}

/**
 * Texto escrito por el usuario → importe para la API ("1234.56"), o null si no es válido.
 * Acepta "1.234,56", "1234,56", "1234.56" y "1234".
 */
export function parseAmount(text: string): string | null {
  let s = text.trim().replace(/\s|€/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (s.includes(",")) {
    // Formato español: los puntos son separadores de miles.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" sin coma: también son miles.
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return `${negative ? "-" : ""}${String(Number(int))}.${dec.padEnd(2, "0")}`;
}

/** "2026-10-28" → "28/10/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "2026-10-28" → "mié 28 oct" */
export function formatDateShort(iso: string): string {
  const d = fromISO(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function formatMonth(iso: string): string {
  const d = fromISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "28/10/2026" (también 28-10-26, 28.10.2026, 2/3/26) → "2026-10-28", o null si no es una fecha válida. */
export function parseDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toISO(d);
}

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Primer y último día del mes que contiene la fecha, desplazado `offset` meses. */
export function monthRange(iso: string, offset = 0): { from: string; to: string } {
  const d = fromISO(iso);
  const first = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return { from: toISO(first), to: toISO(last) };
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromISO(toIso).getTime() - fromISO(fromIso).getTime()) / 86_400_000);
}

export function relativeDay(iso: string, today = todayISO()): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === -1) return "ayer";
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("es-ES", { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}
