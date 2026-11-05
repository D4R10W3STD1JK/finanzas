import clsx from "clsx";
import { Ellipsis, LogOut, Monitor, Moon, Plus, Search, Sun } from "lucide-react";
import { useCallback, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useLogout, useMe, useOccurrences } from "../api/hooks";
import { addDays, todayISO } from "../lib/format";
import { NAV, NAV_GROUPS, type NavItem } from "../lib/nav";
import { type Theme, useTheme } from "../lib/theme";
import TransactionForm from "../pages/TransactionForm";
import CommandPalette, { useCommandShortcut } from "./CommandPalette";
import { Modal } from "./ui";

// En el móvil, la barra inferior muestra 4 secciones y el botón «+»; el resto va en «Más».
const MOBILE_TABS = ["/", "/movimientos", "/prevision"];
const [TAB_HOME, TAB_MOVES, TAB_FORECAST] = MOBILE_TABS.map((to) => NAV.find((n) => n.to === to)!);

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Claro" },
  { value: "dark", icon: Moon, label: "Oscuro" },
  { value: "system", icon: Monitor, label: "Sistema" },
];

/** Recurrentes vencidos que esperan confirmación manual (la misma consulta que usa Inicio). */
function usePendingCount() {
  const { data } = useOccurrences({ status: ["planned"], date_to: addDays(todayISO(), -1) });
  return data?.length ?? 0;
}

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="flex gap-0.5 rounded-control bg-surface-2 p-[3px]" role="group" aria-label="Tema">
      {THEMES.map(({ value, icon: I, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          aria-label={`Tema ${label.toLowerCase()}`}
          aria-pressed={theme === value}
          className={clsx(
            "flex flex-1 justify-center rounded-[7px] py-1.5 transition-colors",
            theme === value ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-fg-subtle hover:text-fg",
          )}
        >
          <I className="size-4" />
        </button>
      ))}
    </div>
  );
}

function PendingBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning tabular-nums" aria-label={`${count} pendientes`}>
      {count}
    </span>
  );
}

function NavRow({ item, pending, onNavigate }: { item: NavItem; pending?: number; onNavigate?: () => void }) {
  const { to, label, icon: I, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          "group flex min-h-11 items-center lg:min-h-9 gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
          isActive ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          <I className={clsx("size-4.5 shrink-0", isActive ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} />
          {label}
          {to === "/recurrentes" && <PendingBadge count={pending ?? 0} />}
        </>
      )}
    </NavLink>
  );
}

function UserCard() {
  const { data: me } = useMe();
  const logout = useLogout();
  const name = me?.username ?? "";
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="grid size-8.5 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-text" aria-hidden>
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
      <button className="btn-ghost p-2" onClick={() => logout.mutate()} title="Cerrar sesión" aria-label="Cerrar sesión">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 text-base font-bold tracking-tight">
      <img src="/favicon.svg" alt="" className="size-8" />
      Finanzas
    </div>
  );
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-9.5 w-full items-center gap-2.5 rounded-control bg-surface px-2.5 text-sm text-fg-subtle ring-1 ring-line transition-colors ring-inset hover:bg-surface-2 hover:text-fg-muted"
    >
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-left">Buscar o ir a…</span>
      <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold">{IS_MAC ? "⌘ K" : "Ctrl K"}</kbd>
    </button>
  );
}

function MobileTab({ item }: { item: NavItem }) {
  const { to, label, icon: I, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "flex min-h-13 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
          isActive ? "text-accent-text" : "text-fg-subtle",
        )
      }
    >
      <I className="size-5" />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const pending = usePendingCount();
  const { pathname } = useLocation();
  const inMore = !MOBILE_TABS.some((to) => (to === "/" ? pathname === "/" : pathname.startsWith(to)));

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const newTransaction = useCallback(() => setCreating(true), []);
  useCommandShortcut(openPalette);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line px-3.5 py-5 lg:flex">
        <div className="px-1.5">
          <Brand />
        </div>
        <SearchButton onClick={openPalette} />
        <nav aria-label="Principal" className="flex-1">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{g.title}</p>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <NavRow key={item.to} item={item} pending={pending} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-3">
          <ThemeSwitch />
          <UserCard />
        </div>
      </aside>

      {/* Móvil: cabecera */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-2 backdrop-blur-md lg:hidden">
        <Brand />
        <button className="btn-ghost p-2.5" onClick={openPalette} aria-label="Buscar o ir a">
          <Search className="size-5" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Móvil: barra de pestañas con el botón de nuevo movimiento en el centro */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 flex items-center border-t border-line bg-surface/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <MobileTab item={TAB_HOME} />
        <MobileTab item={TAB_MOVES} />
        <div className="flex flex-1 justify-center">
          <button
            onClick={newTransaction}
            aria-label="Nuevo movimiento"
            className="-mt-5 grid size-13 place-items-center rounded-2xl bg-accent text-accent-fg shadow-lg ring-4 shadow-accent/30 ring-canvas transition-transform active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.25} />
          </button>
        </div>
        <MobileTab item={TAB_FORECAST} />
        <button
          onClick={() => setMoreOpen(true)}
          className={clsx(
            "relative flex min-h-13 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
            inMore ? "text-accent-text" : "text-fg-subtle",
          )}
        >
          <Ellipsis className="size-5" />
          Más
          {pending > 0 && <span className="absolute top-2 left-1/2 ml-2 size-2 rounded-full bg-warning ring-2 ring-surface" aria-label="Hay pendientes" />}
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Más secciones">
        <div className="space-y-4 pb-2">
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((i) => !MOBILE_TABS.includes(i.to));
            if (!items.length) return null;
            return (
              <div key={g.title}>
                <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{g.title}</p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavRow key={item.to} item={item} pending={pending} onNavigate={() => setMoreOpen(false)} />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="space-y-3 border-t border-line pt-4">
            <ThemeSwitch />
            <UserCard />
          </div>
        </div>
      </Modal>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewTransaction={() => {
          setMoreOpen(false);
          newTransaction();
        }}
      />
      <TransactionForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
