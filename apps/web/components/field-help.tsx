import { FIELD_HELP } from "@/lib/html-template";
import type { FieldValues } from "@sing365/render";
import { Card } from "./ui";

/** The placeholders an admin can use, with the signed-in admin's own values as examples. */
export function FieldHelp({ values }: { values: FieldValues | null }) {
  return (
    <Card title="Kullanılabilir alanlar">
      <p className="mb-3 text-xs text-text-muted">
        {values ? "Sağdaki örnekler sizin dizin kaydınızdan." : "Değerler her kişi için dizinden dolar."} Büyük harf için {"{{surname|upper}}"}.
      </p>
      <table className="w-full text-left text-xs">
        <tbody>
          {FIELD_HELP.map((f) => (
            <tr key={f.key} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3 font-mono">{`{{${f.key}}}`}</td>
              <td className="py-1.5 pr-3 text-text-muted">{f.label}</td>
              <td className="py-1.5 break-all">{values?.[f.key] || <span className="text-text-muted">boş</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
