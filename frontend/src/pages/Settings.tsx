import { Check, Pencil, Trash } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useChangePassword, useDeleteTag, useMe, useSaveTag, useTags } from "../api/hooks";
import type { Tag } from "../api/types";
import { ColorPicker } from "../components/inputs";
import { ConfirmDialog, ErrorBox, Field, Modal, PageHeader, Spinner } from "../components/ui";

function PasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const mismatch = repeat !== "" && next !== repeat;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setRepeat("");
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-4">
      <h2 className="font-semibold">Cambiar contraseña</h2>
      <Field label="Contraseña actual">
        {(id) => <input id={id} type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
        {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="Repite la nueva contraseña" error={mismatch ? "No coincide" : null}>
        {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
      </Field>
      <ErrorBox error={change.error} />
      {change.isSuccess && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" /> Contraseña actualizada
        </p>
      )}
      <button className="btn-primary" disabled={!current || next.length < 8 || next !== repeat || change.isPending}>
        {change.isPending && <Spinner className="size-4" />}
        Cambiar contraseña
      </button>
    </form>
  );
}

function TagsCard() {
  const { data: tags = [] } = useTags();
  const save = useSaveTag();
  const remove = useDeleteTag();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [deleting, setDeleting] = useState<Tag | null>(null);

  const open = (t: Tag) => {
    save.reset();
    setEditing(t);
    setName(t.name);
    setColor(t.color);
  };

  return (
    <div className="card p-4">
      <h2 className="mb-1 font-semibold">Etiquetas</h2>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Se crean desde el formulario de cada movimiento. Aquí puedes renombrarlas o borrarlas.</p>
      {tags.length === 0 ? (
        <p className="text-sm text-slate-400">Aún no hay etiquetas.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="flex-1 text-sm">{t.name}</span>
              <button className="btn-ghost p-1.5" onClick={() => open(t)} aria-label={`Editar ${t.name}`}>
                <Pencil className="size-4" />
              </button>
              <button className="btn-ghost p-1.5" onClick={() => setDeleting(t)} aria-label={`Borrar ${t.name}`}>
                <Trash className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Editar etiqueta"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={!name.trim() || save.isPending}
              onClick={() => save.mutate({ id: editing!.id, body: { name: name.trim(), color } }, { onSuccess: () => setEditing(null) })}
            >
              Guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Color">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
          <ErrorBox error={save.error} />
        </div>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title="Borrar etiqueta"
        message={`Se quitará la etiqueta «${deleting?.name}» de todos los movimientos.`}
        confirmLabel="Borrar"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting!.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { data: me } = useMe();
  return (
    <>
      <PageHeader title="Ajustes" subtitle={me ? `Sesión iniciada como ${me.username}` : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PasswordCard />
        <TagsCard />
      </div>
    </>
  );
}
