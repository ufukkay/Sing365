import { seedData } from "./seed";
import type { DataLayer } from "./types";

export * from "./types";
export { SEED_TENANT_ID } from "./seed";

/** The active data layer. replica-backend swaps this for the Postgres one. */
export const data: DataLayer = seedData;
