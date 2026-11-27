import { CircleCheck, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, PageHeader, StatTile } from "@/components/ui";

export const metadata = { title: "Tasarım sistemi" };

const swatches = [
  "bg", "surface", "border", "border-input", "text", "text-muted", "accent", "accent-hover", "accent-subtle",
  "danger", "danger-subtle", "success", "success-subtle", "warning", "warning-subtle", "info",
];

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <PageHeader title="Tasarım sistemi" description="Her bileşen, her durumu ile. Kaynak: replica/design/tokens.json ve components.md." />

      <div className="grid gap-6">
        <Card title="Renk rolleri">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {swatches.map((s) => (
              <li key={s} className="text-xs">
                <span className="block h-12 rounded-md border border-border" style={{ background: `var(--s365-color-${s})` }} />
                <span className="mt-1 block font-mono">{s}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Tipografi">
          <div className="space-y-2">
            <p className="text-[2rem] leading-10 font-bold">Display 32 / 700</p>
            <p className="text-2xl font-semibold">XL 24 / 650</p>
            <p className="text-lg font-semibold">LG 18 / 600</p>
            <p className="text-base">Base 16 / 400. İmzalar her e-postada aynı ve güncel.</p>
            <p className="text-sm">SM 14 / 400. Panel gövde metni.</p>
            <p className="text-xs font-medium text-text-muted">XS 12 / 500. Yardımcı metin.</p>
          </div>
        </Card>

        <Card title="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Yayınla</Button>
            <Button variant="secondary">Önizle</Button>
            <Button variant="ghost">İptal</Button>
            <Button variant="danger">Sil</Button>
            <Button loading>Kaydediliyor</Button>
            <Button disabled>Devre dışı</Button>
            <Button size="sm">Küçük</Button>
            <Button size="lg">Büyük</Button>
          </div>
        </Card>

        <Card title="Form alanları">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="d-name" label="İmza adı" placeholder="Kurumsal (tam)" required />
            <Field id="d-hint" label="Telefon" defaultValue="+90 212 555 01 10" hint="Dizindeki değerin yerine geçer." />
            <Field id="d-err" label="Bağlantı" defaultValue="javascript:alert(1)" error="Yalnızca https, mailto ve tel bağlantıları." />
            <Field id="d-ro" label="E-posta (dizinden)" defaultValue="ayse.yilmaz@example.com" readOnly />
          </div>
        </Card>

        <Card title="Durum rozetleri">
          <div className="flex flex-wrap gap-2">
            <Badge>Taslak</Badge>
            <Badge tone="accent">Aktif</Badge>
            <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3" />}>Yayında</Badge>
            <Badge tone="warning" icon={<TriangleAlert aria-hidden className="size-3" />}>Senkron gecikti</Badge>
            <Badge tone="danger">İzin kaldırıldı</Badge>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Aktif posta kutusu" value="248" note="faturalanan kişi sayısı" />
          <StatTile label="Yayındaki imza" value="3" note="1 taslak" />
          <StatTile label="Tıklama (30 gün)" value="—" note="henüz veri yok" />
        </div>

        <Card title="Boş durum">
          <EmptyState title="Henüz imza yok" body="İlk imzanızı oluşturun; dizindeki bilgiler otomatik dolar." action={<Button>İmza oluştur</Button>} />
        </Card>
      </div>
    </main>
  );
}
