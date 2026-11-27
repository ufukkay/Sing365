"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { addStarterTemplates } from "@/lib/starter";

/** Creates the starter signatures and opens the full one, previewed for the signed-in admin. */
export async function addStarterTemplatesAction() {
  const { tenantId, session } = await requirePanel();
  const id = await addStarterTemplates(data, tenantId);
  const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
  revalidatePath("/signatures");
  revalidatePath("/");
  redirect(`/signatures/${id}${me ? `?user=${encodeURIComponent(me.id)}` : ""}`);
}
