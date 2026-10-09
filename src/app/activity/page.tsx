import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getActivity } from "@/lib/reports";
import { Card, EmptyRow, Input, Select, Td, Th, tableCls } from "@/components/ui";
import { downloadHref } from "@/lib/links";
import { addDays, fmtDate, fmtM, todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

const MOVEMENT_TYPES = [
  "CREATED_FROM_DRUM",
  "ISSUED",
  "RETURNED",
  "CUT",
  "CONSUMED",
  "MARKED_SCRAP",
  "CORRECTION",
  "RECEIVED",
  "INSTALLED",
  "MARKED_FAULTY",
];

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    teamId?: string;
    itemType?: string;
    movementType?: string;
    q?: string;
  }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const from = sp.from || addDays(todayStr(), -30);
  const to = sp.to || todayStr();
  const teamId = Number(sp.teamId) || undefined;
  const itemType = sp.itemType === "FIBER" || sp.itemType === "ROUTER" ? sp.itemType : undefined;
  const movementType = sp.movementType || undefined;
  const q = sp.q?.trim() || "";

  const db = getDb();
  const teams = db.prepare("SELECT id, name FROM teams ORDER BY id").all() as { id: number; name: string }[];
  const rows = getActivity(db, { from, to, teamId, itemType, movementType, q, limit: 300 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <a
          href={downloadHref("activity", {
            from,
            to,
            teamId: sp.teamId,
            itemType: sp.itemType,
            movementType: sp.movementType,
            q: sp.q,
          })}
          className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </a>
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" action="/activity" method="GET">
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">From</span>
            <Input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">To</span>
            <Input type="date" name="to" defaultValue={to} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Team</span>
            <Select name="teamId" defaultValue={sp.teamId ?? ""}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Item type</span>
            <Select name="itemType" defaultValue={sp.itemType ?? ""}>
              <option value="">Fiber + routers</option>
              <option value="FIBER">Fiber only</option>
              <option value="ROUTER">Routers only</option>
            </Select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Movement</span>
            <Select name="movementType" defaultValue={sp.movementType ?? ""}>
              <option value="">Any movement</option>
              {MOVEMENT_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Search code/serial</span>
            <Input name="q" defaultValue={q} placeholder="DRUM-001-A / SN1001" />
          </div>
          <div className="sm:col-span-3 lg:col-span-6">
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-brand-600 px-5 py-2 text-base font-medium text-white hover:bg-brand-700"
            >
              Apply filters
            </button>
          </div>
        </form>
      </Card>

      <Card title={`Movements (${rows.length} shown, newest first)`}>
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Item</Th>
                <Th>Type</Th>
                <Th>Movement</Th>
                <Th>Team</Th>
                <Th className="text-right">Length</Th>
                <Th>Customer</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={8} message="No movements match these filters." />}
              {(rows as Record<string, unknown>[]).map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap">{fmtDate(String(r.date))}</Td>
                  <Td>
                    <Link
                      href={r.item_type === "FIBER" ? `/fiber/${String(r.item_id)}` : `/routers/${String(r.item_id)}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {String(r.item_code)}
                    </Link>
                  </Td>
                  <Td className="text-xs text-gray-500">{String(r.item_type)}</Td>
                  <Td className="font-medium text-gray-800">{String(r.type).replace(/_/g, " ")}</Td>
                  <Td>{(r.team_name as string) ?? "—"}</Td>
                  <Td className="text-right">
                    {r.length_m !== null && r.length_m !== undefined ? `${fmtM(Number(r.length_m))} m` : "—"}
                  </Td>
                  <Td>{(r.customer_id as string) ?? "—"}</Td>
                  <Td className="max-w-md text-gray-600">{(r.notes as string) ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
