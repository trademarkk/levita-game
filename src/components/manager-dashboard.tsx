"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  Copy,
  Dice5,
  Eye,
  EyeOff,
  Gift,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MapPinned,
  Plus,
  RotateCcw,
  ShieldCheck,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { AvatarPortrait } from "@/components/avatar-portrait";
import { BoardCellEditor } from "@/components/board-cell-editor";
import { LogoutButton } from "@/components/logout-button";
import { avatars } from "@/lib/avatars";
import type { ManagedBoardCell, Viewer } from "@/lib/types";

type Raw = Record<string, unknown>;
type ManagerState = {
  room: Raw;
  season: Raw;
  members: Raw[];
  tasks: Raw[];
  rewards: Raw[];
  finalPrizes: Raw[];
  credits: Raw[];
  catalog: Raw[];
  invites: Raw[];
  boardCells: ManagedBoardCell[];
};

type ManagerTab = "players" | "board" | "tasks" | "rewards" | "access";

function s(row: Raw, key: string) { return String(row[key] ?? ""); }
function n(row: Raw, key: string) { return Number(row[key] ?? 0); }
function rewardLabel(row: Raw) {
  const name = s(row, "name_snapshot");
  return /\d[\d\s\u00a0\u202f]*\s*₽/.test(name) ? name : `${name} · ${n(row, "value").toLocaleString("ru-RU")} ₽`;
}

function toMoscowEndOfDay(date: string) {
  return new Date(`${date}T20:59:59.000Z`).toISOString();
}

