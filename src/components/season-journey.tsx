"use client";

import { Award, Check, Clock3, Dice5, Footprints, LockKeyhole, ShoppingBag, Sparkles } from "lucide-react";
import { achievementKindLabel, chapterDefinitions } from "@/lib/achievement-catalog";
import { AvatarPortrait } from "@/components/avatar-portrait";
import { AchievementEmblem } from "@/components/achievement-emblem";
import type { GameState } from "@/lib/types";

function rollDeadline(expiresAt: string | null, paused: boolean, now: number) {
  if (paused || !expiresAt) return "Таймер на паузе до выполнения задания";
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return "Срок истекает";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours} ч ${minutes} мин`;
}

function unlockedDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(new Date(value));
}

export function SeasonJourney({ state, now }: { state: GameState; now: number }) {
  const me = state.players.find((player) => player.membershipId === state.viewer.membershipId);
  const nearest = state.myJourney.nearestAchievementKeys
    .map((key) => state.myJourney.achievements.find((achievement) => achievement.key === key))
    .filter((achievement) => achievement != null);
  const currentChapter = chapterDefinitions.find((chapter) => (me?.position || 0) >= chapter.from && (me?.position || 0) <= chapter.to)
    || chapterDefinitions[0];
  const unlockedCount = state.myJourney.achievements.filter((achievement) => achievement.unlocked).length;

  return (
    <section className="content-page journey-page">
      <div className="journey-hero">
        <div className="journey-identity">
          <div className={`journey-avatar cosmetic-tier-${me?.cosmeticTier || 0}`}>
            <AvatarPortrait avatarKey={state.viewer.avatarKey} />
            {(me?.cosmeticTier || 0) >= 3 && <span className="journey-crown">♛</span>}
          </div>
          <div>
            <p className="eyebrow">Личный кабинет</p>
            <h1>Мой путь сезона</h1>
            <p>{state.viewer.displayName} · {currentChapter.title}</p>
          </div>
        </div>
        <div className="journey-stats">
          <article><Footprints /><span><small>Позиция на карте</small><b>{me?.position || 0} <i>/ 60</i></b></span></article>
          <article><ShoppingBag /><span><small>Продажи за сезон</small><b>{state.myJourney.totalSales}</b></span></article>
          <article><Dice5 /><span><small>Доступно бросков</small><b>{me?.availableRolls || 0}</b></span></article>
          <article><Award /><span><small>Открыто титулов</small><b>{unlockedCount} <i>/ {state.myJourney.achievements.length}</i></b></span></article>
        </div>
      </div>

      <div className="journey-grid">
        <section className="journey-panel nearest-panel">
          <div className="section-heading"><div><p className="eyebrow">Уже близко</p><h2>Ближайшие достижения</h2></div><Sparkles /></div>
          <div className="nearest-list">
            {nearest.length ? nearest.map((achievement) => {
              const percent = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
              return (
                <article key={achievement.key}>
                  <AchievementEmblem achievement={achievement} compact locked={!achievement.unlocked} />
                  <div>
                    <b>{achievement.title}</b>
                    <p>{achievement.description}</p>
                    <div className="achievement-progress"><i style={{ width: `${percent}%` }} /></div>
                    <small>{achievement.progress} из {achievement.target}</small>
                  </div>
                </article>
              );
            }) : <div className="all-achieved"><Award /><b>Все личные достижения открыты</b><p>Витрина сезона полностью сияет.</p></div>}
          </div>
        </section>

        <section className="journey-panel rolls-panel">
          <div className="section-heading"><div><p className="eyebrow">72 часа</p><h2>Мои броски</h2></div><Clock3 /></div>
          <div className="journey-roll-list">
            {state.myJourney.activeRolls.length ? state.myJourney.activeRolls.map((roll, index) => (
              <article className={roll.paused ? "paused" : ""} key={roll.id}>
                <span><Dice5 /></span>
                <div><b>Бросок №{index + 1}</b><small>{rollDeadline(roll.expiresAt, roll.paused, now)}</small></div>
                {roll.paused ? <LockKeyhole /> : <Clock3 />}
              </article>
            )) : <div className="journey-empty"><Dice5 /><p>Новых бросков пока нет. Следующий появится после зачтённой продажи.</p></div>}
          </div>
        </section>
      </div>

      <section className="title-showcase">
        <div className="showcase-heading">
          <div><p className="eyebrow">Личная коллекция</p><h2>Витрина титулов</h2><p>Неоткрытые титулы видны заранее, но обретают цвет только после достижения.</p></div>
          <span><b>{unlockedCount}</b><small>открыто</small></span>
        </div>
        <div className="title-grid">
          {state.myJourney.achievements.map((achievement) => (
            <article
              className={`title-card ${achievement.unlocked ? "unlocked" : "locked"} kind-${achievement.kind}`}
              style={{ "--achievement-color": achievement.color } as React.CSSProperties}
              key={achievement.key}
            >
              <div className="title-emblem-wrap">
                <AchievementEmblem achievement={achievement} locked={!achievement.unlocked} />
                {achievement.unlocked && <i className="title-unlocked-mark"><Check /></i>}
              </div>
              <small>{achievementKindLabel(achievement.kind)}</small>
              <h3>{achievement.title}</h3>
              <p>{achievement.description}</p>
              <div className="title-card-footer">
                {achievement.unlocked
                  ? <span><Check /> Открыт {unlockedDate(achievement.unlockedAt)}</span>
                  : <span><LockKeyhole /> {achievement.progress} / {achievement.target}</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
