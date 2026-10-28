import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt is deliberately slow and memory-hungry, so a leaked hash costs an
// attacker real hardware per guess. Each user gets their own random salt,
// so two people with the same password still get different hashes and a
// precomputed table is useless.
const N = 16384;
const r = 8;
const p = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$16384$8$1$<salt b64>$<hash b64>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

// Used when the email doesn't exist, so "no such user" takes as long as
// "wrong password" and response timing doesn't reveal which emails exist.
const DUMMY = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? DUMMY).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const key = await derive(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: Number(rr), p: Number(pp) });
  // timingSafeEqual compares every byte, so how long the comparison takes
  // says nothing about how many leading bytes matched.
  const same = key.length === expected.length && timingSafeEqual(key, expected);
  return stored !== null && same;
}
