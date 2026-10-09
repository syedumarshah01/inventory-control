"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/issue", label: "Daily Issue" },
  { href: "/return", label: "Daily Return" },
  { href: "/fiber", label: "Fiber Pool" },
  { href: "/receive", label: "Receive" },
  { href: "/routers", label: "Routers" },
  { href: "/ledger", label: "Team Ledger" },
  { href: "/reports", label: "Reports" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login") return null;

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">
            IT
          </span>
          <span className="hidden sm:inline">Inventory Tracker</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="min-h-10 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
      <nav className="scroll-x mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2 sm:px-5">
        {LINKS.map((l) => {
          const active =
            l.href === "/" ? pathname === "/" : pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
