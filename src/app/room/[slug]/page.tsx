import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { RoomLogin } from "@/components/room-login";
import { getPublicRoomBySlug } from "@/lib/rooms";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = await getPublicRoomBySlug(slug);
  if (!room) {
    return (
      <main className="join-page">
        <Link href="/" className="join-brand"><BrandMark /></Link>
        <section className="join-card glass-panel room-missing-card">
          <p className="eyebrow">Ссылка не найдена</p>
          <h1>Такой комнаты нет</h1>
          <p className="muted">Проверьте ссылку у руководителя или вернитесь на главную страницу.</p>
          <Link className="primary-button" href="/">На главную</Link>
        </section>
      </main>
    );
  }
  const viewer = await getViewer();
  if (viewer?.roomId === room.id) {
    redirect(viewer.role === "owner" || viewer.role === "manager" ? "/manager" : "/game");
  }
  return (
    <main className="join-page room-login-page">
      <Link href="/" className="join-brand"><BrandMark /></Link>
      <RoomLogin slug={room.slug} roomName={room.name} />
      <p className="join-footer">В комнате {room.playerCount} из {room.maxPlayers} участников.</p>
    </main>
  );
}
