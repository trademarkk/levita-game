import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { CreateRoomForm } from "@/components/create-room-form";
import { defaultSeasonEndDate } from "@/lib/date-defaults";

export const dynamic = "force-dynamic";

export default function CreateRoomPage() {
  const defaultEndDate = defaultSeasonEndDate();
  return (
    <main className="join-page create-room-page">
      <Link href="/" className="join-brand"><BrandMark /></Link>
      <CreateRoomForm defaultEndDate={defaultEndDate} />
      <p className="join-footer">После создания вы сразу попадёте в кабинет руководителя и получите общую ссылку для команды.</p>
    </main>
  );
}
