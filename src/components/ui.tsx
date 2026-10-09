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
  actions,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-gray-200 py-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const base =
    "inline-flex min-h-10 items-center justify-center rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary: "bg-gray-900 text-white hover:bg-gray-700",
    secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkBtn({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center justify-center rounded-md px-3.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50";

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
  IN_STOCK: "bg-emerald-50 text-emerald-700",
  ISSUED: "bg-blue-50 text-blue-700",
  CONSUMED: "bg-gray-100 text-gray-500",
  SCRAP: "bg-red-50 text-red-600",
  INSTALLED: "bg-emerald-50 text-emerald-700",
  FAULTY: "bg-red-50 text-red-600",
  RETURNED_TO_SUPPLIER: "bg-amber-50 text-amber-700",
};

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {children ?? status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export const tableCls = "w-full text-left text-sm";

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`border-b border-gray-200 py-2 pr-3 text-xs font-medium text-gray-400 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-gray-100 py-2 pr-3 align-middle ${className}`}>{children}</td>;
}

export function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-6 text-center text-sm text-gray-400">
        {message}
      </td>
    </tr>
  );
}

/** Fetch helper: parses JSON or throws Error with the server's message. */
export async function apiFetch(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data;
}
