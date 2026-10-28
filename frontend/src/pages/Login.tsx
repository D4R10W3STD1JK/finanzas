import { type FormEvent, useState } from "react";
import { useLogin } from "../api/hooks";
import { ErrorBox, Spinner } from "../components/ui";

export default function LoginPage() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 pb-2">
          <img src="/favicon.svg" alt="" className="size-12" />
          <h1 className="text-xl font-semibold">Finanzas</h1>
        </div>
        <div>
          <label className="label" htmlFor="username">
            Usuario
          </label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorBox error={login.error} />
        <button className="btn-primary w-full" disabled={!username || !password || login.isPending}>
          {login.isPending && <Spinner className="size-4" />}
          Entrar
        </button>
      </form>
    </div>
  );
}
