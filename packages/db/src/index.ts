import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export interface Db {
  sql: Sql;
  /**
   * Runs fn in a transaction with app.tenant_id set, so row level security only
   * shows that tenant's rows. Every tenant-scoped read and write goes through here.
   */
  forTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDb(url: string, opts: { max?: number } = {}): Db {
  const sql = postgres(url, { max: opts.max ?? 10, onnotice: () => {}, transform: { undefined: null } });
  return {
    sql,
    async forTenant(tenantId, fn) {
      if (!UUID.test(tenantId)) throw new Error("forTenant: tenantId must be a UUID");
      return sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
        return fn(tx);
      }) as Promise<Awaited<ReturnType<typeof fn>>>;
    },
    end: () => sql.end(),
  };
}

export * from "./directory";
