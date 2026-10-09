import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDashboardData } from "@/lib/reports";
import { Td, Th, tableCls, LinkBtn, Badge } from "@/components/ui";
import { fmtM } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireUser();
  const data = getDashboardData(getDb());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Today</h1>
        <div className="flex gap-1">
          <LinkBtn href="/issue">+ Issue</LinkBtn>
          <LinkBtn href="/return">Return</LinkBtn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="Routers in stock" value={data.routers.inStock} />
        <Stat label="Routers with teams" value={data.routers.withTeams} />
        <Stat label="Fiber in stock" value={`${fmtM(data.fiber.inStockM)} m`} sub={`${data.fiber.poolPieces} pieces`} />
        <Stat label="Fiber with teams" value={`${fmtM(data.fiber.outM)} m`} sub={`${data.fiber.outPieces} pieces`} />
      </div>

      {data.alerts.length > 0 && (
        <div className="space-y-1.5">
          {data.alerts.slice(0, 6).map((a, i) => (
            <p key={i} className={`text-sm ${a.severity === "info" ? "text-gray-500" : "text-amber-700"}`}>
              {a.severity === "info" ? "·" : "⚠"} {a.message}
            </p>
          ))}
        </div>
      )}

      <div>
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Team</Th>
              <Th className="text-right">Routers</Th>
              <Th className="text-right">Fiber</Th>
              <Th className="text-right">Oldest</Th>
              <Th>Closed out</Th>
            </tr>
          </thead>
          <tbody>
            {data.teams.map((t) => (
              <tr key={t.id}>
                <Td className="font-medium">
                  <Link href={`/return?team=${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                  {!t.active && <span className="ml-2 text-xs text-gray-400">inactive</span>}
                </Td>
                <Td className="text-right">{t.routersHeld || "—"}</Td>
                <Td className="text-right">
                  {t.fiberPieces ? `${fmtM(t.fiberHeldM)} m` : "—"}
                </Td>
                <Td className="text-right text-gray-500">{t.oldestDays !== null ? `${t.oldestDays}d` : "—"}</Td>
                <Td>
                  {t.closedOutToday ? (
                    <Badge status="IN_STOCK">done</Badge>
                  ) : t.routersHeld + t.fiberPieces > 0 ? (
                    <span className="text-xs text-amber-700">not yet</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-gray-400">
          Click a team to close out its day. Items held longer than {data.settings.overdueDays} days are flagged above.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
