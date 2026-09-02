"use client";

import { useState } from "react";
import { Gift, LoaderCircle, RotateCcw, Save, ScrollText } from "lucide-react";
import { cellMeta } from "@/lib/board";
import type { CellType, ManagedBoardCell } from "@/lib/types";

const roleOptions: Array<{ value: Exclude<CellType, "finish">; label: string }> = [
  { value: "normal", label: "Обычная клетка" },
  { value: "trap", label: "Задание" },
  { value: "treasure", label: "Награда" },
  { value: "surprise", label: "Событие" },
  { value: "setback", label: "Препятствие" },
  { value: "accelerate", label: "Ускорение" },
];

export function boardCellUpdatePayload(draft: ManagedBoardCell): Record<string, unknown> {
  const base = {
    action: "update",
    cellNumber: draft.number,
    type: draft.type,
  };

  if (draft.type === "trap") {
    return {
      ...base,
      title: draft.title,
      description: draft.description,
      taskAchievementTag: draft.taskAchievementTag,
    };
  }
  if (draft.type === "treasure") {
    return {
      ...base,
      rewardName: draft.rewardName,
      rewardValue: draft.rewardValue || 300,
      rewardQuantity: 12,
      rewardBrandChoices: draft.rewardBrandChoices,
    };
  }
  if (draft.type === "surprise") return { ...base, description: draft.description };
  if (draft.type === "setback") return { ...base, value: Math.abs(draft.value || 1) };
  if (draft.type === "accelerate") {
    return {
      ...base,
      effect: draft.effect || "move",
      value: Math.abs(draft.value || 1),
    };
  }
  return base;
}

