"use server";
import { revalidatePath } from "next/cache";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";

export interface RelayKeyState {
  /** The new key. Shown once: only its hash is stored. */
  key?: string;
}

/** Makes a new relay key for the tenant. Any earlier key stops working at once. */
export async function createRelayKeyAction(_prev: RelayKeyState): Promise<RelayKeyState> {
  const { tenantId } = await requirePanel();
  const key = await data.createRelayKey(tenantId);
  revalidatePath("/exchange");
  revalidatePath("/");
  return { key };
}
