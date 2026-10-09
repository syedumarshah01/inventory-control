"use client";

import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Card({
  title,
  children,
  className = "",
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "green" | "blue" | "red" | "amber";
}) {
  const toneCls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50"
        : tone === "red"
          ? "border-red-200 bg-red-50"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50"
            : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border-2 p-4 shadow-sm ${toneCls}`}>
      <div className="text-sm font-medium text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export function Btn({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-brand-700 hover:bg-brand-50",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkBtn({
  href,
  variant = "secondary",
  className = "",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  children: ReactNode;
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-medium transition-colors";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-brand-700 hover:bg-brand-50",
  };
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

const STATUS_STYLES: Record<string, string> = {
  IN_STOCK: "bg-emerald-100 text-emerald-800",
  ISSUED: "bg-blue-100 text-blue-800",
  CONSUMED: "bg-gray-200 text-gray-700",
  SCRAP: "bg-red-100 text-red-800",
  INSTALLED: "bg-teal-100 text-teal-800",
  FAULTY: "bg-red-100 text-red-800",
  RETURNED_TO_SUPPLIER: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-gray-200 text-gray-600",
};

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {children ?? status.replace(/_/g, " ")}
    </span>
  );
}

export const tableCls = "w-full min-w-full border-collapse text-left text-sm";

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-gray-100 px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

export function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-gray-500">
        {message}
      </td>
    </tr>
  );
}

/** Shared fetch helper: returns parsed JSON or throws Error with the server message. */
export async function apiFetch(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data;
}

export function PillCount({ n, tone = "gray" }: { n: number; tone?: "gray" | "red" | "green" }) {
  const cls =
    tone === "red"
      ? "bg-red-100 text-red-700"
      : tone === "green"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-gray-100 text-gray-600";
  return (
    <span className={`ml-2 inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {n}
    </span>
  );
}