export function BoardCellEditor({
  cells,
  onUpdated,
}: {
  cells: ManagedBoardCell[];
  onUpdated: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ManagedBoardCell>(cells[0]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function patch(values: Partial<ManagedBoardCell>) {
    setDraft((current) => ({ ...current, ...values }));
  }

  function changeRole(type: Exclude<CellType, "finish">) {
    setMessage("");
    setDraft((current) => ({
      ...current,
      type,
      title: type === "trap" ? current.title : "",
      description: type === "trap" || type === "surprise" ? current.description : "",
      taskAchievementTag: type === "trap" ? current.taskAchievementTag : null,
      effect: type === "accelerate" ? current.effect || "move" : type === "setback" ? "move" : undefined,
      value: type === "setback" ? -Math.max(1, Math.min(2, Math.abs(current.value || 1)))
        : type === "accelerate" ? Math.max(1, Math.min(2, Math.abs(current.value || 1)))
          : undefined,
      rewardName: type === "treasure" ? current.rewardName : "",
      rewardValue: type === "treasure" ? current.rewardValue || 300 : 0,
      rewardQuantity: type === "treasure" ? 12 : 1,
      rewardBrandChoices: type === "treasure" ? current.rewardBrandChoices : [],
    }));
  }

  async function send(body: Record<string, unknown>) {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/manager/board-cell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string; cell?: ManagedBoardCell };
    setPending(false);
    if (!response.ok || !result.cell) {
      setMessage(result.error || "Не удалось сохранить клетку.");
      return;
    }
    setDraft(result.cell);
    setMessage("Настройка клетки сохранена.");
    await onUpdated();
  }

  async function save() {
    await send(boardCellUpdatePayload(draft));
  }

  async function reset() {
    await send({ action: "reset", cellNumber: draft.number });
  }

  return (
    <div className="cell-editor-layout">
      <section className="manager-card cell-map-card">
        <div className="section-heading">
          <div><p className="eyebrow">Конструктор поля</p><h2>Выбери клетку</h2></div>
          <ScrollText />
        </div>
        <p>Финиш закреплён за клеткой 60. Остальные клетки можно менять в любой момент.</p>
        <div className="cell-editor-grid">
          {cells.map((cell) => (
            <button
              key={cell.number}
              type="button"
              disabled={cell.number === 60}
              className={`${draft.number === cell.number ? "selected" : ""} ${cell.custom ? "custom" : ""}`}
              style={{ "--cell-color": cellMeta[cell.type].color } as React.CSSProperties}
              title={`${cell.number}: ${cellMeta[cell.type].label}`}
              onClick={() => setDraft(cell)}
            >
              <b>{cell.number}</b><span>{cellMeta[cell.type].icon}</span>
            </button>
          ))}
        </div>
        <p className="budget-note">Точка в углу показывает клетку, которую руководитель уже настроил вручную.</p>
      </section>

      <section className="manager-card cell-form-card">
        <div className="section-heading">
          <div><p className="eyebrow">Клетка {draft.number}</p><h2>{cellMeta[draft.type].label}</h2></div>
          <span className="cell-role-preview" style={{ background: cellMeta[draft.type].color }}>{cellMeta[draft.type].icon}</span>
        </div>
        <p className="field-label">Роль клетки</p>
        <div className="cell-role-selector" role="group" aria-label="Роль клетки">
          {roleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={draft.type === option.value}
              className={draft.type === option.value ? "active" : ""}
              style={{ "--role-color": cellMeta[option.value].color } as React.CSSProperties}
              onClick={() => changeRole(option.value)}
            >
              <span>{cellMeta[option.value].icon}</span>
              <b>{option.label}</b>
            </button>
          ))}
        </div>

        {draft.type === "trap" && (
          <div className="cell-fields">
            <label className="field-label" htmlFor="cell-title">Название задания</label>
            <input id="cell-title" value={draft.title} maxLength={100} onChange={(event) => patch({ title: event.target.value })} placeholder="Например, Добрый отзыв о студии" />
            <label className="field-label" htmlFor="cell-description">Что нужно сделать</label>
            <textarea id="cell-description" value={draft.description} maxLength={1000} onChange={(event) => patch({ description: event.target.value })} placeholder="Подробно опиши условие и подтверждение задания" />
            <label className="field-label" htmlFor="task-achievement-tag">Связь с достижением</label>
            <select
              id="task-achievement-tag"
              value={draft.taskAchievementTag || ""}
              onChange={(event) => patch({ taskAchievementTag: event.target.value ? event.target.value as ManagedBoardCell["taskAchievementTag"] : null })}
            >
              <option value="">Обычное задание</option>
              <option value="review">Отзыв клиента — «Голос клиента»</option>
              <option value="client_photo">Фото с клиентом — «Лицо прайда»</option>
            </select>
            <p className="budget-note">Категория фиксируется при назначении задания и не изменится задним числом.</p>
          </div>
        )}

        {draft.type === "treasure" && (
          <div className="cell-fields reward-cell-fields">
            <label className="field-label" htmlFor="reward-name">Название награды</label>
            <input id="reward-name" value={draft.rewardName} maxLength={160} onChange={(event) => patch({ rewardName: event.target.value })} placeholder="Например, Сертификат на Ozon" />
            <label><span className="field-label">Стоимость, ₽</span><input type="number" min="1" max="5000" value={draft.rewardValue || ""} onChange={(event) => patch({ rewardValue: Number(event.target.value) })} /></label>
            <label className="field-label" htmlFor="reward-brands">Варианты выбора через запятую</label>
            <input id="reward-brands" value={draft.rewardBrandChoices.join(", ")} onChange={(event) => patch({ rewardBrandChoices: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Ozon, Wildberries, Золотое Яблоко" />
          </div>
        )}

        {draft.type === "surprise" && (
          <div className="cell-fields">
            <label className="field-label" htmlFor="event-description">Текст события</label>
            <textarea id="event-description" value={draft.description} maxLength={1000} onChange={(event) => patch({ description: event.target.value })} placeholder="Что увидит игрок после остановки на клетке" />
          </div>
        )}

        {draft.type === "setback" && (
          <div className="cell-fields">
            <label className="field-label" htmlFor="setback-value">На сколько клеток вернуть</label>
            <select id="setback-value" value={Math.abs(draft.value || 1)} onChange={(event) => patch({ value: -Number(event.target.value) })}>
              <option value="1">На 1 клетку</option><option value="2">На 2 клетки</option>
            </select>
          </div>
        )}

        {draft.type === "accelerate" && (
          <div className="cell-fields">
            <label className="field-label" htmlFor="accelerate-effect">Эффект</label>
            <select id="accelerate-effect" value={draft.effect || "move"} onChange={(event) => patch({ effect: event.target.value as "move" | "extra_roll" })}>
              <option value="move">Продвинуть вперёд</option><option value="extra_roll">Дать дополнительный бросок</option>
            </select>
            {(draft.effect || "move") === "move" && (
              <select value={draft.value || 1} onChange={(event) => patch({ value: Number(event.target.value) })}>
                <option value="1">На 1 клетку</option><option value="2">На 2 клетки</option>
              </select>
            )}
          </div>
        )}

        {draft.type === "normal" && <div className="cell-form-empty">На этой клетке ничего не происходит.</div>}
        {message && <p className="cell-editor-message">{message}</p>}
        <div className="cell-form-actions">
          <button className="primary-button" type="button" onClick={save} disabled={pending}>
            {pending ? <LoaderCircle className="spin" /> : <Save />} Сохранить
          </button>
          {draft.custom && <button className="outline-button" type="button" onClick={reset} disabled={pending}><RotateCcw /> Вернуть базовую</button>}
        </div>
        {draft.type === "treasure" && <p className="budget-note"><Gift /> Награда выдаётся каждому игроку, который остановился на этой клетке. Предыдущие получения не исчерпывают её.</p>}
      </section>
    </div>
  );
}
