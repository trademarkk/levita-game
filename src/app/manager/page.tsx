import { ManagerDashboard } from "@/components/manager-dashboard";
import { getManagerState } from "@/lib/manager";
import { requirePageViewer } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const viewer = await requirePageViewer();
  if (viewer.role !== "owner" && viewer.role !== "manager") redirect("/game");
  return <ManagerDashboard viewer={viewer} initialState={await getManagerState(viewer)} />;
}
