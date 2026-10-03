import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM authenticated encryption for secrets stored at rest.
 * Blob layout: iv (12) || ciphertext || tag (16). The layout is also readable
 * by WebCrypto (ciphertext||tag), which the Edge Function relies on.
 * `aad` binds a blob to its owner so rows cannot be swapped between users.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseEncryptionKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must decode to exactly 32 bytes.");
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptSecret(blob: Buffer, key: Buffer, aad: string): string {
  if (blob.length < IV_BYTES + TAG_BYTES) throw new Error("Ciphertext is too short.");
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** PostgREST represents bytea as a backslash-x prefixed hex string. */
export function toPgBytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

export function fromPgBytea(value: string): Buffer {
  if (!value.startsWith("\\x")) throw new Error("Unexpected bytea encoding.");
  return Buffer.from(value.slice(2), "hex");
}
