import { GameShell } from "@/components/game-shell";
import { getGameState } from "@/lib/game";
import { requirePageViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const viewer = await requirePageViewer();
  return <GameShell initialState={await getGameState(viewer)} />;
}
