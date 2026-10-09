import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Inventory Tracker",
  description: "Fiber cable and router inventory for broadband installation teams.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <ToastProvider>
          <ConfirmProvider>
            <Nav />
            <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">{children}</main>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
