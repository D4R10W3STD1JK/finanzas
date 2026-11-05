import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAddVersion, useCreateSeries, usePatchSeries } from "../api/hooks";
import type {
  AmountMode,
  BusinessDayAdjust,
  Frequency,
  SeriesDetail,
  TransactionKind,
  Unit,
  VersionTerms,
} from "../api/types";
import { AccountSelect, CategorySelect, DateInput, MoneyInput, TagPicker } from "../components/inputs";
import { Checkbox, ErrorBox, Field, Modal, Segmented, Spinner } from "../components/ui";
import { formatDate, fromISO, todayISO } from "../lib/format";
import { ADJUSTS, FREQUENCIES, UNITS } from "../lib/labels";

type Kind = Exclude<TransactionKind, "adjustment">;
type DayMode = "anchor" | "day" | "last";
type EndMode = "never" | "date" | "count";
export type SeriesFormMode = "create" | "terms" | "settings";

const KIND_OPTIONS: { value: Kind; label: string; className?: string }[] = [
  { value: "expense", label: "Gasto", className: "text-expense" },
  { value: "income", label: "Ingreso", className: "text-income" },
  { value: "transfer", label: "Transferencia" },
];

const MONTH_BASED: Frequency[] = ["monthly", "quarterly", "semiannual", "yearly"];

interface TermsState {
  frequency: Frequency;
  interval: number;
  unit: Unit;
  dayMode: DayMode;
  day: number;
  adjust: BusinessDayAdjust;
  amountMode: AmountMode;
  amount: string;
  accountId: number | null;
  toAccountId: number | null;
  categoryId: number | null;
  concept: string;
  tagIds: number[];
}

const emptyTerms = (): TermsState => ({
  frequency: "monthly",
  interval: 1,
  unit: "month",
  dayMode: "anchor",
  day: 1,
  adjust: "none",
  amountMode: "fixed",
  amount: "",
  accountId: null,
  toAccountId: null,
  categoryId: null,
  concept: "",
  tagIds: [],
});

function termsFromSeries(s: SeriesDetail): TermsState {
  const v = s.current;
  return {
    frequency: v.frequency,
    interval: v.interval,
    unit: v.unit ?? "month",
    dayMode: v.day_of_month === -1 ? "last" : v.day_of_month ? "day" : "anchor",
    day: v.day_of_month && v.day_of_month > 0 ? v.day_of_month : 1,
    adjust: v.business_day_adjust,
    amountMode: v.amount_mode,
    amount: v.amount,
    accountId: v.account_id,
    toAccountId: v.to_account_id,
    categoryId: v.category_id,
    concept: v.concept,
    tagIds: v.tags.map((t) => t.id),
  };
}

function toApiTerms(t: TermsState, kind: Kind): VersionTerms {
  const monthBased = MONTH_BASED.includes(t.frequency) || (t.frequency === "custom" && t.unit === "month");
  return {
    frequency: t.frequency,
    interval: t.interval,
    unit: t.frequency === "custom" ? t.unit : null,
    day_of_month: !monthBased || t.dayMode === "anchor" ? null : t.dayMode === "last" ? -1 : t.day,
    business_day_adjust: t.adjust,
    amount_mode: t.amountMode,
    amount: t.amount,
    account_id: t.accountId!,
    to_account_id: kind === "transfer" ? t.toAccountId : null,
    category_id: kind === "transfer" ? null : t.categoryId,
    concept: t.concept.trim(),
    tag_ids: t.tagIds,
  };
}

