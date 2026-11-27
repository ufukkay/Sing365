import { describe, expect, it, beforeAll } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { verifyEntraToken } from "../lib/entra";

const TID = "16e3cdc7-4fc8-4d21-815d-7c3ece9a95e7";
const CLIENT = "58134c28-ee7a-486b-8910-50ba41069e04";

let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
let otherKey: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  privateKey = kp.privateKey as CryptoKey;
  const jwk: JWK = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
  otherKey = (await generateKeyPair("RS256")).privateKey as CryptoKey;
});

const token = (claims: Record<string, unknown>, key = privateKey) =>
  new SignJWT({ tid: TID, oid: "oid-1", preferred_username: "ufuk@talay.com", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer((claims.iss as string) ?? `https://login.microsoftonline.com/${TID}/v2.0`)
    .setAudience((claims.aud as string) ?? CLIENT)
    .setIssuedAt()
    .setExpirationTime((claims.exp as string) ?? "1h")
    .sign(key);

describe("verifyEntraToken", () => {
  it("accepts a token for our app from its own tenant's issuer", async () => {
    const c = await verifyEntraToken(await token({}), { audience: CLIENT, keys });
    expect(c.tid).toBe(TID);
  });

  it("accepts v1 issuer and the api:// audience", async () => {
    const t = await token({ iss: `https://sts.windows.net/${TID}/`, aud: `api://app.example.com/${CLIENT}` });
    await expect(verifyEntraToken(t, { audience: [CLIENT, `api://app.example.com/${CLIENT}`], keys })).resolves.toBeTruthy();
  });

  it("rejects another app's audience", async () => {
    await expect(verifyEntraToken(await token({ aud: "someone-else" }), { audience: CLIENT, keys })).rejects.toThrow();
  });

  it("rejects an issuer from a different tenant than tid", async () => {
    const t = await token({ iss: "https://login.microsoftonline.com/00000000-0000-4000-8000-000000000000/v2.0" });
    await expect(verifyEntraToken(t, { audience: CLIENT, keys })).rejects.toThrow(/issuer/);
  });

  it("rejects a token signed by an unknown key", async () => {
    await expect(verifyEntraToken(await token({}, otherKey), { audience: CLIENT, keys })).rejects.toThrow();
  });

  it("rejects expired tokens and wrong nonce", async () => {
    const expired = await new SignJWT({ tid: TID, oid: "o" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://login.microsoftonline.com/${TID}/v2.0`)
      .setAudience(CLIENT)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    await expect(verifyEntraToken(expired, { audience: CLIENT, keys })).rejects.toThrow();
    await expect(verifyEntraToken(await token({ nonce: "a" }), { audience: CLIENT, nonce: "b", keys })).rejects.toThrow(/nonce/);
  });
});
