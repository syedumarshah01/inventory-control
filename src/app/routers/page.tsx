import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listRouters, routerStatusCounts } from "@/lib/reports";
import { Badge, Card, EmptyRow, Input, Select, Td, Th, tableCls } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { ReceiveRoutersForm } from "./receive-routers-form";
import { AdjustRouterButton } from "./router-actions";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "IN_STOCK", label: "In stock" },
  { key: "ISSUED", label: "With teams" },
  { key: "INSTALLED", label: "Installed" },
  { key: "FAULTY", label: "Faulty" },
  { key: "RETURNED_TO_SUPPLIER", label: "At supplier" },
];

export default async function RoutersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "ALL";
  const q = sp.q?.trim() ?? "";
  const db = getDb();
  const counts = routerStatusCounts(db);
  const rows = listRouters(db, { status, q });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Routers</h1>

      <Card title="Add routers">
        <ReceiveRoutersForm />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/routers?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded px-2.5 py-1.5 text-sm ${
              f.key === status ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-60">{counts[f.key] ?? 0}</span>
          </Link>
        ))}
        <form action="/routers" method="GET" className="ml-auto flex gap-1.5">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q} placeholder="Serial…" className="w-36" />
          <button
            type="submit"
            className="min-h-10 rounded-md border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Find
          </button>
        </form>
      </div>

      <div className="scroll-x overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Serial</Th>
              <Th>Model</Th>
              <Th>Status</Th>
              <Th>Team / customer</Th>
              <Th>Received</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} message="No routers match." />}
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">
                  <Link href={`/routers/${r.id}`} className="hover:underline">
                    {r.serial_number}
                  </Link>
                </Td>
                <Td className="text-gray-500">{r.model ?? "—"}</Td>
                <Td>
                  <Badge status={r.status} />
                </Td>
                <Td className="text-gray-500">{r.team_name ?? r.customer_id ?? "—"}</Td>
                <Td className="text-gray-400">{fmtDate(r.date_received)}</Td>
                <Td>
                  <AdjustRouterButton
                    routerId={r.id}
                    serial={r.serial_number}
                    currentStatus={r.status}
                    currentModel={r.model}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
