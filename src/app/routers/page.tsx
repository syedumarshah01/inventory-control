import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listRouters, routerStatusCounts } from "@/lib/reports";
import {
  Badge,
  Card,
  EmptyRow,
  Input,
  PillCount,
  Select,
  Td,
  Th,
  tableCls,
  
  LinkBtn,
} from "@/components/ui";
import { downloadHref } from "@/lib/links";
import { fmtDate } from "@/lib/dates";
import { AdjustRouterButton } from "./router-actions";

export const dynamic = "force-dynamic";

const STATUSES = [
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
  const status = sp.status && STATUSES.some((s) => s.key === sp.status) ? sp.status : "ALL";
  const q = sp.q?.trim() ?? "";
  const db = getDb();
  const counts = routerStatusCounts(db);
  const rows = listRouters(db, { status, q });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Router Inventory</h1>
        <div className="flex gap-2">
          <a
            href={downloadHref("routers", { status, q })}
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </a>
          <LinkBtn href="/receive" variant="primary">
            + Receive routers
          </LinkBtn>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link
            key={s.key}
            href={`/routers?status=${s.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              s.key === status
                ? "bg-brand-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.label}
            <PillCount n={counts[s.key] ?? 0} tone={s.key === "FAULTY" ? "red" : s.key === "IN_STOCK" ? "green" : "gray"} />
          </Link>
        ))}
      </div>

      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-2" action="/routers" method="GET">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q} placeholder="Search serial number…" className="max-w-xs" />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-base font-medium text-white hover:bg-brand-700"
          >
            Search
          </button>
          {q && (
            <Link href={`/routers?status=${status}`} className="text-sm font-medium text-brand-700 hover:underline">
              Clear
            </Link>
          )}
        </form>

        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Serial</Th>
                <Th>Model</Th>
                <Th>Status</Th>
                <Th>Team</Th>
                <Th>Customer</Th>
                <Th>Received</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={7} message="No routers match." />}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <Td className="font-medium text-gray-900">
                    <Link href={`/routers/${r.id}`} className="text-brand-700 hover:underline">
                      {r.serial_number}
                    </Link>
                  </Td>
                  <Td>{r.model ?? "—"}</Td>
                  <Td>
                    <Badge status={r.status} />
                  </Td>
                  <Td>{r.team_name ?? "—"}</Td>
                  <Td>{r.customer_id ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-gray-500">{fmtDate(r.date_received)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/routers/${r.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        History
                      </Link>
                      <AdjustRouterButton
                        routerId={r.id}
                        serial={r.serial_number}
                        currentStatus={r.status}
                        currentModel={r.model}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