export function ManagerDashboard({ viewer, initialState }: { viewer: Viewer; initialState: ManagerState }) {
  const [data, setData] = useState(initialState);
  const [tab, setTab] = useState<ManagerTab>("players");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("Продажа абонемента или подписки");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<{ url: string; pin: string } | null>(null);
  const [createdPlayer, setCreatedPlayer] = useState<{ roomUrl: string; pin: string; displayName: string } | null>(null);
  const [resetPinResult, setResetPinResult] = useState<{ membershipId: string; displayName: string; pin: string } | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerBranch, setNewPlayerBranch] = useState("");
  const [newPlayerAvatar, setNewPlayerAvatar] = useState<string>(avatars[0].key);
  const [seasonDate, setSeasonDate] = useState(s(data.season, "ends_at").slice(0, 10));
  const [newSeasonName, setNewSeasonName] = useState("Новый сезон");
  const [finalPrize, setFinalPrize] = useState(
    s(data.season, "final_prize") || `${(n(data.season, "final_prize_amount") || 10000).toLocaleString("ru-RU")} ₽`,
  );
  const [maxBotToken, setMaxBotToken] = useState(s(data.room, "max_bot_token"));
  const [maxChatId, setMaxChatId] = useState(s(data.room, "max_chat_id"));
  const [telegramBotToken, setTelegramBotToken] = useState(s(data.room, "telegram_bot_token"));
  const [telegramChatId, setTelegramChatId] = useState(s(data.room, "telegram_chat_id"));
  const [showBotTokens, setShowBotTokens] = useState(false);
  const [newManagerPin, setNewManagerPin] = useState("");
  const [confirmManagerPin, setConfirmManagerPin] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/manager/state", { cache: "no-store" });
    if (response.ok) setData((await response.json()) as ManagerState);
  }, []);

  const players = useMemo(
    () => data.members.filter((member) => s(member, "role") !== "observer"),
    [data.members],
  );
  const managedPlayers = useMemo(
    () => data.members.filter((member) => s(member, "role") === "player"),
    [data.members],
  );
  const awardedValue = data.rewards
    .filter((reward) => s(reward, "season_id") === s(data.season, "id"))
    .reduce((sum, reward) => sum + n(reward, "value"), 0);
  const giftBudget = n(data.season, "gift_budget") || 10000;
  const seasonActive = s(data.season, "status") === "active";
  const roomPath = `/room/${s(data.room, "slug")}`;

  async function post(path: string, body: unknown, key: string) {
    setPending(key);
    setNotice("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setPending("");
    if (!response.ok) {
      setNotice(payload.error || "Действие не выполнено.");
      return null;
    }
    await refresh();
    return payload;
  }

  async function award() {
    const result = await post("/api/manager/credit-roll", { membershipIds: selected, reason }, "award");
    if (result) {
      const awarded = result as Array<{
        delivery?: { max?: { status?: string }; telegram?: { status?: string } };
      }>;
      const delivered = (channel: "max" | "telegram") => awarded.every((item) =>
        ["sent", "duplicate"].includes(item.delivery?.[channel]?.status || ""),
      );
      setSelected([]);
      setNotice(
        `Начислено бросков: ${awarded.length}. MAX: ${delivered("max") ? "отправлено" : "ошибка"}. Telegram: ${delivered("telegram") ? "отправлено" : "ошибка"}.`,
      );
    }
  }

  async function cancelCredit(creditId: string) {
    const cancellationReason = window.prompt("Укажите причину отмены начисления:", "Ошибочное начисление");
    if (!cancellationReason) return;
    const result = await post("/api/manager/cancel-roll", { creditId, reason: cancellationReason }, creditId);
    if (result) setNotice("Неиспользованный бросок отменён. Действие записано в летопись.");
  }

  async function approveTask(assignmentId: string) {
    const proofNote = window.prompt("Комментарий к проверке (можно оставить пустым):", "Проверено руководителем") ?? "";
    const result = await post("/api/manager/task", { assignmentId, proofNote }, assignmentId);
    if (result) setNotice("Задание принято, таймеры бросков игрока снова идут.");
  }

  async function issue(grantId: string) {
    const result = await post("/api/manager/reward", { grantId }, grantId);
    if (result) setNotice("Подарок отмечен как выданный.");
  }

  async function issueFinal(seasonId: string) {
    const result = await post(
      "/api/manager/final-prize",
      { seasonId },
      `final-prize-${seasonId}`,
    );
    if (result) setNotice("Финальный приз отмечен как выданный.");
  }

  async function createInvite(role: "manager" | "observer") {
    const result = await post("/api/manager/invite", { role }, `invite-${role}`);
    if (result) setInvite(result as { url: string; pin: string });
  }

  async function createPlayer() {
    const result = await post(
      "/api/manager/player",
      { displayName: newPlayerName, branch: newPlayerBranch || null, avatarKey: newPlayerAvatar },
      "create-player",
    );
    if (result) {
      setCreatedPlayer(result as { roomUrl: string; pin: string; displayName: string });
      setNewPlayerName("");
      setNewPlayerBranch("");
      setNotice("Игрок создан. Передайте ему общую ссылку комнаты и личный PIN.");
    }
  }

  async function resetPlayerPin(membershipId: string, displayName: string) {
    if (!window.confirm(`Создать новый PIN для игрока «${displayName}»? Старый PIN и все открытые сессии перестанут работать.`)) return;
    const result = await post("/api/manager/player-pin", { membershipId }, `player-pin-${membershipId}`);
    if (result) {
      setResetPinResult(result as { membershipId: string; displayName: string; pin: string });
      setNotice(`Для ${displayName} создан новый PIN. Передайте его игроку — старый PIN уже отключён.`);
    }
  }

  async function saveNotifications() {
    const result = await post(
      "/api/manager/notifications",
      { action: "save", maxBotToken, maxChatId, telegramBotToken, telegramChatId },
      "save-notifications",
    );
    if (result) setNotice("Настройки MAX и Telegram сохранены только для этой комнаты.");
  }

  async function saveManagerPin() {
    if (newManagerPin !== confirmManagerPin) {
      setNotice("PIN и подтверждение не совпадают.");
      return;
    }
    const result = await post("/api/manager/pin", { pin: newManagerPin }, "manager-pin");
    if (result) {
      setNewManagerPin("");
      setConfirmManagerPin("");
      setNotice("Ваш PIN обновлён. Теперь он подходит для входа по общей ссылке комнаты на любом устройстве.");
    }
  }

  async function testNotifications() {
    const result = await post("/api/manager/notifications", { action: "test" }, "test-notifications");
    if (!result) return;
    const delivery = (result as { delivery?: { max?: { status?: string }; telegram?: { status?: string } } }).delivery;
    setNotice(`Тест: MAX — ${delivery?.max?.status || "нет данных"}; Telegram — ${delivery?.telegram?.status || "нет данных"}.`);
  }

  async function saveSeasonDate() {
    const result = await post(
      "/api/manager/season",
      { action: "update-end", endsAt: toMoscowEndOfDay(seasonDate) },
      "season-date",
    );
    if (result) setNotice("Дата окончания сезона обновлена.");
  }

  async function startSeason() {
    const result = await post(
      "/api/manager/season",
      { action: "create", name: newSeasonName, endsAt: toMoscowEndOfDay(seasonDate), finalPrize },
      "new-season",
    );
    if (result) setNotice("Новый сезон открыт. Все участники начинают с клетки 0.");
  }

  async function saveFinalPrize() {
    const result = await post(
      "/api/manager/season",
      { action: "update-prize", finalPrize },
      "season-prize",
    );
    if (result) setNotice(`Финальный приз обновлён: ${finalPrize}.`);
  }

  return (
    <main className="manager-page">
      <header className="manager-header">
        <BrandMark compact />
        <div className="manager-title"><small>{s(data.room, "name")}</small><b>{s(data.season, "name")}</b></div>
        <div className="header-actions">
          <Link className="ghost-button" href="/game"><ArrowLeft size={17} /> На игровое поле</Link>
          <LogoutButton />
        </div>
      </header>
      <section className="manager-hero">
        <div><p className="eyebrow">Управление стаей</p><h1>Всё важное — в одном месте</h1></div>
        <div className="manager-kpis">
          <span><Users /><b>{players.length}</b><small>участников</small></span>
          <span><Dice5 /><b>{data.credits.length}</b><small>бросков ждут</small></span>
          <span><LockKeyhole /><b>{data.tasks.length}</b><small>заданий на проверке</small></span>
          <span><Gift /><b>{awardedValue.toLocaleString("ru-RU")} ₽</b><small>из плановых {giftBudget.toLocaleString("ru-RU")} ₽</small></span>
        </div>
      </section>
      <nav className="manager-tabs">
        <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}><Users /> Игроки и броски</button>
        <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><MapPinned /> Клетки поля</button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}><LockKeyhole /> Задания <i>{data.tasks.length}</i></button>
        <button className={tab === "rewards" ? "active" : ""} onClick={() => setTab("rewards")}><Gift /> Подарки</button>
        <button className={tab === "access" ? "active" : ""} onClick={() => setTab("access")}><Link2 /> Доступ и сезон</button>
      </nav>
      {notice && <div className="manager-notice"><ShieldCheck /> {notice}<button onClick={() => setNotice("")}><X /></button></div>}

      {tab === "players" && (
        <div className="manager-grid players-management">
          <section className="manager-card award-card">
            <div className="section-heading"><div><p className="eyebrow">После продажи</p><h2>Начислить бросок</h2></div><Dice5 /></div>
            <p>Выбери всех, кто участвовал в одной продаже. Каждый получит по одному броску на 72 часа.</p>
            <div className="member-select-list">
              {players.map((member) => {
                const id = s(member, "membership_id");
                const selfBlocked = viewer.role === "manager" && id === viewer.membershipId;
                return (
                  <label className={selected.includes(id) ? "selected" : ""} key={id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      disabled={selfBlocked}
                      onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))}
                    />
                    <AvatarPortrait className="leader-avatar" avatarKey={s(member, "avatar_key")} title={s(member, "display_name")} />
                    <span><b>{s(member, "display_name")}</b><small>{s(member, "branch") || "Без студии"} · клетка {n(member, "position")}</small></span>
                    {selfBlocked ? <em>себе нельзя</em> : <Check />}
                  </label>
                );
              })}
            </div>
            <label className="field-label" htmlFor="sale-reason">Основание</label>
            <input id="sale-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            <button className="primary-button" onClick={award} disabled={!selected.length || pending === "award"}>
              {pending === "award" ? <LoaderCircle className="spin" /> : <Plus />} Начислить выбранным ({selected.length})
            </button>
          </section>
          <section className="manager-card active-rolls-card">
            <div className="section-heading"><div><p className="eyebrow">Контроль ошибок</p><h2>Неиспользованные броски</h2></div><RotateCcw /></div>
            <div className="data-list">
              {data.credits.length ? data.credits.map((credit) => (
                <article key={s(credit, "id")}>
                  <div><b>{s(credit, "display_name")}</b><p>{s(credit, "reason")}</p><small>{credit.paused_at ? "Таймер на паузе — активно задание" : `до ${new Date(s(credit, "expires_at")).toLocaleString("ru-RU")}`}</small></div>
                  <button className="danger-icon" title="Отменить ошибочное начисление" onClick={() => cancelCredit(s(credit, "id"))}><X /></button>
                </article>
              )) : <div className="mini-empty">Нет ожидающих бросков</div>}
            </div>
          </section>
          <section className="manager-card player-access-card">
            <div className="section-heading"><div><p className="eyebrow">Управление доступом</p><h2>Все игроки комнаты</h2></div><KeyRound /></div>
            <p>Текущие PIN-коды защищены и не отображаются. Если игрок потерял PIN или вошёл не в свой профиль, создайте ему новый.</p>
            <div className="player-access-list">
              {managedPlayers.length ? managedPlayers.map((member) => {
                const membershipId = s(member, "membership_id");
                const displayName = s(member, "display_name");
                return (
                  <article key={membershipId}>
                    <AvatarPortrait className="leader-avatar" avatarKey={s(member, "avatar_key")} title={displayName} />
                    <div>
                      <b>{displayName}</b>
                      <small>{s(member, "branch") || "Без студии"} · клетка {n(member, "position")} · бросков {n(member, "available_rolls")}</small>
                    </div>
                    <button
                      className="outline-button"
                      type="button"
                      disabled={pending === `player-pin-${membershipId}`}
                      onClick={() => resetPlayerPin(membershipId, displayName)}
                    >
                      {pending === `player-pin-${membershipId}` ? <LoaderCircle className="spin" /> : <KeyRound />}
                      Сменить PIN
                    </button>
                  </article>
                );
              }) : <div className="mini-empty">В комнате пока нет игроков</div>}
            </div>
            {resetPinResult && (
              <div className="invite-result reset-pin-result">
                <span><small>Новый PIN для игрока</small><b>{resetPinResult.displayName}</b></span>
                <span><small>Личный PIN</small><b className="invite-pin">{resetPinResult.pin}</b></span>
                <p>Код показывается только сейчас. Скопируйте и передайте его игроку лично.</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`Вход в игру «${s(data.room, "name")}": ${window.location.origin}${roomPath}\nВаш новый личный PIN: ${resetPinResult.pin}`);
                    setNotice(`Новый PIN для ${resetPinResult.displayName} скопирован.`);
                  }}
                ><Copy /> Скопировать ссылку и новый PIN</button>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "board" && <BoardCellEditor cells={data.boardCells} onUpdated={refresh} />}

      {tab === "tasks" && (
        <section className="manager-card wide-card">
          <div className="section-heading"><div><p className="eyebrow">Проверка руководителем</p><h2>Активные задания</h2></div><LockKeyhole /></div>
          <div className="task-review-grid">
            {data.tasks.length ? data.tasks.map((task) => (
              <article key={s(task, "id")}>
                <span className="trap-badge">Задание</span>
                <h3>{s(task, "display_name")}</h3>
                <b>{s(task, "title_snapshot")}</b>
                <p>{s(task, "description_snapshot")}</p>
                <small>Назначено {new Date(s(task, "assigned_at")).toLocaleString("ru-RU")}</small>
                <button className="primary-button" disabled={pending === s(task, "id")} onClick={() => approveTask(s(task, "id"))}>
                  <Check /> Задание выполнено
                </button>
              </article>
            )) : <div className="empty-state"><ShieldCheck /><h2>Никто не застрял</h2><p>Все участники могут продолжать путь.</p></div>}
          </div>
        </section>
      )}

      {tab === "rewards" && (
        <div className="manager-grid reward-management">
          <section className="manager-card">
            <div className="section-heading"><div><p className="eyebrow">Личный учёт</p><h2>Подарки игрокам</h2></div><Gift /></div>
            {data.finalPrizes.map((prize) => {
              const prizeSeasonId = s(prize, "season_id");
              return (
                <article className="final-prize-admin" key={prizeSeasonId}>
                  <span>♛</span>
                  <div>
                    <small>Финальный приз · {s(prize, "season_name")}</small>
                    <b>{s(prize, "display_name")}</b>
                    <p>{s(prize, "final_prize")}</p>
                  </div>
                  {s(prize, "final_prize_status") === "pending" ? (
                    <button
                      className="outline-button"
                      onClick={() => issueFinal(prizeSeasonId)}
                      disabled={pending === `final-prize-${prizeSeasonId}`}
                    ><Check /> Выдать</button>
                  ) : <span className="issued-mark"><Check /> Выдано</span>}
                </article>
              );
            })}
            <div className="data-list rewards-admin-list">
              {data.rewards.length ? data.rewards.map((reward) => (
                <article key={s(reward, "id")}>
                  <span className="reward-gem small">✦</span>
                  <div><b>{s(reward, "display_name")}</b><p>{rewardLabel(reward)}</p><small>{s(reward, "season_id") !== s(data.season, "id") ? `${s(reward, "season_name")} · ` : ""}{reward.brand_choice ? `Выбрано: ${s(reward, "brand_choice")}` : s(reward, "status") === "issued" ? "Выдано" : "Ожидает выдачи"}</small></div>
                  {s(reward, "status") === "pending" ? (
                    <button className="outline-button" onClick={() => issue(s(reward, "id"))} disabled={pending === s(reward, "id")}><Check /> Выдать</button>
                  ) : <span className="issued-mark"><Check /> Выдано</span>}
                </article>
              )) : <div className="mini-empty">Подарки ещё не открыты</div>}
            </div>
          </section>
          <section className="manager-card">
            <div className="section-heading"><div><p className="eyebrow">Фонд сезона</p><h2>{awardedValue.toLocaleString("ru-RU")} / {giftBudget.toLocaleString("ru-RU")} ₽</h2></div></div>
            <div className="budget-bar"><span style={{ width: `${Math.min(100, (awardedValue / giftBudget) * 100)}%` }} /></div>
            <div className="catalog-list">
              {data.catalog.map((item) => (
                <div key={s(item, "id")}><span>{s(item, "name")}</span><b>{s(item, "category") === "custom_cell" ? `${n(item, "granted_count")} получено` : `${n(item, "granted_count")} / ${n(item, "quantity")}`}</b></div>
              ))}
            </div>
            <p className="budget-note">10 000 ₽ — плановый фонд. Награда закреплённой клетки выдаётся каждому остановившемуся на ней игроку, поэтому итог сезона может немного отличаться.</p>
          </section>
        </div>
      )}

      {tab === "access" && (
        <div className="manager-grid access-management">
          <section className="manager-card">
            <div className="section-heading"><div><p className="eyebrow">Один адрес для всей команды</p><h2>Ссылка комнаты</h2></div><Link2 /></div>
            <p>Все игроки входят по этой ссылке. Отличается только личный PIN, который создаётся ниже.</p>
            <div className="room-url-box">
              <b>{roomPath}</b>
              <button className="outline-button" type="button" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}${roomPath}`); setNotice("Общая ссылка комнаты скопирована."); }}><Copy /> Скопировать</button>
            </div>

            <div className="manager-login-guide">
              <div className="section-heading compact"><div><p className="eyebrow">Вход с другого устройства</p><h2>Доступ руководителя</h2></div><LockKeyhole /></div>
              <ol>
                <li>Откройте общую ссылку комнаты на другом компьютере или телефоне.</li>
                <li>Введите PIN, который вы выбрали при создании комнаты.</li>
                <li>После входа приложение сразу откроет кабинет руководителя.</li>
              </ol>
              <button
                className="outline-button"
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(`Вход руководителя в «${s(data.room, "name")}": ${window.location.origin}${roomPath}\nВведите ваш личный PIN руководителя.`);
                  setNotice("Инструкция для входа руководителя скопирована.");
                }}
              ><Copy /> Скопировать инструкцию</button>
            </div>

            <div className="card-divider" />
            <div className="section-heading compact"><div><p className="eyebrow">Если PIN нужно заменить</p><h2>Новый PIN руководителя</h2></div><ShieldCheck /></div>
            <p>Действующий PIN не отображается и не хранится в открытом виде. Пока вы вошли на этом устройстве, его можно заменить на новый.</p>
            <div className="form-grid-two manager-pin-fields">
              <label>
                <span className="field-label">Новый PIN</span>
                <input type="password" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={8} value={newManagerPin} onChange={(event) => setNewManagerPin(event.target.value.replace(/\D/g, ""))} placeholder="4–8 цифр" autoComplete="new-password" />
              </label>
              <label>
                <span className="field-label">Повторите PIN</span>
                <input type="password" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={8} value={confirmManagerPin} onChange={(event) => setConfirmManagerPin(event.target.value.replace(/\D/g, ""))} placeholder="Ещё раз" autoComplete="new-password" />
              </label>
            </div>
            <button className="outline-button" type="button" onClick={saveManagerPin} disabled={newManagerPin.length < 4 || confirmManagerPin.length < 4 || pending === "manager-pin"}>
              {pending === "manager-pin" ? <LoaderCircle className="spin" /> : <LockKeyhole />} Сменить мой PIN
            </button>

            <div className="card-divider" />
            <div className="section-heading compact"><div><p className="eyebrow">Новый участник</p><h2>Создать игрока</h2></div><UserPlus /></div>
            <label className="field-label" htmlFor="new-player-name">Полное имя с первой буквой фамилии</label>
            <input id="new-player-name" value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Например, Анна К." minLength={2} maxLength={60} />
            <label className="field-label" htmlFor="new-player-branch">Команда или студия — необязательно</label>
            <input id="new-player-branch" value={newPlayerBranch} onChange={(event) => setNewPlayerBranch(event.target.value)} placeholder="Например, Мачуги" maxLength={60} />
            <span className="field-label">Игровой персонаж</span>
            <div className="avatar-picker manager-avatar-picker">
              {avatars.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  title={avatar.name}
                  aria-label={avatar.name}
                  aria-pressed={newPlayerAvatar === avatar.key}
                  className={newPlayerAvatar === avatar.key ? "selected" : ""}
                  style={{ "--avatar-color": avatar.color } as React.CSSProperties}
                  onClick={() => setNewPlayerAvatar(avatar.key)}
                ><AvatarPortrait avatarKey={avatar.key} /></button>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={createPlayer} disabled={newPlayerName.trim().length < 2 || pending === "create-player"}>
              {pending === "create-player" ? <LoaderCircle className="spin" /> : <Plus />} Создать игрока и PIN
            </button>
            {createdPlayer && (
              <div className="invite-result">
                <span><small>Игрок</small><b>{createdPlayer.displayName}</b></span>
                <span><small>Общая ссылка</small><b>{createdPlayer.roomUrl}</b></span>
                <span><small>Личный PIN</small><b className="invite-pin">{createdPlayer.pin}</b></span>
                <button
                  className="primary-button"
                  type="button"
                  onClick={async () => { await navigator.clipboard.writeText(`Вход в игру «${s(data.room, "name") }»: ${createdPlayer.roomUrl}\nВаш личный PIN: ${createdPlayer.pin}`); setNotice("Ссылка комнаты и PIN игрока скопированы."); }}
                ><Copy /> Скопировать для игрока</button>
              </div>
            )}
          </section>
          <section className="manager-card">
            <div className="section-heading"><div><p className="eyebrow">Срок гонки</p><h2>{seasonActive ? "Дата окончания" : "Открыть новый сезон"}</h2></div><CalendarDays /></div>
            <label className="field-label" htmlFor="season-date">Последний день сезона</label>
            <input id="season-date" type="date" value={seasonDate} onChange={(event) => setSeasonDate(event.target.value)} />
            <label className="field-label" htmlFor="season-prize">Приз за прохождение карты</label>
            <input
              id="season-prize"
              type="text"
              maxLength={200}
              value={finalPrize}
              onChange={(event) => setFinalPrize(event.target.value)}
              placeholder="Например, путешествие, сертификат или денежный приз"
            />
            {seasonActive ? (
              <div className="stacked-actions">
                <button className="primary-button" onClick={saveSeasonDate} disabled={!seasonDate || pending === "season-date"}>Сохранить дату</button>
                <button className="outline-button" onClick={saveFinalPrize} disabled={!finalPrize.trim() || pending === "season-prize"}>Сохранить финальный приз</button>
              </div>
            ) : (
              <>
                <label className="field-label" htmlFor="season-name">Название</label>
                <input id="season-name" value={newSeasonName} onChange={(event) => setNewSeasonName(event.target.value)} />
                <button className="primary-button" onClick={startSeason} disabled={!seasonDate || !newSeasonName || !finalPrize.trim() || pending === "new-season"}>Начать новый сезон</button>
              </>
            )}
            <p className="budget-note">Если к этой дате никто не достигнет клетки 60, сезон завершится без победителя, а финальный приз «{finalPrize}» не выдаётся.</p>
          </section>
          <section className="manager-card notification-settings-card">
            <div className="section-heading"><div><p className="eyebrow">Связь с прайдом</p><h2>MAX и Telegram</h2></div><Bell /></div>
            <p>Эти реквизиты используются только уведомлениями комнаты «{s(data.room, "name")}». Пустой канал просто пропускается.</p>
            <div className="notification-fields">
              <label><span className="field-label">Токен бота MAX</span><input type={showBotTokens ? "text" : "password"} value={maxBotToken} onChange={(event) => setMaxBotToken(event.target.value)} placeholder="Не настроен" autoComplete="off" /></label>
              <label><span className="field-label">Chat ID MAX</span><input value={maxChatId} onChange={(event) => setMaxChatId(event.target.value)} placeholder="Не настроен" autoComplete="off" /></label>
              <label><span className="field-label">Токен бота Telegram</span><input type={showBotTokens ? "text" : "password"} value={telegramBotToken} onChange={(event) => setTelegramBotToken(event.target.value)} placeholder="Не настроен" autoComplete="off" /></label>
              <label><span className="field-label">Chat ID Telegram</span><input value={telegramChatId} onChange={(event) => setTelegramChatId(event.target.value)} placeholder="Не настроен" autoComplete="off" /></label>
            </div>
            <button className="token-visibility-button" type="button" onClick={() => setShowBotTokens((current) => !current)}>
              {showBotTokens ? <EyeOff /> : <Eye />} {showBotTokens ? "Скрыть токены" : "Показать токены"}
            </button>
            <div className="stacked-actions horizontal-actions">
              <button className="primary-button" type="button" onClick={saveNotifications} disabled={pending === "save-notifications"}>{pending === "save-notifications" ? <LoaderCircle className="spin" /> : <Check />} Сохранить</button>
              <button className="outline-button" type="button" onClick={testNotifications} disabled={pending === "test-notifications"}><Send /> Отправить тест</button>
            </div>
          </section>
          <section className="manager-card staff-invites-card">
            <div className="section-heading"><div><p className="eyebrow">Дополнительный доступ</p><h2>Руководитель или наблюдатель</h2></div><ShieldCheck /></div>
            <p>Для обычных игроков используйте создание игрока и общую ссылку. Разовая регистрационная ссылка нужна только дополнительному руководителю или наблюдателю.</p>
            <div className="invite-buttons">
              {viewer.role === "owner" && <button className="outline-button" type="button" onClick={() => createInvite("manager")}><Plus /> Руководитель</button>}
              <button className="outline-button" type="button" onClick={() => createInvite("observer")}><Plus /> Наблюдатель</button>
            </div>
            {invite && (
              <div className="invite-result">
                <span><small>Регистрационная ссылка</small><b>{invite.url}</b></span>
                <span><small>PIN</small><b className="invite-pin">{invite.pin}</b></span>
                <button className="primary-button" type="button" onClick={async () => { await navigator.clipboard.writeText(`Регистрация: ${invite.url}\nPIN: ${invite.pin}\nПосле регистрации вход: ${window.location.origin}${roomPath}`); setNotice("Данные приглашения скопированы."); }}><Copy /> Скопировать всё</button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
