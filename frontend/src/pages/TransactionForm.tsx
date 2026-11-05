import { FileText, Image, Paperclip, Repeat, Trash, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { attachmentUrl, uploadAttachment } from "../api/client";
import { useDeleteAttachment, useDeleteTransaction, useSaveTransaction, useTransaction } from "../api/hooks";
import type { TransactionKind } from "../api/types";
import { Amount } from "../components/amount";
import { AccountSelect, CategorySelect, DateInput, MoneyInput, TagPicker } from "../components/inputs";
import { Checkbox, ConfirmDialog, ErrorBox, Field, Modal, Segmented, Spinner } from "../components/ui";
import { formatDate, formatFileSize, todayISO } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";

type FormKind = Exclude<TransactionKind, "adjustment">;

const KIND_OPTIONS: { value: FormKind; label: string; className?: string }[] = [
  { value: "expense", label: "Gasto", className: "text-expense" },
  { value: "income", label: "Ingreso", className: "text-income" },
  { value: "transfer", label: "Transferencia" },
];

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export default function TransactionForm({
  open,
  onClose,
  transactionId = null,
  defaultAccountId = null,
}: {
  open: boolean;
  onClose: () => void;
  transactionId?: number | null;
  defaultAccountId?: number | null;
}) {
  const existing = useTransaction(open ? transactionId : null);
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const removeAttachment = useDeleteAttachment();
  const qc = useQueryClient();

  const [kind, setKind] = useState<FormKind>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [concept, setConcept] = useState("");
  const [accountId, setAccountId] = useState<number | null>(defaultAccountId);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [deductible, setDeductible] = useState(false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const tx = transactionId ? existing.data : undefined;
  const isAdjustment = tx?.kind === "adjustment";

  useEffect(() => {
    if (!open) return;
    save.reset();
    setNewFiles([]);
    setUploadError(null);
    if (transactionId && !tx) return;
    if (tx) {
      setKind(tx.kind === "adjustment" ? "expense" : tx.kind);
      setAmount(tx.amount);
      setDate(tx.date);
      setConcept(tx.concept);
      setAccountId(tx.account_id);
      setToAccountId(tx.to_account_id);
      setCategoryId(tx.category_id);
      setTagIds(tx.tags.map((t) => t.id));
      setNotes(tx.notes ?? "");
      setDeductible(tx.is_deductible);
    } else {
      setKind("expense");
      setAmount("");
      setDate(todayISO());
      setConcept("");
      setAccountId(defaultAccountId);
      setToAccountId(null);
      setCategoryId(null);
      setTagIds([]);
      setNotes("");
      setDeductible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transactionId, tx?.id]);

  const changeKind = (k: FormKind) => {
    if ((k === "income") !== (kind === "income")) setCategoryId(null);
    setKind(k);
  };

  const valid = !!amount && Number(amount) > 0 && !!date && concept.trim() && accountId && (kind !== "transfer" || toAccountId);

  const submit = async () => {
    if (!valid) return;
    const saved = await save.mutateAsync({
      id: transactionId ?? undefined,
      body: {
        kind,
        amount,
        date,
        concept: concept.trim(),
        account_id: accountId!,
        to_account_id: kind === "transfer" ? toAccountId : null,
        category_id: kind === "transfer" ? null : categoryId,
        tag_ids: tagIds,
        notes: notes.trim() || null,
        is_deductible: deductible,
      },
    });
    if (newFiles.length) {
      setUploading(true);
      try {
        for (const f of newFiles) await uploadAttachment(saved.id, f);
      } catch (e) {
        setUploadError(`El movimiento se ha guardado, pero un adjunto ha fallado: ${(e as Error).message}`);
        setUploading(false);
        await qc.invalidateQueries();
        return;
      }
      setUploading(false);
      await qc.invalidateQueries();
    }
    onClose();
  };

  const title = transactionId ? (isAdjustment ? "Ajuste de saldo" : "Editar movimiento") : "Nuevo movimiento";
  const busy = save.isPending || uploading;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        footer={
          <>
            {transactionId && (
              <button className="btn-ghost mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash className="size-4" /> Borrar
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            {!isAdjustment && (
              <button className="btn-primary" onClick={submit} disabled={!valid || busy}>
                {busy && <Spinner className="size-4" />}
                Guardar
              </button>
            )}
          </>
        }
      >
        {transactionId && existing.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : isAdjustment && tx ? (
          <div className="space-y-2 text-sm">
            <p>
              Ajuste de conciliación del {formatDate(tx.date)}: <Amount kind="adjustment" value={tx.amount} />
            </p>
            <p className="text-fg-subtle">
              Los ajustes no se editan. Si es incorrecto, bórralo y vuelve a conciliar la cuenta.
            </p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {tx?.series_id && (
              <Link
                to={`/recurrentes/${tx.series_id}`}
                onClick={onClose}
                className="flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent-text hover:underline"
              >
                <Repeat className="size-4" /> Generado por un recurrente. Ver la serie
              </Link>
            )}
            <Segmented value={kind} options={KIND_OPTIONS} onChange={changeKind} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus={!transactionId} />}</Field>
              <Field label="Fecha">{(id) => <DateInput id={id} value={date} onChange={setDate} required />}</Field>
            </div>
            <Field label="Concepto">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={concept}
                  maxLength={200}
                  placeholder={kind === "transfer" ? "Ej. Traspaso a ahorro" : "Ej. Mercadona"}
                  onChange={(e) => setConcept(e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={kind === "transfer" ? "Desde la cuenta" : "Cuenta"}>
                {(id) => <AccountSelect id={id} value={accountId} onChange={setAccountId} exclude={kind === "transfer" ? toAccountId : null} />}
              </Field>
              {kind === "transfer" ? (
                <Field label="A la cuenta">
                  {(id) => <AccountSelect id={id} value={toAccountId} onChange={setToAccountId} exclude={accountId} />}
                </Field>
              ) : (
                <Field label="Categoría">
                  {(id) => <CategorySelect id={id} kind={kind} value={categoryId} onChange={setCategoryId} />}
                </Field>
              )}
            </div>
            <Field label="Etiquetas">{() => <TagPicker value={tagIds} onChange={setTagIds} />}</Field>
            <Field label="Notas">
              {(id) => <textarea id={id} className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
            {kind === "expense" && (
              <Checkbox
                checked={deductible}
                onChange={setDeductible}
                label="Deducible en la declaración de la renta"
              />
            )}

            <div>
              <span className="label">Adjuntos</span>
              <ul className="space-y-1.5">
                {tx?.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-control border border-line-strong px-3 py-2 text-sm">
                    {a.mime_type.startsWith("image/") ? <Image className="size-4 text-fg-faint" /> : <FileText className="size-4 text-fg-faint" />}
                    <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {a.filename}
                    </a>
                    <span className="text-xs text-fg-faint">{formatFileSize(a.size)}</span>
                    <button
                      type="button"
                      className="btn-ghost p-1"
                      onClick={() => removeAttachment.mutate(a.id)}
                      aria-label={`Quitar ${a.filename}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
                {newFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-control border border-dashed border-line-strong px-3 py-2 text-sm">
                    <Paperclip className="size-4 text-fg-faint" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-fg-faint">{formatFileSize(f.size)}</span>
                    <button type="button" className="btn-ghost p-1" onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))} aria-label="Quitar">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  setNewFiles([...newFiles, ...Array.from(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
              <button type="button" className="btn-secondary mt-2" onClick={() => fileInput.current?.click()}>
                <Paperclip className="size-4" /> Añadir ticket o factura
              </button>
            </div>

            <ErrorBox error={save.error ?? (uploadError ? new Error(uploadError) : null)} />
            <button type="submit" className="hidden" />
          </form>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Borrar movimiento"
        message={
          tx?.series_id
            ? "Este movimiento viene de un recurrente: la ocurrencia volverá a quedar prevista para que la confirmes a mano."
            : "Se borrará el movimiento y sus adjuntos. No se puede deshacer."
        }
        confirmLabel="Borrar"
        danger
        busy={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(transactionId!, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
      />
    </>
  );
}
