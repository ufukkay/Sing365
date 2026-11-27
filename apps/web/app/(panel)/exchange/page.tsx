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
        description="Giden e-postalara sunucu tarafında otomatik imza eklemek için bağlantı ayarları."
      />
      <ExchangeSetup relayHost={env.relayHost} keySet={tenant?.relayKeySet ?? false} />
    </>
  );
}
