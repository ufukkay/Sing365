import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { readSession } from "@/lib/session";

export const metadata = { title: "Kuruluşunuzu bağlayın" };

const errors: Record<string, string> = {
  consent_denied: "İzin verilmedi. Bu adımı bir Microsoft 365 genel yöneticisinin yapması gerekir.",
  state: "Oturum süresi doldu, lütfen tekrar deneyin.",
  tenant_mismatch: "İzin, giriş yaptığınız kuruluş için verilmedi.",
  no_database: "Sunucu yapılandırması eksik (veritabanı).",
};

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await readSession();
  if (!session) redirect("/signin");
  if (session.tenantId) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-lg">
        <h1 className="text-2xl font-bold">Microsoft 365 kuruluşunuzu bağlayın</h1>
        <p className="mt-2 text-sm text-text-muted">
          Sigwide, imzalardaki ad, unvan, departman ve telefon bilgilerini dizininizden okur. Bunun için bir Microsoft 365
          yöneticisinin kuruluş adına bir kez izin vermesi gerekir.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          <li>Kullanıcı profillerini okuma (yalnızca okuma)</li>
          <li>Grup üyeliklerini okuma (kurallar için)</li>
          <li>E-posta içeriğine erişim yok</li>
        </ul>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
            {errors[error] ?? "Bağlantı tamamlanamadı."}
          </p>
        )}
        <form action="/api/consent/start" method="post" className="mt-6">
          <Button type="submit" size="lg" className="w-full">
            Yönetici olarak izin ver
          </Button>
        </form>
        <p className="mt-3 text-xs text-text-muted">Giriş yapan: {session.email}</p>
      </Card>
    </main>
  );
}
