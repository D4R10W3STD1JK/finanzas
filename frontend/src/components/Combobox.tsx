import clsx from "clsx";
import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string; hint?: string };

/** Sin tildes ni mayúsculas, para buscar «cataluna» y encontrar «Cataluña». */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Desplegable con estilo propio (los <select> nativos no se pueden estilizar por dentro).
 * Con muchas opciones muestra un buscador. Se maneja con teclado: flechas, Intro, Esc, Inicio y Fin.
 */
export function Combobox({
  id,
  value,
  options,
  onChange,
  icon,
  placeholder = "Elige una opción",
  searchPlaceholder = "Buscar…",
  disabled,
}: {
  id?: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);

  const searchable = options.length > 8;
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(o.label).includes(q)) : options;
  }, [options, query]);

  const show = () => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    // Si no cabe debajo, se abre hacia arriba.
    setUpward(!!rect && window.innerHeight - rect.bottom < 340 && rect.top > window.innerHeight - rect.bottom);
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const pick = (option: ComboOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    close();
  };

  // Cerrar al pulsar fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (open) (searchable ? searchRef.current : listRef.current)?.focus();
  }, [open, searchable]);

  // Mantener visible la opción activa.
  useLayoutEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent) => {
    const last = filtered.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
      PageDown: Math.min(active + 8, last),
      PageUp: Math.max(active - 8, 0),
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={clsx("input flex min-h-10 items-center gap-2.5 text-left", open && "border-accent ring-3 ring-accent/20")}
      >
        {icon && <span className="shrink-0 text-fg-subtle">{icon}</span>}
        <span className={clsx("min-w-0 flex-1 truncate", !selected && "text-fg-faint")} title={selected?.label}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={clsx("size-4 shrink-0 text-fg-subtle transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          className={clsx(
            "absolute inset-x-0 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-overlay",
            "animate-[combo-in_120ms_ease-out]",
            upward ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top",
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2.5 border-b border-line px-3">
              <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <input
                ref={searchRef}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                className="h-11 w-full bg-transparent text-base outline-none placeholder:text-fg-faint sm:text-sm"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={!searchable && filtered[active] ? `${listId}-${active}` : undefined}
            onKeyDown={searchable ? undefined : onKeyDown}
            className="max-h-64 overflow-y-auto overscroll-contain p-1.5 outline-none [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]"
          >
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-subtle">Nada coincide con «{query}»</li>}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onPointerMove={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    i === active ? "bg-surface-2 text-fg" : "text-fg-muted",
                    isSelected && "font-semibold text-fg",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block text-xs font-normal text-fg-subtle">{o.hint}</span>}
                  </span>
                  <Check className={clsx("size-4 shrink-0 text-accent", !isSelected && "invisible")} aria-hidden />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
