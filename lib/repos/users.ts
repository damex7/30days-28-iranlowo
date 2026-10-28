import "server-only";
import { db, type Db } from "@/lib/db";

export type Role = "customer" | "agent" | "admin";

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  is_demo: boolean;
  is_read_only: boolean;
  phone: string | null;
  created_at: string;
};

const COLUMNS = "id, email::text, display_name, role, is_active, is_demo, is_read_only, phone, created_at::text";

export async function findUserById(id: string, q: Db = db): Promise<UserRow | null> {
  const rows = await q.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findUserForSignIn(email: string): Promise<(UserRow & { password_hash: string | null }) | null> {
  const rows = await db.query<UserRow & { password_hash: string | null }>(
    `SELECT ${COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

/** Returns null when the email is taken (unique violation swallowed by ON CONFLICT). */
export async function insertUser(
  input: { email: string; displayName: string; passwordHash: string | null; role?: Role; isDemo?: boolean; isReadOnly?: boolean; phone?: string | null },
  q: Db = db,
): Promise<UserRow | null> {
  const rows = await q.query<UserRow>(
    `INSERT INTO users (email, display_name, password_hash, role, is_demo, is_read_only, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${COLUMNS}`,
    [input.email, input.displayName, input.passwordHash, input.role ?? "customer", input.isDemo ?? false, input.isReadOnly ?? false, input.phone ?? null],
  );
  return rows[0] ?? null;
}

export async function listStaff(): Promise<UserRow[]> {
  return db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE role IN ('agent', 'admin') ORDER BY role, display_name`);
}

export async function findUsersByEmailPrefix(search: string): Promise<UserRow[]> {
  return db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE NOT is_demo AND email ILIKE $1 || '%' ORDER BY email LIMIT 10`,
    [search],
  );
}

export async function setRole(id: string, role: Role, q: Db = db): Promise<UserRow | null> {
  const rows = await q.query<UserRow>(`UPDATE users SET role = $2 WHERE id = $1 AND NOT is_demo RETURNING ${COLUMNS}`, [id, role]);
  return rows[0] ?? null;
}

export async function setActive(id: string, active: boolean, q: Db = db): Promise<UserRow | null> {
  const rows = await q.query<UserRow>(`UPDATE users SET is_active = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, active]);
  return rows[0] ?? null;
}
