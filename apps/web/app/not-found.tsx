import Link from "next/link";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Sayfa bulunamadı" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <EmptyState
        title="Sayfa bulunamadı"
        body="Aradığınız sayfa ya da imza yok, silinmiş veya bağlantı hatalı olabilir."
        action={
          <Link href="/" className="text-sm font-medium text-accent underline">
            Genel bakışa dön
          </Link>
        }
      />
    </main>
  );
}
