import { Card } from "@/components/ui";
import { dbConfigured, entraConfigured, missingEntraSettings } from "@/lib/env";

export const metadata = { title: "Giriş" };

const errors: Record<string, string> = {
  denied: "Giriş iptal edildi.",
  state: "Oturum süresi doldu, lütfen tekrar deneyin.",
  token: "Microsoft'tan gelen yanıt doğrulanamadı.",
  not_admin: "Bu kuruluşta Sigwide yöneticisi değilsiniz. Kuruluşunuzdaki Sigwide sahibinden sizi eklemesini isteyin.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-accent">Sigwide</h1>
        <p className="mt-2 text-sm text-text-muted">Microsoft 365 iş hesabınızla giriş yapın.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
            {errors[error] ?? "Giriş yapılamadı."}
          </p>
        )}
        {entraConfigured() ? (
          <a
            href="/api/auth/signin"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover"
          >
            Microsoft ile giriş yap
          </a>
        ) : (
          <div className="mt-6 text-sm text-text-muted">
            <p>Giriş henüz yapılandırılmadı.</p>
            {process.env.NODE_ENV !== "production" && (
              <>
                <p className="mt-2">Eksik ayarlar: {missingEntraSettings().join(", ")}{!dbConfigured() && ", DATABASE_URL"}.</p>
                <p className="mt-2">
                  Bu değerler <code className="font-mono">apps/web/.env.local</code> dosyasında olmalı. Windows Not Defteri dosyayı{" "}
                  <code className="font-mono">.env.local.txt</code> olarak kaydedebilir; adı kontrol edin ve değişiklikten sonra{" "}
                  <code className="font-mono">pnpm dev</code> komutunu yeniden başlatın.
                </p>
              </>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
