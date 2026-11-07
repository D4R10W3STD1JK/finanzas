import { Check, Pencil, Trash, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAppSettings, useChangePassword, useCreateUser, useDeleteTag, useMe, useSaveSettings, useSaveTag, useTags, useUsers } from "../api/hooks";
import type { Tag } from "../api/types";
import DataTransferCard from "../components/DataTransfer";
import { HolidayRegionPicker, type Region } from "../components/HolidayRegion";
import { ColorPicker, MoneyInput } from "../components/inputs";
import { Checkbox, ConfirmDialog, ErrorBox, Field, Modal, PageHeader, Spinner } from "../components/ui";

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

function UsersCard() {
  const { data: me } = useMe();
  const { data: users = [] } = useUsers();
  const create = useCreateUser();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const mismatch = repeat !== "" && password !== repeat;
  const valid = username.trim().length >= 2 && password.length >= 8 && password === repeat;

  const start = () => {
    create.reset();
    setUsername("");
    setPassword("");
    setRepeat("");
    setOpen(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      { username: username.trim(), password },
      {
        onSuccess: (u) => {
          setCreated(u.username);
          setOpen(false);
        },
      },
    );
  };

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h2 className="card-title">Usuarios</h2>
        <button className="btn-secondary px-3 py-1.5 text-[13px]" onClick={start}>
          <UserPlus className="size-4" /> Nuevo usuario
        </button>
      </div>
      <p className="mb-3 text-sm text-fg-subtle">Cada usuario tiene sus propias cuentas, movimientos y ajustes, y no ve los de los demás.</p>
      <ul className="divide-y divide-line">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-text" aria-hidden>
              {u.username.charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 truncate text-sm font-semibold">{u.username}</span>
            {u.id === me?.id && <span className="text-xs text-fg-subtle">Tú</span>}
          </li>
        ))}
      </ul>
      {created && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-positive">
          <Check className="size-4" /> {created} ya puede entrar con su contraseña
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo usuario"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" form="new-user" disabled={!valid || create.isPending}>
              {create.isPending && <Spinner className="size-4" />}
              Crear usuario
            </button>
          </>
        }
      >
        <form id="new-user" onSubmit={submit} className="space-y-4">
          <p className="text-sm text-fg-subtle">Empezará con las categorías de siempre y sin cuentas ni movimientos.</p>
          <Field label="Nombre de usuario">
            {(id) => <input id={id} className="input" autoComplete="off" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />}
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres">
            {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label="Repite la contraseña" error={mismatch ? "No coincide" : null}>
            {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
          </Field>
          <ErrorBox error={create.error} />
        </form>
      </Modal>
    </div>
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

function ForecastSettingsCard() {
  const { data } = useAppSettings();
  const save = useSaveSettings();
  const [threshold, setThreshold] = useState<string | null>(null);
  if (!data) return null;
  const value = threshold ?? data.low_balance_threshold;

  return (
    <div className="card space-y-4 p-4">
      <h2 className="font-semibold">Previsión y avisos</h2>
      <Field label="Avisar si el saldo total previsto baja de" hint="Con 0 € te avisa cuando la previsión se quedaría en negativo">
        {(id) => <MoneyInput id={id} value={value} onChange={setThreshold} allowNegative />}
      </Field>
      <Checkbox
        checked={data.forecast_include_variable}
        onChange={(v) => save.mutate({ ...data, forecast_include_variable: v })}
        label="Incluir en la previsión el gasto no recurrente habitual"
        hint="La media de supermercado, gasolina, ocio… de los últimos meses"
      />
      <ErrorBox error={save.error} />
      {save.isSuccess && threshold === null && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" /> Guardado
        </p>
      )}
      <button
        className="btn-primary"
        disabled={threshold === null || threshold === "" || save.isPending}
        onClick={() => save.mutate({ ...data, low_balance_threshold: threshold! }, { onSuccess: () => setThreshold(null) })}
      >
        Guardar umbral
      </button>
    </div>
  );
}

function HolidaysCard() {
  const { data } = useAppSettings();
  const save = useSaveSettings();
  const [chosen, setChosen] = useState<Region | null>(null);
  if (!data) return null;
  const value = chosen ?? { country: data.holidays_country, subdiv: data.holidays_subdiv ?? null };

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h2 className="font-semibold">Festivos</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Los recurrentes que se mueven a día hábil evitan los fines de semana y los festivos de aquí. Al cambiarlo se recolocan los pagos previstos; los ya confirmados no cambian.
        </p>
      </div>
      <HolidayRegionPicker value={value} onChange={setChosen} />
      <ErrorBox error={save.error} />
      {save.isSuccess && chosen === null && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" /> Guardado
        </p>
      )}
      <button
        className="btn-primary"
        disabled={chosen === null || save.isPending}
        onClick={() =>
          save.mutate({ ...data, holidays_country: value.country, holidays_subdiv: value.subdiv }, { onSuccess: () => setChosen(null) })
        }
      >
        Guardar festivos
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { data: me } = useMe();
  return (
    <>
      <PageHeader title="Ajustes" subtitle={me ? `Sesión iniciada como ${me.username}` : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ForecastSettingsCard />
        <HolidaysCard />
        <PasswordCard />
        <UsersCard />
        <TagsCard />
        <DataTransferCard />
      </div>
    </>
  );
}
