import "server-only";

import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPin(pin: string, hash: string, salt: string) {
  const actual = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
