import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Fiber and router tracking for broadband installation teams.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <ToastProvider>
          <ConfirmProvider>
            <Nav />
            <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
