"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Crown, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";

function toMoscowEndOfDay(date: string) {
  return new Date(`${date}T20:59:59.000Z`).toISOString();
}

export function CreateRoomForm({ defaultEndDate }: { defaultEndDate: string }) {
  const router = useRouter();
  const [roomName, setRoomName] = useState("Золотая Саванна: Путь к Вершине");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [seasonName, setSeasonName] = useState("Первый сезон");
  const [endsAt, setEndsAt] = useState(defaultEndDate);
  const [finalPrize, setFinalPrize] = useState("10 000 ₽");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName,
        ownerName,
        ownerPin,
        seasonName,
        endsAt: toMoscowEndOfDay(endsAt),
        finalPrize,
      }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setError(body.error || "Не удалось создать комнату.");
      setPending(false);
      return;
    }
    router.push("/manager");
    router.refresh();
  }

  return (
    <form className="create-room-card glass-panel" onSubmit={submit}>
      <div className="login-icon"><Crown size={27} /></div>
      <p className="eyebrow">Новый прайд</p>
      <h1>Создать игровую комнату</h1>
      <p className="muted">Карта, задания и денежные награды будут скопированы из готового стартового шаблона. Дальше их можно менять только внутри этой комнаты.</p>

      <div className="form-grid-two">
        <label>
          <span className="field-label">Название комнаты</span>
          <input value={roomName} onChange={(event) => setRoomName(event.target.value)} minLength={3} maxLength={80} required />
        </label>
        <label>
          <span className="field-label">Имя руководителя</span>
          <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Например, Артём К." minLength={2} maxLength={60} required />
        </label>
        <label>
          <span className="field-label">Ваш личный PIN</span>
          <span className="input-with-icon"><LockKeyhole size={18} /><input inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={8} value={ownerPin} onChange={(event) => setOwnerPin(event.target.value.replace(/\D/g, ""))} placeholder="4–8 цифр" required /></span>
        </label>
        <label>
          <span className="field-label">Название сезона</span>
          <input value={seasonName} onChange={(event) => setSeasonName(event.target.value)} minLength={2} maxLength={80} required />
        </label>
        <label>
          <span className="field-label">Последний день сезона</span>
          <span className="input-with-icon"><CalendarDays size={18} /><input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></span>
        </label>
        <label>
          <span className="field-label">Финальный приз</span>
          <input type="text" value={finalPrize} onChange={(event) => setFinalPrize(event.target.value)} placeholder="Например, 10 000 ₽ или дополнительный выходной" maxLength={200} required />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
        Создать комнату
      </button>
    </form>
  );
}
