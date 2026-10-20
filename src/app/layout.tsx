import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hovir",
  description: "Платформа інтерактивних презентацій",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
