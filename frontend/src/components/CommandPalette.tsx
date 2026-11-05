import clsx from "clsx";
import { CornerDownLeft, type LucideIcon, Monitor, Moon, Plus, Search, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { NAV, normalize } from "../lib/nav";
import { useTheme } from "../lib/theme";

type Command = { id: string; group: string; label: string; icon: LucideIcon; keywords?: string; run: () => void };

/** Atajo global: Ctrl K (o ⌘ K en Mac) abre el buscador. */
export function useCommandShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}

export default function CommandPalette({
  open,
  onClose,
  onNewTransaction,
}: {
  open: boolean;
  onClose: () => void;
  onNewTransaction: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();
  const [, setTheme] = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const commands = useMemo<Command[]>(
    () => [
      { id: "new", group: "Acciones", label: "Nuevo movimiento", icon: Plus, keywords: "gasto ingreso apuntar añadir", run: onNewTransaction },
      ...NAV.map((n) => ({ id: n.to, group: "Ir a", label: n.label, icon: n.icon, keywords: n.keywords, run: () => navigate(n.to) })),
      { id: "light", group: "Tema", label: "Tema claro", icon: Sun, keywords: "modo dia", run: () => setTheme("light") },
      { id: "dark", group: "Tema", label: "Tema oscuro", icon: Moon, keywords: "modo noche", run: () => setTheme("dark") },
      { id: "system", group: "Tema", label: "Tema del sistema", icon: Monitor, keywords: "automatico", run: () => setTheme("system") },
    ],
    [navigate, onNewTransaction, setTheme],
  );

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return commands;
    return commands.filter((c) => {
      const text = normalize(`${c.label} ${c.keywords ?? ""} ${c.group}`);
      return words.every((w) => text.includes(w));
    });
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Buscar o ir a"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-overlay backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4.5 shrink-0 text-fg-subtle" aria-hidden />
            <input
              autoFocus
              className="h-13 w-full bg-transparent text-base outline-none placeholder:text-fg-faint focus-visible:outline-none"
              placeholder="Buscar sección o acción…"
              value={query}
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(results[active]);
                }
              }}
            />
            <kbd className="hidden rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle sm:block">Esc</kbd>
          </div>
          <ul id="command-results" ref={listRef} role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-fg-subtle">Nada coincide con «{query}»</li>}
            {results.map((c, i) => (
              <li key={c.id} role="presentation">
                {(i === 0 || results[i - 1].group !== c.group) && (
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{c.group}</p>
                )}
                <button
                  id={`cmd-${c.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium",
                    i === active ? "bg-surface-2 text-fg" : "text-fg-muted",
                  )}
                >
                  <c.icon className={clsx("size-4.5 shrink-0", i === active ? "text-accent" : "text-fg-subtle")} aria-hidden />
                  <span className="flex-1">{c.label}</span>
                  {i === active && <CornerDownLeft className="size-3.5 text-fg-subtle" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </dialog>
  );
}
