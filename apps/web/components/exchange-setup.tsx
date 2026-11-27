"use client";
import { useActionState, useState } from "react";
import { createRelayKeyAction, type RelayKeyState } from "@/app/(panel)/exchange/actions";
import { Badge, Button, Card } from "./ui";

const KEY_PLACEHOLDER = "<RÖLE ANAHTARI>";

/** The Exchange Online PowerShell for the add-on scenario: two connectors and one rule, scoped to one person or one group. */
export function exchangeScript(p: { relayHost: string; key: string; scope: "person" | "group"; target: string }): string {
  const who = p.scope === "person" ? "-From $Gonderen" : "-FromMemberOf $Gonderen";
  return `# Sigwide: Exchange Online bağlantısı
# Gerekli modül (bir kez): Install-Module ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline

$Role      = "${p.relayHost}"
$Anahtar   = "${p.key}"
$Gonderen  = "${p.target}"

# 1) Giden bağlayıcı: kuralın seçtiği postaları Sigwide'a gönderir
New-OutboundConnector -Name "Sigwide" -ConnectorType OnPremises -IsTransportRuleScoped $true \`
  -UseMxRecord $false -SmartHosts $Role -TlsSettings DomainValidation -TlsDomain $Role \`
  -CloudServicesMailEnabled $true

# 2) Gelen bağlayıcı: Sigwide'dan dönen postaları sertifikasından tanır
New-InboundConnector -Name "Sigwide" -ConnectorType OnPremises -SenderDomains * \`
  -RequireTls $true -TlsSenderCertificateName $Role \`
  -CloudServicesMailEnabled $true

# 3) Kural: ${p.scope === "person" ? "bu kişinin" : "bu grubun üyelerinin"} postalarını Sigwide'a gönderir; imzası eklenmiş olanları tekrar göndermez
New-TransportRule -Name "Sigwide imza" ${who} \`
  -SetHeaderName "X-Sigwide-Key" -SetHeaderValue $Anahtar \`
  -RouteMessageOutboundConnector "Sigwide" \`
  -ExceptIfHeaderMatchesMessageHeader "X-Sigwide-Signed" -ExceptIfHeaderMatchesPatterns "." \`
  -StopRuleProcessing $true
`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ExchangeSetup({ relayHost, keySet }: { relayHost: string; keySet: boolean }) {
  const [state, create, pending] = useActionState<RelayKeyState>(createRelayKeyAction, {});
  const [scope, setScope] = useState<"person" | "group">("person");
  const [target, setTarget] = useState("");
  const [copied, setCopied] = useState<"" | "key" | "script" | "failed">("");
  const key = state.key ?? KEY_PLACEHOLDER;
  const script = exchangeScript({
    relayHost: relayHost || "<RÖLE ADRESİ>",
    key,
    scope,
    target: target.trim() || (scope === "person" ? "<E-POSTA ADRESİ>" : "<GRUP>"),
  });

  return (
    <div className="grid gap-6">
      <Card title="1. Röle anahtarı" actions={keySet || state.key ? <Badge tone="success">oluşturuldu</Badge> : <Badge tone="warning">yok</Badge>}>
        <p className="text-sm text-text-muted">
          Exchange kuralı bu anahtarı her postaya ekler. Sigwide postanın sizin kuruluşunuzdan geldiğini bununla anlar.
          Anahtar yalnızca oluşturulduğu anda gösterilir. Yenisini oluşturursanız eskisi hemen geçersiz olur ve Exchange kuralındaki
          değeri de güncellemeniz gerekir.
        </p>
        {state.key ? (
          <div className="mt-4 grid gap-2">
            <code className="break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm">{state.key}</code>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={async () => setCopied((await copyText(state.key!)) ? "key" : "failed")}>
                Anahtarı kopyala
              </Button>
              <p className="text-xs text-warning">Bu sayfadan ayrılınca anahtar bir daha gösterilmez. Aşağıdaki komutların içine de eklendi.</p>
            </div>
          </div>
        ) : (
          <form action={create} className="mt-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Oluşturuluyor..." : keySet ? "Yeni anahtar oluştur (eskisi geçersiz olur)" : "Anahtar oluştur"}
            </Button>
          </form>
        )}
      </Card>

      <Card title="2. Röle adresini Microsoft 365'e alan adı olarak ekleyin">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Microsoft 365 yönetim merkezi › Ayarlar › Etki alanları › <strong>Etki alanı ekle</strong>: <code className="font-mono">{relayHost || "röle adresi"}</code>
          </li>
          <li>Microsoft'un verdiği doğrulama kaydını (TXT, MS=ms...) Sigwide ekibine iletin. Kaydı biz ekleriz, sonra Doğrula'ya basarsınız.</li>
          <li>DNS kayıtları ve hizmet seçimi adımında hiçbir hizmeti seçmeden kurulumu bitirin. Bu alan adı posta almak için değil, Sigwide'ın sertifikasını tanımak içindir.</li>
        </ol>
        <p className="mt-3 text-xs text-text-muted">
          Microsoft, imza servislerinin dönen postalarda kullandığı sertifika adının kuruluşunuzda kayıtlı bir alan adı olmasını istiyor.
        </p>
      </Card>

      <Card title="3. Exchange Online komutları">
        <fieldset className="grid gap-2 text-sm">
          <legend className="font-medium">Önce kimin postalarıyla deneyeceksiniz?</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === "person"} onChange={() => setScope("person")} />
              Bir kişi
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === "group"} onChange={() => setScope("group")} />
              Bir grup
            </label>
          </div>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={scope === "person" ? "ad.soyad@sirketiniz.com" : "Grubun adı ya da e-posta adresi"}
            aria-label={scope === "person" ? "Kişinin e-posta adresi" : "Grubun adı ya da e-posta adresi"}
            className="max-w-sm rounded-md border border-border-input bg-bg px-3 py-2"
            aria-describedby="scope-help"
          />
          <span id="scope-help" className="text-xs text-text-muted">
            {scope === "person"
              ? "İlk deneme için kendi adresiniz en kolayı. Herkese açmak için sonra kuralı değiştirirsiniz."
              : "Grup posta etkin olmalı (dağıtım grubu ya da posta etkin güvenlik grubu). Yalnızca Entra'da açılmış güvenlik grupları Exchange kuralında görünmez."}
          </span>
        </fieldset>
        <pre className="mt-4 max-h-[480px] overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed">{script}</pre>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={async () => setCopied((await copyText(script)) ? "script" : "failed")}>
            Komutları kopyala
          </Button>
          <p className="text-xs text-text-muted" aria-live="polite">
            {copied === "script"
              ? "Kopyalandı. PowerShell'i açıp yapıştırın; Microsoft 365 yönetici hesabınızla giriş isteyecek."
              : copied === "key"
                ? "Anahtar kopyalandı."
                : copied === "failed"
                  ? "Kopyalanamadı; metni fareyle seçip Ctrl+C ile kopyalayın."
                  : state.key || !keySet
                    ? "Komutları anahtarı oluşturduktan sonra kopyalayın; anahtar içlerine eklenir."
                    : "Anahtar daha önce oluşturuldu ve gösterilmiyor. Komutlarda kullanmak için yenisini oluşturun."}
          </p>
        </div>
        <p className="mt-4 text-xs text-text-muted">
          Exchange yeni bağlayıcıları ve kuralları birkaç dakika ile yarım saat arasında devreye alır. Sonra test grubundan biri bir e-posta
          göndersin: imza eklenmiş olarak ulaşmalı.
        </p>
      </Card>
    </div>
  );
}
