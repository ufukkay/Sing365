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
  /** Whether a relay key exists (the key itself is stored only as a hash). */
  relayKeySet: boolean;
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
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  faxNumber?: string;
  /** Two-letter country of use, e.g. TR. */
  usageLocation?: string;
  /** e.g. tr-TR */
  preferredLanguage?: string;
  photoUrl?: string;
  groupIds: string[];
  customAttrs: Record<string, string>;
  /** On-premises extension attributes (extensionAttribute1..15), as {{ext.extensionAttribute1}}. */
  extAttrs?: Record<string, string>;
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

/** A new template together with the one rule that decides who gets it. */
export interface NewTemplate {
  name: string;
  kind: Template["kind"];
  status: Template["status"];
  layout: Layout;
  /** Lower runs first. Stored as the template's sort order. */
  priority: number;
  rule: Pick<Rule, "senders" | "recipients" | "appliesTo"> & Partial<Pick<Rule, "exceptions" | "enabled">>;
}

export interface PersonRef {
  id: string;
  email: string;
  displayName: string;
}

export interface VisualTemplateUpdate {
  name: string;
  layout: Layout;
  version: number;
}

export interface TemplateApplicationUpdate extends Pick<Rule, "senders" | "recipients" | "appliesTo" | "priority" | "enabled"> {
  ruleId?: string;
  version: number;
}

export interface DataLayer {
  getTenant(tenantId: string): Promise<Tenant | null>;
  getTenantByEntraId(entraTenantId: string): Promise<Tenant | null>;
  /** The tenant whose Exchange rule stamps this relay key (stored only as a SHA-256 hash). */
  getTenantByRelayKey(key: string): Promise<Tenant | null>;
  /** Makes a new relay key for the tenant, replacing any earlier one, and returns it (shown once). */
  createRelayKey(tenantId: string): Promise<string>;
  /** People by display name; `q` searches name and address. At most `limit` (default 500). */
  listUsers(tenantId: string, opts?: { q?: string; limit?: number }): Promise<DirectoryUser[]>;
  countUsers(tenantId: string): Promise<{ total: number; enabled: number }>;
  /** Name and address of every enabled person (up to 5,000), for pickers. */
  listPeople(tenantId: string): Promise<PersonRef[]>;
  getUser(tenantId: string, userId: string): Promise<DirectoryUser | null>;
  /** Matches the primary address or any alias, case-insensitively. */
  findUserByEmail(tenantId: string, email: string): Promise<DirectoryUser | null>;
  listGroups(tenantId: string): Promise<DirectoryGroup[]>;
  listTemplates(tenantId: string): Promise<Template[]>;
  getTemplate(tenantId: string, templateId: string): Promise<Template | null>;
  listRules(tenantId: string): Promise<Rule[]>;
  getSyncStatus(tenantId: string): Promise<SyncStatus>;
  /** Saves a template and its rule together. Returns the new template id. */
  createTemplateWithRule(tenantId: string, input: NewTemplate): Promise<string>;
  /** Replaces a template's name and layout and bumps its version (the add-in re-fetches on a new version). */
  updateTemplate(tenantId: string, templateId: string, input: { name: string; layout: Layout }): Promise<void>;
  updateVisualTemplate(tenantId: string, templateId: string, input: VisualTemplateUpdate): Promise<boolean>;
  updateTemplateApplication(tenantId: string, templateId: string, input: TemplateApplicationUpdate): Promise<boolean>;
  setVisualTemplateStatus(tenantId: string, templateId: string, version: number, status: Template["status"], previous: Template["status"]): Promise<boolean>;
  deleteArchivedTemplate(tenantId: string, templateId: string, version: number): Promise<boolean>;
}
