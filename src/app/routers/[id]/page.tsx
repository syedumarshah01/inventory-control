import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRouterDetail } from "@/lib/reports";
import { Badge, Card, EmptyRow, Td, Th, tableCls } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { AdjustRouterButton } from "../router-actions";

export const dynamic = "force-dynamic";

export default async function RouterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const routerId = Number(id);
  if (!Number.isFinite(routerId)) notFound();
  const detail = getRouterDetail(getDb(), routerId);
  if (!detail) notFound();
  const r = detail.router as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {String(r.serial_number)} <Badge status={String(r.status)} />
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {r.model ? `${String(r.model)} · ` : ""}received {fmtDate(String(r.date_received))}
            {r.team_name ? ` · with ${String(r.team_name)}` : ""}
            {r.customer_id ? ` · customer ${String(r.customer_id)}` : ""}
          </p>
        </div>
        <AdjustRouterButton
          routerId={routerId}
          serial={String(r.serial_number)}
          currentStatus={String(r.status)}
          currentModel={(r.model as string) ?? null}
        />
      </div>

      <Card title="History">
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>What</Th>
              <Th>Team</Th>
              <Th>Customer</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {detail.movements.length === 0 && <EmptyRow cols={5} message="No movements." />}
            {(detail.movements as Record<string, unknown>[]).map((m) => (
              <tr key={String(m.id)}>
                <Td className="whitespace-nowrap text-gray-500">{fmtDate(String(m.date))}</Td>
                <Td>{String(m.type).replace(/_/g, " ").toLowerCase()}</Td>
                <Td className="text-gray-500">{(m.team_name as string) ?? "—"}</Td>
                <Td className="text-gray-500">{(m.customer_id as string) ?? "—"}</Td>
                <Td className="text-gray-500">{(m.notes as string) ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-sm">
        <Link href="/routers" className="text-gray-500 hover:underline">
          ← Routers
        </Link>
      </p>
    </div>
  );
}
