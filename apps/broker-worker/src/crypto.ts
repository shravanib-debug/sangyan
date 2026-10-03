import { createDecipheriv } from "node:crypto";

// Blob layout: iv (12) || ciphertext || tag (16). Mirrors src/lib/crypto/secret-box.ts.
export function decryptSecret(blob: Buffer, keyBase64: string, aad: string): string {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("invalid_key_length");
  if (blob.length < 28) throw new Error("ciphertext_too_short");
  const decipher = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()]).toString("utf8");
}

export function fromPgBytea(value: string): Buffer {
  if (!value.startsWith("\\x")) throw new Error("unexpected_bytea_encoding");
  return Buffer.from(value.slice(2), "hex");
}

export function brokerAad(userId: string): string {
  return `broker:${userId}:zerodha`;
}
