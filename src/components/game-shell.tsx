"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Crown, Dice5, ExternalLink, Gift, LockKeyhole, Map, ScrollText, Settings, Sparkles, Timer, X } from "lucide-react";
import { AchievementCelebration } from "@/components/achievement-celebration";
import { AvatarPortrait } from "@/components/avatar-portrait";
import { BrandMark } from "@/components/brand-mark";
import { DiceOverlay } from "@/components/dice-overlay";
import { GameBoard } from "@/components/game-board";
import { LogoutButton } from "@/components/logout-button";
import { SeasonJourney } from "@/components/season-journey";
import { WebglEventCinematic } from "@/components/webgl-event-cinematic";
import { cellMeta } from "@/lib/board";
import type { RollOutcome } from "@/lib/game";
import { getReviewLinks } from "@/lib/review-links";
import type { GameState } from "@/lib/types";

type Tab = "map" | "journey" | "rewards" | "rules";
type TurnSequence = { outcome: RollOutcome; phase: "cinematic" | "achievement" | "result"; achievementIndex: number };

const chronicleReactions = [
  { key: "applause" as const, emoji: "👏", label: "Поддержать" },
  { key: "roar" as const, emoji: "🦁", label: "Сила прайда" },
  { key: "fire" as const, emoji: "🔥", label: "Сильный ход" },
  { key: "crown" as const, emoji: "👑", label: "Королевский результат" },
];

