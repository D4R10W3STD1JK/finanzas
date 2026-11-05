import clsx from "clsx";
import { CalendarDays, Check, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccounts, useCategories, useSaveTag, useTags } from "../api/hooks";
import type { CategoryKind } from "../api/types";
import { formatAmountInput, formatDate, parseAmount, parseDate } from "../lib/format";
import { ACCOUNT_TYPES } from "../lib/labels";
import { COLORS, ICONS, Icon } from "./icons";

/**
 * Campo de importe en formato español. `value` es el importe de la API ("1234.56") o "" si vacío;
 * mientras se escribe se mantiene el texto tal cual y se formatea al salir del campo.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = "0,00",
  autoFocus,
  allowNegative,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(() => formatAmountInput(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatAmountInput(value));
  }, [value]);

  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-8 text-right tabular-nums"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          const t = allowNegative ? e.target.value : e.target.value.replace("-", "");
          setText(t);
          onChange(parseAmount(t) ?? "");
        }}
        onBlur={() => {
          focused.current = false;
          const parsed = parseAmount(text);
          setText(parsed ? formatAmountInput(parsed) : text);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-subtle">€</span>
    </div>
  );
}

/** Fecha en formato dd/mm/aaaa con botón de calendario nativo. `value` en ISO (aaaa-mm-dd) o "". */
export function DateInput({
  id,
  value,
  onChange,
  required,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
}) {
  const [text, setText] = useState(formatDate(value) === "—" ? "" : formatDate(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (parseDate(text) !== value) setText(value ? formatDate(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const invalid = text !== "" && parseDate(text) === null;

  return (
    <div className="relative">
      <input
        id={id}
        className={clsx("input pr-10", invalid && "border-danger hover:border-danger focus:border-danger focus:ring-danger/20")}
        placeholder="dd/mm/aaaa"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const iso = parseDate(e.target.value);
          if (iso) onChange(iso);
          else if (e.target.value === "") onChange("");
        }}
        onBlur={() => {
          const iso = parseDate(text);
          if (iso) setText(formatDate(iso));
        }}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center px-3 text-fg-subtle hover:text-fg"
        onClick={() => picker.current?.showPicker?.()}
        aria-label="Abrir calendario"
        tabIndex={-1}
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 size-0 opacity-0"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}

export function AccountSelect({
  id,
  value,
  onChange,
  exclude,
  placeholder = "Selecciona una cuenta",
}: {
  id?: string;
  value: number | null;
  onChange: (id: number | null) => void;
  exclude?: number | null;
  placeholder?: string;
}) {
  const { data: accounts = [] } = useAccounts(true);
  const visible = accounts.filter((a) => a.id !== exclude && (!a.archived || a.id === value));
  return (
    <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {visible.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {ACCOUNT_TYPES[a.type]}
        </option>
      ))}
    </select>
  );
}

export function CategorySelect({
  id,
  kind,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = "Sin categoría",
  parentSuffix = "(general)",
}: {
  id?: string;
  kind: CategoryKind;
  value: number | null;
  onChange: (id: number | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Texto tras la categoría principal cuando tiene subcategorías. */
  parentSuffix?: string;
}) {
  const { data: categories = [] } = useCategories();
  const groups = useMemo(() => {
    const own = categories.filter((c) => c.kind === kind && (!c.archived || c.id === value));
    return own
      .filter((c) => c.parent_id === null)
      .map((parent) => ({ parent, children: own.filter((c) => c.parent_id === parent.id) }));
  }, [categories, kind, value]);

  return (
    <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {groups.map(({ parent, children }) =>
        children.length ? (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>
              {parent.name} {parentSuffix}
            </option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={parent.id} value={parent.id}>
            {parent.name}
          </option>
        ),
      )}
    </select>
  );
}

/** Selector de etiquetas con creación al vuelo. */
export function TagPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { data: tags = [] } = useTags();
  const saveTag = useSaveTag();
  const [newName, setNewName] = useState("");

  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id]);
    } else {
      const tag = await saveTag.mutateAsync({ body: { name, color: COLORS[tags.length % COLORS.length] } });
      onChange([...value, tag.id]);
    }
    setNewName("");
  };

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = value.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  on ? "border-transparent text-white" : "border-line-strong text-fg-muted hover:bg-surface-2",
                )}
                style={on ? { backgroundColor: t.color } : undefined}
              >
                {on && <Check className="size-3" />}
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Nueva etiqueta"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={create} disabled={!newName.trim() || saveTag.isPending}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: string }) {
  return (
    <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-control border border-line-strong p-1.5 sm:grid-cols-10">
      {Object.keys(ICONS).map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={clsx(
            "flex aspect-square items-center justify-center rounded-md transition-colors",
            value === name ? "text-white" : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
          )}
          style={value === name ? { backgroundColor: color } : undefined}
          aria-label={name}
        >
          <Icon name={name} className="size-4.5" />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={clsx(
            "size-7 rounded-full ring-offset-2 ring-offset-surface transition",
            value === c && "ring-2 ring-fg",
          )}
          style={{ backgroundColor: c }}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}
