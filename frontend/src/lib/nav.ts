import {
  ArrowLeftRight,
  CalendarClock,
  ChartSpline,
  Gauge,
  House,
  type LucideIcon,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  Shapes,
  Target,
  Wallet,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; keywords?: string };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Día a día",
    items: [
      { to: "/", label: "Inicio", icon: House, end: true, keywords: "resumen dashboard panel" },
      { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, keywords: "gastos ingresos transferencias" },
      { to: "/recurrentes", label: "Recurrentes", icon: CalendarClock, keywords: "pendientes confirmar fijos" },
    ],
  },
  {
    title: "Planificación",
    items: [
      { to: "/prevision", label: "Previsión", icon: ChartSpline, keywords: "futuro saldo previsto" },
      { to: "/presupuestos", label: "Presupuestos", icon: Gauge, keywords: "limite mensual" },
      { to: "/objetivos", label: "Objetivos", icon: Target, keywords: "ahorro metas" },
      { to: "/provisiones", label: "Provisiones", icon: PiggyBank, keywords: "hucha anual seguros" },
    ],
  },
  {
    title: "Análisis",
    items: [
      { to: "/gastos-fijos", label: "Gastos fijos", icon: Receipt, keywords: "coste mensual" },
      { to: "/suscripciones", label: "Suscripciones", icon: Repeat, keywords: "netflix spotify streaming" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { to: "/cuentas", label: "Cuentas", icon: Wallet, keywords: "bancos tarjetas efectivo saldo" },
      { to: "/categorias", label: "Categorías", icon: Shapes },
      { to: "/ajustes", label: "Ajustes", icon: Settings, keywords: "contraseña exportar importar etiquetas" },
    ],
  },
];

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Minúsculas y sin tildes, para buscar «prevision» y encontrar «Previsión». */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
