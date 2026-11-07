import { type FormEvent, useState } from "react";
import { useAuthOptions, useLogin, useRegister } from "../api/hooks";
import { HolidayRegionPicker, type Region, useSuggestedRegion } from "../components/HolidayRegion";
import { ErrorBox, Field, Spinner } from "../components/ui";

type Mode = "login" | "register";

function LoginForm({ onRegister, canRegister }: { onRegister: () => void; canRegister: boolean }) {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Usuario">
        {(id) => (
          <input
            id={id}
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
      </Field>
      <Field label="Contraseña">
        {(id) => (
          <input id={id} type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <ErrorBox error={login.error} />
      <button className="btn-primary min-h-11 w-full" disabled={!username || !password || login.isPending}>
        {login.isPending && <Spinner className="size-4" />}
        Entrar
      </button>
      {canRegister && (
        <p className="pt-1 text-center text-sm text-fg-subtle">
          ¿Aún no tienes cuenta?{" "}
          <button type="button" className="link" onClick={onRegister}>
            Crear una cuenta
          </button>
        </p>
      )}
    </form>
  );
}

function RegisterForm({ onLogin }: { onLogin: (() => void) | null }) {
  const register = useRegister();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const suggested = useSuggestedRegion();
  const [chosen, setChosen] = useState<Region | null>(null);
  const region = chosen ?? suggested;
  const mismatch = repeat !== "" && password !== repeat;
  const valid = username.trim().length >= 2 && password.length >= 8 && password === repeat;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) register.mutate({ username: username.trim(), password, holidays_country: region?.country, holidays_subdiv: region?.subdiv });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre de usuario" hint="Con él entrarás a partir de ahora">
        {(id) => (
          <input
            id={id}
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres">
        {(id) => (
          <input id={id} type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <Field label="Repite la contraseña" error={mismatch ? "No coincide" : null}>
        {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
      </Field>
      {region && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">¿Dónde vives?</legend>
          <p className="text-xs text-fg-subtle">Para mover a día hábil los pagos que caigan en festivo. Puedes cambiarlo en Ajustes.</p>
          <HolidayRegionPicker value={region} onChange={setChosen} />
        </fieldset>
      )}
      <ErrorBox error={register.error} />
      <button className="btn-primary min-h-11 w-full" disabled={!valid || register.isPending}>
        {register.isPending && <Spinner className="size-4" />}
        Crear cuenta
      </button>
      {onLogin && (
        <p className="pt-1 text-center text-sm text-fg-subtle">
          ¿Ya tienes cuenta?{" "}
          <button type="button" className="link" onClick={onLogin}>
            Entrar
          </button>
        </p>
      )}
    </form>
  );
}

export default function LoginPage() {
  const options = useAuthOptions();
  const canRegister = options.data?.registration_open ?? false;
  // Instalación nueva: aún no hay nadie con quien entrar, así que se empieza creando la primera cuenta.
  const firstUser = options.data?.has_users === false;
  const [mode, setMode] = useState<Mode>("login");
  const registering = canRegister && (mode === "register" || firstUser);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-4 size-12" />
          <h1 className="text-2xl font-bold tracking-tight">{firstUser ? "Bienvenido a Finanzas" : registering ? "Crea tu cuenta" : "Entra en Finanzas"}</h1>
          <p className="mt-1.5 text-sm text-fg-subtle">
            {firstUser
              ? "Crea tu cuenta para empezar. Tendrás tus propias cuentas y movimientos; nadie más los verá."
              : registering
                ? "Tendrás tus propias cuentas y movimientos; nadie más los verá."
                : "Tus cuentas, gastos y previsiones en un solo sitio."}
          </p>
        </div>
        <div className="card p-6">
          {registering ? <RegisterForm onLogin={firstUser ? null : () => setMode("login")} /> : <LoginForm canRegister={canRegister} onRegister={() => setMode("register")} />}
        </div>
      </div>
    </div>
  );
}
