import { useEffect, useState } from "react";

// Paleta de gráficos validada (CVD, contraste) contra las superficies de la app:
// blanco en claro y #141418 en oscuro (misma luminancia que el slate-900 original). Cada modo tiene sus propios tonos.
const LIGHT = {
  income: "#2a78d6",
  expense: "#eb6834",
  savings: "#6250d6",
  surface: "#ffffff",
  grid: "#e7e7ec",
  axis: "#6e6e78",
  muted: "#d4d4db",
  critical: "#d03b3b", // estado, siempre acompañado de etiqueta
};

const DARK: typeof LIGHT = {
  income: "#3987e5",
  expense: "#d95926",
  savings: "#9085e9",
  surface: "#141418",
  grid: "#26262e",
  axis: "#8e8e99",
  muted: "#34343d",
  critical: "#d03b3b",
};

export type ChartTheme = typeof LIGHT;

function isDark() {
  return document.documentElement.classList.contains("dark");
}

/** Colores del gráfico según el tema activo; se actualiza al cambiar de claro a oscuro. */
export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark ? DARK : LIGHT;
}

/** Ejes compactos: 1.500 → "1,5 mil", 12000 → "12 mil". */
export function compactEuro(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} mil €`;
  }
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}
