import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { JoinForm } from "@/components/join-form";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="join-page">
      <Link href="/" className="join-brand"><BrandMark /></Link>
      <JoinForm token={token} />
      <p className="join-footer">Ссылка используется один раз для регистрации. Повторный вход — через постоянную ссылку комнаты и личный PIN.</p>
    </main>
  );
}
