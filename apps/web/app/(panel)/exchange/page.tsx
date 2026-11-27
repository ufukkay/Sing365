import { ExchangeSetup } from "@/components/exchange-setup";
import { PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { env } from "@/lib/env";

export const metadata = { title: "Exchange bağlantısı" };

export default async function ExchangePage() {
  const { tenantId } = await requirePanel();
  const tenant = await data.getTenant(tenantId);
  return (
    <>
      <PageHeader
        title="Exchange bağlantısı"
        description="Sigwide imzayı sunucu tarafında ekler: Exchange Online seçtiğiniz kişilerin postalarını Sigwide'a gönderir, imza eklenir ve posta Exchange'e geri döner. Outlook'tan, tarayıcıdan ya da telefondan, hangi cihazdan gönderilirse gönderilsin imza eklenir."
      />
      <ExchangeSetup relayHost={env.relayHost} keySet={tenant?.relayKeySet ?? false} />
    </>
  );
}
