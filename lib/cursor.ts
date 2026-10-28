// Keyset cursors travel in the URL as opaque base64url strings. They are
// parsed defensively: a tampered cursor just means "first page".

export function encodeCursor(parts: (string | number)[]): string {
  return Buffer.from(parts.map(String).join("\u0000"), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined, arity: number): string[] | null {
  if (!cursor) return null;
  try {
    const parts = Buffer.from(cursor, "base64url").toString("utf8").split("\u0000");
    return parts.length === arity && parts.every((p) => p.length > 0 && p.length < 200) ? parts : null;
  } catch {
    return null;
  }
}
