import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRouterDetail } from "@/lib/reports";
import { Badge, Card, EmptyRow, LinkBtn, Td, Th, tableCls } from "@/components/ui";
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{String(r.serial_number)}</h1>
            <Badge status={String(r.status)} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {r.model ? `Model ${String(r.model)} · ` : ""}received {fmtDate(String(r.date_received))}
            {r.team_name ? ` · held by ${String(r.team_name)}` : ""}
            {r.customer_id ? ` · customer ${String(r.customer_id)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkBtn href="/routers">← Back to inventory</LinkBtn>
          <AdjustRouterButton
            routerId={routerId}
            serial={String(r.serial_number)}
            currentStatus={String(r.status)}
            currentModel={(r.model as string) ?? null}
          />
        </div>
      </div>

      <Card title="Movement history">
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Movement</Th>
                <Th>Team</Th>
                <Th>Customer</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {detail.movements.length === 0 && <EmptyRow cols={5} message="No movements yet." />}
              {(detail.movements as Record<string, unknown>[]).map((m) => (
                <tr key={String(m.id)} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap">{fmtDate(String(m.date))}</Td>
                  <Td className="font-medium text-gray-800">{String(m.type).replace(/_/g, " ")}</Td>
                  <Td>{(m.team_name as string) ?? "—"}</Td>
                  <Td>{(m.customer_id as string) ?? "—"}</Td>
                  <Td className="max-w-md text-gray-600">{(m.notes as string) ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
