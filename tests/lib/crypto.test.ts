import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  fromPgBytea,
  parseEncryptionKey,
  toPgBytea
} from "@/lib/crypto/secret-box";
import { hmacHex, verifyBodySignature } from "@/lib/crypto/signing";

const key = randomBytes(32);

describe("secret box", () => {
  it("round-trips and never stores plaintext", () => {
    const blob = encryptSecret("kite-access-token", key, "broker:u1:zerodha");
    expect(blob.toString("utf8")).not.toContain("kite-access-token");
    expect(decryptSecret(blob, key, "broker:u1:zerodha")).toBe("kite-access-token");
  });

  it("uses a fresh IV per encryption", () => {
    const a = encryptSecret("same", key, "aad");
    const b = encryptSecret("same", key, "aad");
    expect(a.equals(b)).toBe(false);
  });

  it("rejects a blob moved to another user (AAD mismatch)", () => {
    const blob = encryptSecret("token", key, "broker:u1:zerodha");
    expect(() => decryptSecret(blob, key, "broker:u2:zerodha")).toThrow();
  });

  it("rejects tampering and the wrong key", () => {
    const blob = encryptSecret("token", key, "aad");
    const tampered = Buffer.from(blob);
    tampered.writeUInt8(tampered.readUInt8(14) ^ 0xff, 14);
    expect(() => decryptSecret(tampered, key, "aad")).toThrow();
    expect(() => decryptSecret(blob, randomBytes(32), "aad")).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => parseEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow();
    expect(parseEncryptionKey(key.toString("base64")).equals(key)).toBe(true);
  });

  it("round-trips through the PostgREST bytea encoding", () => {
    const blob = encryptSecret("token", key, "aad");
    expect(toPgBytea(blob).startsWith("\\x")).toBe(true);
    expect(fromPgBytea(toPgBytea(blob)).equals(blob)).toBe(true);
  });

  it("is readable by WebCrypto, which the Edge Function uses", async () => {
    const blob = encryptSecret('{"auth":"a"}', key, "push:u1");
    const cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(key), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(blob.subarray(0, 12)), additionalData: new TextEncoder().encode("push:u1") },
      cryptoKey,
      new Uint8Array(blob.subarray(12))
    );
    expect(new TextDecoder().decode(plain)).toBe('{"auth":"a"}');
  });
});

describe("worker request signing", () => {
  const signingKey = "k".repeat(40);
  const body = JSON.stringify({ event: { id: "e1" } });
  const now = 1_800_000_000_000;
  const valid = () => ({
    key: signingKey,
    rawBody: body,
    timestampMs: String(now),
    signature: hmacHex(signingKey, `${now}.${body}`),
    nowMs: now
  });

  it("accepts a correctly signed fresh request", () => {
    expect(verifyBodySignature(valid())).toBe(true);
  });

  it("rejects a modified body, wrong key, missing headers and stale timestamps", () => {
    expect(verifyBodySignature({ ...valid(), rawBody: body.replace("e1", "e2") })).toBe(false);
    expect(verifyBodySignature({ ...valid(), key: "x".repeat(40) })).toBe(false);
    expect(verifyBodySignature({ ...valid(), signature: null })).toBe(false);
    expect(verifyBodySignature({ ...valid(), timestampMs: null })).toBe(false);
    expect(verifyBodySignature({ ...valid(), nowMs: now + 6 * 60 * 1000 })).toBe(false);
    expect(verifyBodySignature({ ...valid(), timestampMs: "not-a-number" })).toBe(false);
  });
});