function TermsFields({
  kind,
  terms,
  set,
  anchorDate,
}: {
  kind: Kind;
  terms: TermsState;
  set: (patch: Partial<TermsState>) => void;
  anchorDate: string;
}) {
  const monthBased = MONTH_BASED.includes(terms.frequency) || (terms.frequency === "custom" && terms.unit === "month");
  const anchorDay = anchorDate ? fromISO(anchorDate).getDate() : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Frecuencia">
          {(id) => (
            <select id={id} className="input" value={terms.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency, interval: 1 })}>
              {Object.entries(FREQUENCIES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        {terms.frequency === "custom" && (
          <Field label="Cada">
            {(id) => (
              <div className="flex gap-2">
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={366}
                  className="input w-20"
                  value={terms.interval}
                  onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
                />
                <select className="input" value={terms.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
                  {Object.entries(UNITS).map(([v, [one, many]]) => (
                    <option key={v} value={v}>
                      {terms.interval === 1 ? one : many}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Field>
        )}
        {monthBased && (
          <Field label="Día de cobro / pago">
            {(id) => (
              <div className="flex gap-2">
                <select id={id} className="input" value={terms.dayMode} onChange={(e) => set({ dayMode: e.target.value as DayMode })}>
                  <option value="anchor">{anchorDay ? `El día ${anchorDay} (como la fecha de inicio)` : "Como la fecha de inicio"}</option>
                  <option value="day">Un día concreto</option>
                  <option value="last">Último día del mes</option>
                </select>
                {terms.dayMode === "day" && (
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="input w-20"
                    value={terms.day}
                    onChange={(e) => set({ day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                    aria-label="Día del mes"
                  />
                )}
              </div>
            )}
          </Field>
        )}
        <Field label="Si cae en fin de semana o festivo" hint="Festivos nacionales y de la Comunitat Valenciana">
          {(id) => (
            <select id={id} className="input" value={terms.adjust} onChange={(e) => set({ adjust: e.target.value as BusinessDayAdjust })}>
              {Object.entries(ADJUSTS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {monthBased && terms.dayMode === "day" && terms.day > 28 && (
        <p className="-mt-2 text-xs text-fg-subtle">En los meses sin día {terms.day} se usará el último día del mes.</p>
      )}

      <Segmented
        value={terms.amountMode}
        options={[
          { value: "fixed", label: "Importe fijo" },
          { value: "variable", label: "Variable (ej. la luz)" },
        ]}
        onChange={(v) => set({ amountMode: v })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={terms.amountMode === "variable" ? "Importe estimado" : "Importe"}
          hint={terms.amountMode === "variable" ? "Confirmarás el importe real cuando llegue el recibo" : undefined}
        >
          {(id) => <MoneyInput id={id} value={terms.amount} onChange={(amount) => set({ amount })} />}
        </Field>
        <Field label="Concepto del movimiento">
          {(id) => <input id={id} className="input" maxLength={200} value={terms.concept} onChange={(e) => set({ concept: e.target.value })} />}
        </Field>
        <Field label={kind === "transfer" ? "Desde la cuenta" : "Cuenta"}>
          {(id) => (
            <AccountSelect
              id={id}
              value={terms.accountId}
              onChange={(accountId) => set({ accountId })}
              exclude={kind === "transfer" ? terms.toAccountId : null}
            />
          )}
        </Field>
        {kind === "transfer" ? (
          <Field label="A la cuenta">
            {(id) => <AccountSelect id={id} value={terms.toAccountId} onChange={(toAccountId) => set({ toAccountId })} exclude={terms.accountId} />}
          </Field>
        ) : (
          <Field label="Categoría">
            {(id) => <CategorySelect id={id} kind={kind} value={terms.categoryId} onChange={(categoryId) => set({ categoryId })} />}
          </Field>
        )}
      </div>
      <Field label="Etiquetas">{() => <TagPicker value={terms.tagIds} onChange={(tagIds) => set({ tagIds })} />}</Field>
    </>
  );
}

export default function SeriesForm({
  open,
  onClose,
  mode,
  series,
  defaultFrom,
}: {
  open: boolean;
  onClose: () => void;
  mode: SeriesFormMode;
  series?: SeriesDetail;
  /** Para mode "terms": fecha propuesta para "a partir de". */
  defaultFrom?: string;
}) {
  const navigate = useNavigate();
  const create = useCreateSeries();
  const patch = usePatchSeries();
  const addVersion = useAddVersion();
  const mutation = mode === "create" ? create : mode === "terms" ? addVersion : patch;

  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  const [isSubscription, setIsSubscription] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [startDate, setStartDate] = useState(todayISO());
  const [endMode, setEndMode] = useState<EndMode>("never");
  const [endDate, setEndDate] = useState("");
  const [count, setCount] = useState(12);
  const [notes, setNotes] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [terms, setTerms] = useState<TermsState>(emptyTerms);
  const [scope, setScope] = useState<"from" | "all">("from");
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());

  useEffect(() => {
    if (!open) return;
    mutation.reset();
    if (series) {
      setName(series.name);
      setKind(series.kind as Kind);
      setIsSubscription(series.is_subscription);
      setAutoConfirm(series.auto_confirm);
      setStartDate(series.start_date);
      setEndMode(series.end_date ? "date" : series.max_occurrences ? "count" : "never");
      setEndDate(series.end_date ?? "");
      setCount(series.max_occurrences ?? 12);
      setNotes(series.notes ?? "");
      setTerms(termsFromSeries(series));
      setScope("from");
      setEffectiveFrom(defaultFrom ?? todayISO());
    } else {
      setName("");
      setKind("expense");
      setIsSubscription(false);
      setAutoConfirm(true);
      setStartDate(todayISO());
      setEndMode("never");
      setEndDate("");
      setCount(12);
      setNotes("");
      setIncludePast(false);
      setTerms(emptyTerms());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, series?.id, mode]);

  const set = (p: Partial<TermsState>) => setTerms((t) => ({ ...t, ...p }));
  const termsValid =
    !!terms.amount && Number(terms.amount) > 0 && terms.concept.trim() && terms.accountId && (kind !== "transfer" || terms.toAccountId);
  const endValid = endMode === "never" || (endMode === "date" ? !!endDate && endDate >= startDate : count >= 1);
  const valid =
    mode === "create"
      ? name.trim() && startDate && termsValid && endValid
      : mode === "terms"
        ? termsValid && (scope === "all" || effectiveFrom)
        : name.trim() && endValid;

  const submit = () => {
    if (!valid) return;
    const end = { end_date: endMode === "date" ? endDate : null, max_occurrences: endMode === "count" ? count : null };
    if (mode === "create") {
      create.mutate(
        {
          name: name.trim(),
          kind,
          is_subscription: isSubscription,
          auto_confirm: autoConfirm,
          start_date: startDate,
          ...end,
          notes: notes.trim() || null,
          include_past: includePast,
          terms: toApiTerms(terms, kind),
        },
        {
          onSuccess: (s) => {
            onClose();
            navigate(`/recurrentes/${s.id}`);
          },
        },
      );
    } else if (mode === "terms") {
      addVersion.mutate(
        {
          id: series!.id,
          body: { effective_from: scope === "all" ? series!.start_date : effectiveFrom, terms: toApiTerms(terms, kind) },
        },
        { onSuccess: onClose },
      );
    } else {
      patch.mutate(
        {
          id: series!.id,
          body: { name: name.trim(), is_subscription: isSubscription, auto_confirm: autoConfirm, notes: notes.trim() || null, ...end },
        },
        { onSuccess: onClose },
      );
    }
  };

  const title = mode === "create" ? "Nuevo recurrente" : mode === "terms" ? "Cambiar importe o condiciones" : "Ajustes de la serie";
  const today = todayISO();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={!valid || mutation.isPending}>
            {mutation.isPending && <Spinner className="size-4" />}
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === "terms" && series && (
          <div className="space-y-3 rounded-control bg-surface-2 p-3">
            <Segmented
              value={scope}
              options={[
                { value: "from", label: "A partir de una fecha" },
                { value: "all", label: "Toda la serie" },
              ]}
              onChange={setScope}
            />
            {scope === "from" ? (
              <Field label="Aplicar desde" hint="Lo anterior a esta fecha y lo ya confirmado no cambia (se conserva el histórico).">
                {(id) => <DateInput id={id} value={effectiveFrom} onChange={setEffectiveFrom} />}
              </Field>
            ) : (
              <p className="text-sm text-fg-subtle">
                Se aplicará desde el inicio ({formatDate(series.start_date)}). Las ocurrencias ya confirmadas, omitidas o editadas a mano no cambian.
              </p>
            )}
          </div>
        )}

        {mode !== "terms" && (
          <>
            {mode === "create" && <Segmented value={kind} options={KIND_OPTIONS} onChange={setKind} />}
            <Field label="Nombre">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  maxLength={100}
                  placeholder="Ej. Alquiler, Nómina, Netflix…"
                  value={name}
                  onChange={(e) => {
                    if (mode === "create" && terms.concept === name) set({ concept: e.target.value });
                    setName(e.target.value);
                  }}
                />
              )}
            </Field>
          </>
        )}

        {mode === "create" && (
          <Field label="Fecha de inicio" hint="La primera vez que se cobra o paga">
            {(id) => <DateInput id={id} value={startDate} onChange={setStartDate} />}
          </Field>
        )}

        {mode !== "settings" && <TermsFields kind={kind} terms={terms} set={set} anchorDate={mode === "create" ? startDate : effectiveFrom} />}

        {mode !== "terms" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Termina">
                {(id) => (
                  <select id={id} className="input" value={endMode} onChange={(e) => setEndMode(e.target.value as EndMode)}>
                    <option value="never">Nunca</option>
                    <option value="date">En una fecha</option>
                    <option value="count">Tras un número de veces</option>
                  </select>
                )}
              </Field>
              {endMode === "date" && <Field label="Fecha de fin">{(id) => <DateInput id={id} value={endDate} onChange={setEndDate} />}</Field>}
              {endMode === "count" && (
                <Field label="Número de veces">
                  {(id) => (
                    <input id={id} type="number" min={1} className="input" value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
                  )}
                </Field>
              )}
            </div>
            <div className="space-y-3">
              {kind === "expense" && (
                <Checkbox
                  checked={isSubscription}
                  onChange={setIsSubscription}
                  label="Es una suscripción"
                  hint="Aparecerá en la vista de suscripciones (Netflix, Spotify, gimnasio…)"
                />
              )}
              <Checkbox
                checked={autoConfirm}
                onChange={setAutoConfirm}
                label="Confirmar automáticamente"
                hint="Los importes fijos se apuntan solos al llegar su fecha. Los variables siempre esperan a que confirmes el importe real."
              />
              {mode === "create" && startDate < today && (
                <Checkbox
                  checked={includePast}
                  onChange={setIncludePast}
                  label={`Registrar también lo anterior a hoy (desde el ${formatDate(startDate)})`}
                  hint="Déjalo desmarcado si el saldo inicial de la cuenta ya incluye esos pagos."
                />
              )}
            </div>
            <Field label="Notas">{(id) => <textarea id={id} className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          </>
        )}
        <ErrorBox error={mutation.error} />
      </div>
    </Modal>
  );
}
