import "server-only";
import type { Db } from "@sing365/db";

/** Returns the admin's role, creating the first admin of a tenant as owner. Null when not allowed. */
export async function ensureAdmin(
  db: Db,
  tenantId: string,
  person: { oid: string; email: string; name: string },
  opts: { createIfFirst: boolean; createAsOwner?: boolean },
): Promise<string | null> {
  return db.forTenant(tenantId, async (tx) => {
    const [existing] = await tx<{ role: string }[]>`select role from admin_users where entra_object_id = ${person.oid}`;
    if (existing) {
      await tx`update admin_users set last_sign_in_at = now(), email = ${person.email}, display_name = ${person.name} where entra_object_id = ${person.oid}`;
      return existing.role;
    }
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from admin_users`;
    const n = count?.n ?? 0;
    if (opts.createAsOwner || (opts.createIfFirst && n === 0)) {
      await tx`insert into admin_users (tenant_id, entra_object_id, email, display_name, role, last_sign_in_at)
               values (${tenantId}, ${person.oid}, ${person.email}, ${person.name}, 'owner', now())`;
      await tx`insert into audit_events (tenant_id, actor_kind, action, entity, after)
               values (${tenantId}, 'system', 'admin.create', 'admin_user', ${tx.json({ email: person.email, role: "owner" })})`;
      return "owner";
    }
    return null;
  });
}
