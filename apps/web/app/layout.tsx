import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sigwide", template: "%s · Sigwide" },
  description: "Microsoft 365 için merkezi e-posta imza yönetimi",
};

// Run before the first paint so a saved preference does not flash the system palette.
const themeScript = `
  try {
    const theme = localStorage.getItem("sigwide-theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {
    // The stylesheet follows the system theme when storage is unavailable.
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
