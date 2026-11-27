import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sing365", template: "%s · Sing365" },
  description: "Microsoft 365 için merkezi e-posta imza yönetimi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