function timeLeft(expiresAt: string | null, now: number, availableRolls: number) {
  if (!availableRolls) return "бросков нет";
  if (!expiresAt) return "таймер на паузе";
  if (!now) return "считаем время…";
  const milliseconds = new Date(expiresAt).getTime() - now;
  if (milliseconds <= 0) return "срок истёк";
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${hours} ч ${minutes} мин`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function rewardNameHasAmount(name: string) {
  return /\d[\d\s\u00a0\u202f]*\s*₽/.test(name);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function GameShell({ initialState }: { initialState: GameState }) {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<Tab>("map");
  const [diceOpen, setDiceOpen] = useState(false);
  const [animatedPosition, setAnimatedPosition] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [turnSequence, setTurnSequence] = useState<TurnSequence | null>(null);
  const [now, setNow] = useState(() => new Date(initialState.generatedAt).getTime());
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/game/state", { cache: "no-store" });
      if (response.ok) setState((await response.json()) as GameState);
    } catch {
      // Keep the last playable state during a brief reconnect or local server restart.
    }
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (!diceOpen && !animating && !turnSequence) void refresh();
    }, 12_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [animating, diceOpen, refresh, turnSequence]);

  const me = state.players.find((player) => player.membershipId === state.viewer.membershipId);
  const ranking = useMemo(
    () => [...state.players].sort((a, b) => b.position - a.position || a.displayName.localeCompare(b.displayName)),
    [state.players],
  );
  const canRoll = state.season.status === "active" && Boolean(me?.availableRolls) && !me?.blocked && !diceOpen && !animating && !turnSequence;
  const reviewLinks = getReviewLinks(state.viewer.branch);
  const visiblePosition = animatedPosition ?? me?.position ?? 0;
  const upcomingCells = state.boardCells.slice(Math.max(0, visiblePosition), Math.max(0, visiblePosition) + 7);

  const animateOutcome = useCallback(async (outcome: RollOutcome) => {
    setDiceOpen(false);
    setAnimating(true);
    setAnimatedPosition(outcome.startPosition);

    async function walk(from: number, to: number) {
      if (from === to) return;
      const direction = to > from ? 1 : -1;
      for (let position = from + direction; direction > 0 ? position <= to : position >= to; position += direction) {
        setAnimatedPosition(position);
        await wait(470);
      }
    }

    await wait(160);
    await walk(outcome.startPosition, outcome.basePosition);
    if (outcome.finalPosition !== outcome.basePosition) {
      await wait(260);
      await walk(outcome.basePosition, outcome.finalPosition);
    }
    await wait(220);
    await refresh();
    setAnimatedPosition(null);
    setAnimating(false);
    setTurnSequence({
      outcome,
      phase: outcome.cellType === "normal" ? (outcome.unlockedAchievements.length ? "achievement" : "result") : "cinematic",
      achievementIndex: 0,
    });
  }, [refresh]);

  const handleDiceOutcome = useCallback((outcome: RollOutcome) => {
    void animateOutcome(outcome);
  }, [animateOutcome]);

  const startRoll = useCallback(() => {
    setTurnSequence(null);
    setDiceOpen(true);
  }, []);

  const finishCinematic = useCallback(() => {
    setTurnSequence((current) => current
      ? { ...current, phase: current.outcome.unlockedAchievements.length ? "achievement" : "result" }
      : null);
  }, []);

  const continueAchievement = useCallback(() => {
    setTurnSequence((current) => {
      if (!current) return null;
      const nextIndex = current.achievementIndex + 1;
      return nextIndex < current.outcome.unlockedAchievements.length
        ? { ...current, achievementIndex: nextIndex }
        : { ...current, phase: "result" };
    });
  }, []);

  const openJourneyFromAchievement = useCallback(() => {
    setTurnSequence(null);
    setTab("journey");
  }, []);

  async function reactToEvent(eventId: string, reaction: GameState["events"][number]["reactions"][number]["key"]) {
    setState((current) => ({
      ...current,
      events: current.events.map((event) => {
        if (event.id !== eventId) return event;
        const previous = event.reactions.find((item) => item.mine);
        let reactions = event.reactions
          .map((item) => item.mine ? { ...item, mine: false, count: Math.max(0, item.count - 1) } : item)
          .filter((item) => item.count > 0);
        if (previous?.key !== reaction) {
          const target = reactions.find((item) => item.key === reaction);
          reactions = target
            ? reactions.map((item) => item.key === reaction ? { ...item, mine: true, count: item.count + 1 } : item)
            : [...reactions, { key: reaction, mine: true, count: 1 }];
        }
        return { ...event, reactions };
      }),
    }));
    try {
      const response = await fetch("/api/game/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, reaction }),
      });
      if (!response.ok) await refresh();
    } catch {
      await refresh();
    }
  }

  async function chooseBrand(grantId: string, brand: string) {
    const response = await fetch("/api/game/reward-choice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId, brand }),
    });
    const body = await response.json();
    setNotice(response.ok ? "Выбор сохранён. Руководитель увидит магазин в своём кабинете." : body.error);
    await refresh();
  }

  return (
    <main className="game-page">
      <header className="game-header">
        <BrandMark compact />
        <div className="season-chip">
          <span className={`status-dot status-${state.season.status}`} />
          <span><small>{state.season.name}</small><b>до {formatDate(state.season.endsAt)}</b></span>
        </div>
        <nav className="game-tabs" aria-label="Разделы игры">
          <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}><Map /> Карта</button>
          <button className={tab === "journey" ? "active" : ""} onClick={() => setTab("journey")}><Award /> Мой путь</button>
          <button className={tab === "rewards" ? "active" : ""} onClick={() => setTab("rewards")}><Gift /> Мои сокровища</button>
          <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}><ScrollText /> Правила</button>
        </nav>
        <div className="header-actions">
          {(state.viewer.role === "owner" || state.viewer.role === "manager") && (
            <Link className="icon-button" title="Кабинет руководителя" href="/manager"><Settings size={18} /></Link>
          )}
          <LogoutButton />
        </div>
      </header>

      {tab === "map" && (
        <div className="game-layout">
          <section className="map-column">
            {state.season.status !== "active" && (
              <div className="season-banner">
                <Crown />
                <span>
                  <b>{state.season.status === "completed" ? "Сезон завершён" : "Время сезона истекло"}</b>
                  {state.season.winnerMembershipId
                    ? ` Победа — ${state.players.find((p) => p.membershipId === state.season.winnerMembershipId)?.displayName || "финиш сезона"}.`
                    : " Финальный приз не разыгран."}
                </span>
              </div>
            )}
            <div className="map-stage">
              <GameBoard
                players={state.players}
                viewerId={state.viewer.membershipId}
                cells={state.boardCells}
                animatedViewerPosition={animatedPosition}
              />
              {diceOpen && (
                <DiceOverlay
                  onCancel={() => setDiceOpen(false)}
                  onOutcome={handleDiceOutcome}
                />
              )}
              {turnSequence?.phase === "cinematic" && (
                <WebglEventCinematic outcome={turnSequence.outcome} onContinue={finishCinematic} />
              )}
              {turnSequence?.phase === "achievement" && turnSequence.outcome.unlockedAchievements[turnSequence.achievementIndex] && (
                <AchievementCelebration
                  achievement={turnSequence.outcome.unlockedAchievements[turnSequence.achievementIndex]}
                  current={turnSequence.achievementIndex}
                  total={turnSequence.outcome.unlockedAchievements.length}
                  onContinue={continueAchievement}
                  onOpenJourney={openJourneyFromAchievement}
                />
              )}
              {turnSequence?.phase === "result" && (
                <div className="turn-result-overlay" role="presentation">
                  <article className="turn-result-popup roll-result-card" role="dialog" aria-modal="true" aria-label="Итог хода" aria-live="polite">
                    <button className="result-close" onClick={() => setTurnSequence(null)} aria-label="Скрыть результат"><X /></button>
                    <span className="result-spark"><Sparkles /></span>
                    <div>
                      <p className="eyebrow">Итог хода</p>
                      <h3>Выпало {turnSequence.outcome.diceValue} · клетка {turnSequence.outcome.basePosition}</h3>
                      <strong>{turnSequence.outcome.effectText}</strong>
                      {turnSequence.outcome.finalPosition !== turnSequence.outcome.basePosition && <small>Итоговая позиция: {turnSequence.outcome.finalPosition}</small>}
                    </div>
                  </article>
                </div>
              )}
            </div>
          </section>
          <aside className="game-sidebar">
            <section className="sidebar-card player-action-card">
              <div className="sidebar-position">
                <AvatarPortrait avatarKey={state.viewer.avatarKey} className="mini-avatar" />
                <span><small>Твоя позиция</small><b>{visiblePosition} <i>/ 60</i></b></span>
              </div>
              <div className="sidebar-roll">
                <span className="roll-count">{me?.availableRolls || 0}</span>
                <span><b>доступно бросков</b><small><Timer /> {timeLeft(me?.nextRollExpiresAt || null, now, me?.availableRolls || 0)}</small></span>
              </div>
              <button className="roll-button" disabled={!canRoll} onClick={startRoll}>
                {me?.blocked ? <LockKeyhole /> : <Dice5 />}
                <span>{diceOpen ? "Кубик вращается" : animating ? "Фишка движется" : me?.blocked ? "Сначала задание" : state.season.status !== "active" ? "Сезон завершён" : "Бросить кубик"}</span>
              </button>
            </section>
            {state.myPendingTask && (
              <article className="sidebar-card sidebar-task-card">
                <div className="task-icon"><LockKeyhole /></div>
                <div>
                  <p className="eyebrow">Активное задание</p>
                  <h3>{state.myPendingTask.title}</h3>
                  <p>{state.myPendingTask.description}</p>
                  {state.myPendingTask.title === "Добрый отзыв о студии" && reviewLinks.length > 0 && (
                    <div className="review-links">
                      {reviewLinks.map((link) => (
                        <a href={link.url} target="_blank" rel="noreferrer" key={link.label}>
                          {link.label} <ExternalLink />
                        </a>
                      ))}
                    </div>
                  )}
                  <small>После проверки руководителем бросок снова станет доступен.</small>
                </div>
              </article>
            )}
            <section className="sidebar-card road-preview-card">
              <div className="card-heading"><div><p className="eyebrow">Впереди</p><h2>Ближайшая тропа</h2></div><Map /></div>
              {upcomingCells.length ? (
                <div className="road-preview-list">
                  {upcomingCells.map((cell) => {
                    const meta = cellMeta[cell.type];
                    return (
                      <div className={`road-preview-cell type-${cell.type}`} key={cell.number} title={`Клетка ${cell.number}: ${meta.label}`}>
                        <span style={{ background: meta.color }}><b>{cell.number}</b><i>{cell.type === "normal" ? "•" : meta.icon}</i></span>
                        <small>{meta.label}</small>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="road-finish-note">Впереди только Вершина.</p>}
              <small className="road-preview-hint">Виден тип клетки, но содержание события остаётся тайной.</small>
            </section>
            <section className="sidebar-card leaderboard-card">
              <div className="card-heading"><div><p className="eyebrow">Путь к вершине</p><h2>Стая</h2></div><Crown /></div>
              <div className="leaderboard-list">
                {ranking.map((player, index) => {
                  return (
                    <div className={`leader-row ${player.membershipId === state.viewer.membershipId ? "is-me" : ""}`} key={player.membershipId}>
                      <b className="rank">{index + 1}</b>
                      <AvatarPortrait avatarKey={player.avatarKey} className="leader-avatar" />
                      <span className="leader-name"><b>{player.displayName}</b><small>{player.blocked ? "выполняет задание" : `${player.availableRolls} брос.`}</small></span>
                      <strong>{player.position}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="sidebar-card activity-card">
              <div className="card-heading"><div><p className="eyebrow">Живая лента</p><h2>Летопись</h2></div></div>
              <div className="activity-list">
                {state.events.slice(0, 12).map((event) => (
                  <article key={event.id}>
                    <span className={`event-mark event-${event.type}`} />
                    <div>
                      <b>{event.title}</b><p>{event.body}</p><small>{new Date(event.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</small>
                      <div className="event-reactions" aria-label="Реакции">
                        {chronicleReactions.map((reaction) => {
                          const current = event.reactions.find((item) => item.key === reaction.key);
                          return (
                            <button
                              className={current?.mine ? "active" : ""}
                              onClick={() => void reactToEvent(event.id, reaction.key)}
                              title={reaction.label}
                              aria-label={reaction.label}
                              key={reaction.key}
                            >
                              <span>{reaction.emoji}</span>{current?.count ? <b>{current.count}</b> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === "journey" && <SeasonJourney state={state} now={now} />}

      {tab === "rewards" && (
        <section className="content-page rewards-page">
          <div className="page-heading"><p className="eyebrow">Личный кабинет</p><h1>Мои сокровища</h1><p>Все найденные награды появляются здесь автоматически.</p></div>
          {notice && <div className="notice-banner">{notice}</div>}
          <div className="reward-grid">
            {state.myRewards.length ? state.myRewards.map((reward) => (
              <article className="reward-card" key={reward.id}>
                <span className="reward-gem">✦</span>
                <small>{reward.status === "issued" ? "Выдано" : "Ожидает выдачи"}</small>
                <h2>{reward.name}</h2>
                {reward.value > 0 && !rewardNameHasAmount(reward.name) && <strong className="reward-value">{reward.value.toLocaleString("ru-RU")} ₽</strong>}
                {reward.brandChoices.length > 0 && reward.status === "pending" && (
                  <label>
                    Выбери магазин
                    <select value={reward.brandChoice || ""} onChange={(event) => chooseBrand(reward.id, event.target.value)}>
                      <option value="" disabled>Выбрать…</option>
                      {reward.brandChoices.map((brand) => <option key={brand}>{brand}</option>)}
                    </select>
                  </label>
                )}
                {reward.brandChoice && <p>Выбран магазин: <b>{reward.brandChoice}</b></p>}
                <div className={`reward-status status-${reward.status}`}>{reward.status === "issued" ? "Выдано" : "Ожидает выдачи"}</div>
              </article>
            )) : <div className="empty-state"><Gift /><h2>Сокровища ещё впереди</h2><p>Попади на золотую клетку, чтобы открыть случайный подарок.</p></div>}
          </div>
        </section>
      )}

      {tab === "rules" && (
        <section className="content-page rules-page">
          <div className="page-heading"><p className="eyebrow">Как играть</p><h1>Правила игры «Золотая Саванна: Путь к Вершине»</h1></div>
          <div className="rules-grid">
            <article><b>01</b><h2>Заработай бросок</h2><p>Продажа абонемента свыше 5 000 ₽ или подписки даёт каждому участнику продажи по одному броску.</p></article>
            <article><b>02</b><h2>Успей за 72 часа</h2><p>Неиспользованный бросок сгорает через 72 часа. При активном задании таймер останавливается, а новые броски продолжают копиться.</p></article>
            <article><b>03</b><h2>Остановись на событии</h2><p>Срабатывает только клетка, на которой закончился ход. Переход через особую клетку ничего не запускает.</p></article>
            <article><b>04</b><h2>Доберись до 60</h2><p>Точное число не требуется. Сезон завершает игрок, который раньше остальных достигнет клетки 60. Финальный приз — {state.season.finalPrize}.</p></article>
          </div>
          <div className="legend-panel">
            {Object.entries(cellMeta).map(([key, meta]) => (
              <div key={key}><span style={{ background: meta.color }}>{meta.icon}</span><p><b>{meta.label}</b><small>{meta.description}</small></p></div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
