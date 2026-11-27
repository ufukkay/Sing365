import type { Layout } from "@sing365/render";
import type { Rule } from "@sing365/rules";

/**
 * The data layer contract. The seed implementation (seed.ts) and the Postgres
 * implementation (replica-backend) both satisfy it, so swapping one for the
 * other changes no screen code. Every call is scoped to one tenant.
 */

export type DeploymentMode = "client" | "server" | "both";

export interface Tenant {
  id: string;
  entraTenantId: string;
  name: string;
  domains: string[];
  deploymentMode: DeploymentMode;
  consentStatus: "pending" | "granted" | "revoked";
}

export interface DirectoryUser {
  id: string;
  email: string;
  aliases: string[];
  displayName: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  companyName?: string;
  officeLocation?: string;
  businessPhone?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
  photoUrl?: string;
  groupIds: string[];
  customAttrs: Record<string, string>;
  overrides: Record<string, string>;
  accountEnabled: boolean;
  lastSyncedAt: string | null;
}

export interface DirectoryGroup {
  id: string;
  displayName: string;
}

export interface Template {
  id: string;
  name: string;
  kind: "signature" | "disclaimer" | "banner";
  status: "draft" | "published" | "archived";
  version: number;
  layout: Layout;
  updatedAt: string;
}

export interface SyncStatus {
  state: "never" | "running" | "succeeded" | "failed";
  finishedAt: string | null;
  usersChanged: number;
  error?: string;
}

export interface DataLayer {
  getTenant(tenantId: string): Promise<Tenant | null>;
  getTenantByEntraId(entraTenantId: string): Promise<Tenant | null>;
  listUsers(tenantId: string): Promise<DirectoryUser[]>;
  getUser(tenantId: string, userId: string): Promise<DirectoryUser | null>;
  /** Matches the primary address or any alias, case-insensitively. */
  findUserByEmail(tenantId: string, email: string): Promise<DirectoryUser | null>;
  listGroups(tenantId: string): Promise<DirectoryGroup[]>;
  listTemplates(tenantId: string): Promise<Template[]>;
  getTemplate(tenantId: string, templateId: string): Promise<Template | null>;
  listRules(tenantId: string): Promise<Rule[]>;
  getSyncStatus(tenantId: string): Promise<SyncStatus>;
}
