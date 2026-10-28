import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileUp, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError } from "../api/client";
import { formatDate } from "../lib/format";
import { Checkbox, ErrorBox, Modal, Spinner } from "./ui";

interface ImportSummary {
  counts: Record<string, number>;
  schema_revision: string | null;
  exported_at: string | null;
  attachment_files: number;
  dry_run: boolean;
}

// Solo se muestran las tablas que una persona reconoce; el resto son detalles internos.
const LABELS: Record<string, [string, string]> = {
  accounts: ["cuenta", "cuentas"],
  categories: ["categoría", "categorías"],
  tags: ["etiqueta", "etiquetas"],
  transactions: ["movimiento", "movimientos"],
  attachments: ["adjunto", "adjuntos"],
  recurring_series: ["recurrente", "recurrentes"],
  budgets: ["presupuesto", "presupuestos"],
  savings_goals: ["objetivo de ahorro", "objetivos de ahorro"],
};

async function postImport(file: File, dryRun: boolean): Promise<ImportSummary> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`/api/data/import?dry_run=${dryRun}`, { method: "POST", body, credentials: "same-origin" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.detail ?? "No se ha podido leer el fichero");
  return data;
}

function describe(counts: Record<string, number>) {
  return Object.entries(LABELS)
    .filter(([table]) => counts[table])
    .map(([table, [one, many]]) => `${counts[table].toLocaleString("es-ES")} ${counts[table] === 1 ? one : many}`)
    .join(", ");
}

export default function DataTransferCard() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [withAttachments, setWithAttachments] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      setPreview(await postImport(f, true));
      setFile(f);
      setConfirmed(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await postImport(file, false);
      setDone(result);
      setPreview(null);
      setFile(null);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    } catch (e) {
      setError(e);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-4 lg:col-span-2">
      <div>
        <h2 className="font-semibold">Exportar e importar datos</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Un fichero JSON con todos tus datos: para guardarlo en un USB, pasarlo a otro equipo o recuperarlo más adelante. Las copias de seguridad
          automáticas se siguen haciendo aparte.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a className="btn-primary" href={`/api/data/export?include_attachments=${withAttachments}`} download>
          <Download className="size-4" /> Exportar todo
        </a>
        <Checkbox checked={withAttachments} onChange={setWithAttachments} label="Incluir tickets y facturas adjuntos" />
      </div>

      <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ""))} />
        <button className="btn-secondary" onClick={() => input.current?.click()} disabled={busy}>
          {busy && !preview ? <Spinner className="size-4" /> : <FileUp className="size-4" />}
          Importar desde un fichero…
        </button>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Antes de cambiar nada te enseñaremos qué contiene el fichero.</p>
      </div>

      <ErrorBox error={error} />
      {done && (
        <p className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <Check className="mt-0.5 size-4 shrink-0" /> Datos importados: {describe(done.counts) || "el fichero estaba vacío"}.
        </p>
      )}

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title="Sustituir todos los datos"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPreview(null)}>
              Cancelar
            </button>
            <button className="btn-danger" disabled={!confirmed || busy} onClick={runImport}>
              {busy && <Spinner className="size-4" />}
              Sustituir mis datos
            </button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="font-medium">{file?.name}</p>
              {preview.exported_at && <p className="text-slate-500 dark:text-slate-400">Exportado el {formatDate(preview.exported_at)}</p>}
              <p className="mt-2">Contiene: {describe(preview.counts) || "ningún dato"}.</p>
              {preview.counts.attachments > preview.attachment_files && (
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  El fichero no incluye los ficheros de {preview.counts.attachments - preview.attachment_files} adjuntos: esos tickets no se podrán abrir.
                </p>
              )}
            </div>
            <p className="flex gap-2 text-red-700 dark:text-red-400">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              Todos los datos actuales (cuentas, movimientos, recurrentes, presupuestos…) se borrarán y se sustituirán por los del fichero. Tu usuario y
              contraseña no cambian.
            </p>
            <Checkbox
              checked={confirmed}
              onChange={setConfirmed}
              label="Entiendo que se sustituyen todos los datos"
              hint="Si no lo has hecho, cancela y pulsa antes «Exportar todo» para guardar una copia de lo que tienes ahora."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
