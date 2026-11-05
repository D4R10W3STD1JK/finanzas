import { useEffect, useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "tema";

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// Un único valor compartido: todos los selectores de tema (barra lateral, menú «Más», Ctrl K) lo ven igual.
let current: Theme = read();
const listeners = new Set<() => void>();

function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* almacenamiento no disponible: el tema solo dura esta sesión */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return [theme, setTheme];
}
