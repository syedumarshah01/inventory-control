import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (validateSessionToken(getDb(), token)) {
    redirect("/"); // already signed in
  }
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-black text-white">
            IT
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in with your app password</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
