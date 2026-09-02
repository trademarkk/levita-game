"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { AvatarPortrait } from "@/components/avatar-portrait";
import { avatars } from "@/lib/avatars";

type InviteInfo = { roomName: string; roomSlug: string; role: string; assigned: boolean };

const roleNames: Record<string, string> = {
  manager: "руководителя",
  player: "игрока",
  observer: "наблюдателя",
};

export function JoinForm({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [branch, setBranch] = useState("");
  const [avatarKey, setAvatarKey] = useState<string>(avatars[0].key);

  useEffect(() => {
    let active = true;
    fetch(`/api/join/${token}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Приглашение недоступно.");
        if (active) setInfo(body as InviteInfo);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/join/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, displayName: info?.assigned ? undefined : displayName, branch, avatarKey }),
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

  if (loading) return <div className="join-loading"><LoaderCircle className="spin" /> Проверяем приглашение…</div>;

  if (info?.assigned) {
    return (
      <div className="join-card glass-panel assigned-invite-card">
        <p className="eyebrow">Персонаж уже зарегистрирован</p>
        <h1>{info.roomName}</h1>
        <p className="relogin-hint"><ShieldCheck size={19} /> Теперь для входа достаточно общей страницы игры и личного PIN.</p>
        <button className="primary-button" type="button" onClick={() => router.push(`/room/${info.roomSlug}`)}>Перейти ко входу в комнату</button>
      </div>
    );
  }

  return (
    <form className="join-card glass-panel" onSubmit={submit}>
      <p className="eyebrow">{info ? `Приглашение ${roleNames[info.role] || "участника"}` : "Вход в комнату"}</p>
      <h1>{info?.roomName || "Золотая Саванна: Путь к Вершине"}</h1>
      {info && (
        <>
          <label className="field-label" htmlFor="display-name">Имя и первая буква фамилии</label>
          <input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Например, Анна К."
            minLength={2}
            maxLength={60}
            required
          />
          <label className="field-label" htmlFor="join-branch">Команда или студия — необязательно</label>
          <input id="join-branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="Например, Мачуги" maxLength={60} />
          <span className="field-label">Игровой персонаж</span>
          <div className="avatar-picker">
            {avatars.map((avatar) => (
              <button
                key={avatar.key}
                type="button"
                title={avatar.name}
                aria-label={avatar.name}
                aria-pressed={avatarKey === avatar.key}
                className={avatarKey === avatar.key ? "selected" : ""}
                style={{ "--avatar-color": avatar.color } as React.CSSProperties}
                onClick={() => setAvatarKey(avatar.key)}
              >
                <AvatarPortrait avatarKey={avatar.key} />
              </button>
            ))}
          </div>
        </>
      )}
      <label className="field-label" htmlFor="invite-pin">PIN из приглашения</label>
      <input
        id="invite-pin"
        className="pin-input"
        inputMode="numeric"
        pattern="[0-9]*"
        minLength={4}
        maxLength={8}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
        placeholder="••••"
        required
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending || !info} type="submit">
        {pending && <LoaderCircle className="spin" size={18} />}
        Вступить в стаю
      </button>
    </form>
  );
}
