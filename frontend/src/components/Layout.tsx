import clsx from "clsx";
import {
  ArrowLeftRight,
  CalendarClock,
  House,
  LogOut,
  Menu,
  Monitor,
  Gauge,
  Target,
  PiggyBank,
  ChartSpline,
  Receipt,
  Repeat,
  Moon,
  Settings,
  Shapes,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { useLogout, useMe } from "../api/hooks";
import { type Theme, useTheme } from "../lib/theme";

const NAV = [
  { to: "/", label: "Inicio", icon: House, end: true },
  { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { to: "/recurrentes", label: "Recurrentes", icon: CalendarClock },
  { to: "/prevision", label: "Previsión", icon: ChartSpline },
  { to: "/provisiones", label: "Provisiones", icon: PiggyBank },
  { to: "/presupuestos", label: "Presupuestos", icon: Gauge },
  { to: "/objetivos", label: "Objetivos", icon: Target },
  { to: "/gastos-fijos", label: "Gastos fijos", icon: Receipt },
  { to: "/suscripciones", label: "Suscripciones", icon: Repeat },
  { to: "/cuentas", label: "Cuentas", icon: Wallet },
  { to: "/categorias", label: "Categorías", icon: Shapes },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
];

// En el móvil, la barra inferior muestra 4 secciones; el resto va en el menú.
const MOBILE_TABS = NAV.filter((n) => ["/", "/movimientos", "/recurrentes", "/cuentas"].includes(n.to));

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Claro" },
  { value: "dark", icon: Moon, label: "Oscuro" },
  { value: "system", icon: Monitor, label: "Sistema" },
];

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      {THEMES.map(({ value, icon: I, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          aria-label={`Tema ${label.toLowerCase()}`}
          className={clsx(
            "flex flex-1 justify-center rounded-md p-1.5",
            theme === value ? "bg-white shadow-sm dark:bg-slate-700" : "text-slate-500 dark:text-slate-400",
          )}
        >
          <I className="size-4" />
        </button>
      ))}
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {NAV.map(({ to, label, icon: I, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )
          }
        >
          <I className="size-4.5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <ThemeSwitch />
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="truncate text-slate-500 dark:text-slate-400">{me?.username}</span>
        <button className="btn-ghost p-1.5" onClick={() => logout.mutate()} title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 text-lg font-semibold">
      <img src="/favicon.svg" alt="" className="size-7" />
      Finanzas
    </div>
  );
}

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <Brand />
        <div className="mt-6 flex-1">
          <NavItems />
        </div>
        <SidebarFooter />
      </aside>

      {/* Móvil: cabecera */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <Brand />
        <button className="btn-ghost p-2" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-white p-4 dark:bg-slate-900">
            <div className="mb-4 flex justify-end">
              <button className="btn-ghost p-2" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <NavItems onNavigate={() => setMenuOpen(false)} />
            </div>
            <SidebarFooter />
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
        <Outlet />
      </main>

      {/* Móvil: barra de pestañas */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {MOBILE_TABS.map(({ to, label, icon: I, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-brand-600 dark:text-brand-500" : "text-slate-500 dark:text-slate-400",
              )
            }
          >
            <I className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
