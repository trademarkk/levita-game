import Link from "next/link";
import { ArrowRight, Gift, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { AvatarPortrait } from "@/components/avatar-portrait";
import { getViewer } from "@/lib/session";

export default async function Home() {
  const viewer = await getViewer();
  return (
    <main className="landing-page">
      <div className="landing-sun" aria-hidden="true" />
      <nav className="landing-nav">
        <BrandMark />
        {viewer && (
          <Link className="ghost-button" href="/game">
            Вернуться в игру <ArrowRight size={17} />
          </Link>
        )}
      </nav>
      <section className="landing-grid">
        <div className="landing-copy">
          <p className="eyebrow">Командная игра LEVITA</p>
          <h1>Золотая Саванна:<br /><span>Путь к Вершине</span></h1>
          <p className="landing-lead">
            Каждая продажа открывает новый бросок. Пройди 60 клеток, собирай сокровища,
            выполняй задания и доберись до Вершины раньше остальных.
          </p>
          <div className="feature-row">
            <span><Sparkles /> 60 клеток</span>
            <span><Gift /> 10 000 ₽ денежных наград</span>
            <span><ShieldCheck /> Честная гонка</span>
          </div>
        </div>
        {viewer ? (
          <div className="return-card glass-panel">
            <AvatarPortrait className="return-avatar" avatarKey={viewer.avatarKey} title={viewer.displayName} />
            <p className="eyebrow">Ты уже в стае</p>
            <h2>{viewer.displayName}</h2>
            <Link className="primary-button" href="/game">Открыть игровую доску <ArrowRight size={18} /></Link>
            <Link className="outline-button" href="/create-room"><Plus size={18} /> Создать ещё одну комнату</Link>
          </div>
        ) : (
          <div className="login-card glass-panel public-entry-card">
            <div className="login-icon"><Sparkles size={26} /></div>
            <p className="eyebrow">Начать новый сезон</p>
            <h2>Создайте свой прайд</h2>
            <p className="muted">Руководитель создаёт комнату, получает одну общую ссылку и выдаёт каждому игроку личный PIN.</p>
            <Link className="primary-button" href="/create-room"><Plus size={18} /> Создать комнату</Link>
            <p className="room-link-hint">Уже участвуете? Откройте ссылку комнаты, которую прислал руководитель.</p>
          </div>
        )}
      </section>
      <p className="landing-note">У каждой команды своя постоянная ссылка. Все данные, карта и уведомления хранятся отдельно от других комнат.</p>
    </main>
  );
}
