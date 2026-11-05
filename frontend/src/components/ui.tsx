import clsx from "clsx";
import { LoaderCircle, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx("animate-spin", className ?? "size-5")} aria-label="Cargando" />;
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-16 text-fg-faint">
      <Spinner className="size-7" />
    </div>
  );
}

/** Bloque gris animado que ocupa el sitio del contenido mientras carga. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-control bg-surface-2", className)} aria-hidden />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 rounded accent-accent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-fg-subtle">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; className?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-full gap-0.5 rounded-control bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex-1 rounded-[7px] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === o.value
              ? clsx("bg-surface text-fg shadow-card ring-1 ring-line", o.className)
              : "text-fg-subtle hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border border-line bg-surface p-0 text-fg shadow-overlay",
        "backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:rounded-2xl",
        { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size],
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button type="button" className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Cerrar">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="size-4" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-fg-muted">{message}</div>
    </Modal>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm font-medium text-red-700 dark:text-red-300">
      {message}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-card bg-surface-2 text-fg-subtle ring-1 ring-line">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-subtle">{children}</div>}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        className ?? "bg-surface-2 text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}
