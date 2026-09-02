"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, LogIn, PawPrint } from "lucide-react";

export function OwnerLogin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error || "Не удалось войти.");
      setPending(false);
      return;
    }
    router.push("/game");
    router.refresh();
  }

  return (
    <form className="login-card glass-panel" onSubmit={submit}>
      <div className="login-icon"><PawPrint size={26} /></div>
      <p className="eyebrow">Единый вход</p>
      <h2>Вернуться в саванну</h2>
      <p className="muted">Введи личный PIN. Персональная ссылка нужна только один раз — для регистрации персонажа.</p>
      <label className="field-label" htmlFor="owner-pin">Личный PIN</label>
      <div className="input-with-icon">
        <LockKeyhole size={18} />
        <input
          id="owner-pin"
          inputMode="numeric"
          pattern="[0-9]*"
          minLength={4}
          maxLength={8}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          autoComplete="current-password"
          required
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
        Открыть свою игру
      </button>
    </form>
  );
}
