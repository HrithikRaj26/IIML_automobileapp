import type { Metadata } from "next";
import NavHeader from "@/components/NavHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nirnay — Shutdown Window Decision Engine",
  description: "Tata Motors Pune PV — Body Shop Line 2 shutdown planning",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <NavHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
