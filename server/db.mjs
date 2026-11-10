import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export function openDB(dir = process.env.DATA_DIR || "./data") {
  mkdirSync(resolve(dir), { recursive: true });
  const db = new DatabaseSync(resolve(dir, "cassistai.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,segment TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',number_limit INTEGER NOT NULL DEFAULT 1,quota INTEGER NOT NULL DEFAULT 1000,demo INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS memberships(user_id TEXT REFERENCES users(id),company_id TEXT REFERENCES companies(id),PRIMARY KEY(user_id,company_id));
  CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),version INTEGER NOT NULL,hash TEXT NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(company_id,version));
  CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),hash TEXT NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS numbers(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),label TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',token TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'offline',heartbeat TEXT,qr TEXT,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),number_id TEXT REFERENCES numbers(id),contact TEXT NOT NULL,address TEXT,mode TEXT NOT NULL DEFAULT 'simulation',status TEXT NOT NULL DEFAULT 'BOT_ATIVO',context TEXT NOT NULL DEFAULT '{}',updated TEXT NOT NULL,UNIQUE(number_id,address));
  CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),company_id TEXT NOT NULL REFERENCES companies(id),role TEXT NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'sent',external_id TEXT,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS inbound(number_id TEXT NOT NULL,external_id TEXT NOT NULL,PRIMARY KEY(number_id,external_id));
  CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),code TEXT NOT NULL,product TEXT NOT NULL,quantity INTEGER NOT NULL,total INTEGER NOT NULL,deposit INTEGER,conditions TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ENVIADO',knowledge_version INTEGER NOT NULL,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),conversation_id TEXT REFERENCES conversations(id),message_id TEXT UNIQUE REFERENCES messages(id),kind TEXT NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_usage(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),model TEXT NOT NULL,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,cost REAL,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,company_id TEXT,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created TEXT NOT NULL);
  `);
  // Later additions to existing installations.
  for (const [table, column] of [
    ["numbers", "pair_phone TEXT"],
    ["numbers", "pair_code TEXT"],
    ["companies", "settings TEXT NOT NULL DEFAULT '{}'"],
  ])
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
    } catch {
      /* column already exists */
    }
  db.exec(`
  CREATE TABLE IF NOT EXISTS learned(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),kind TEXT NOT NULL,data TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'owner',created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS owner_questions(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),conversation_id TEXT REFERENCES conversations(id),customer_text TEXT NOT NULL,question TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDENTE',answer TEXT,created TEXT NOT NULL,answered TEXT);
  CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),conversation_id TEXT REFERENCES conversations(id),start TEXT NOT NULL,end TEXT NOT NULL,service TEXT NOT NULL DEFAULT '',customer TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'PENDENTE',google_event_id TEXT,created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS google_accounts(company_id TEXT PRIMARY KEY REFERENCES companies(id),refresh_token TEXT NOT NULL,email TEXT,created TEXT NOT NULL);
  `);
  return db;
}
export const q = (db, sql, ...params) => db.prepare(sql).all(...params);
export const one = (db, sql, ...params) => db.prepare(sql).get(...params);
export const run = (db, sql, ...params) => db.prepare(sql).run(...params);
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function audit(db, company, actor, action, detail = "") {
  run(
    db,
    "INSERT INTO audit VALUES(?,?,?,?,?,?)",
    uid(),
    company,
    actor,
    action,
    detail,
    now(),
  );
}
export function activeKnowledge(db, cid) {
  const k = one(
    db,
    "SELECT * FROM knowledge WHERE company_id=? ORDER BY version DESC LIMIT 1",
    cid,
  );
  return k ? { ...k, data: JSON.parse(k.data) } : null;
}
