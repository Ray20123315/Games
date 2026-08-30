import schemaSql from "../db/schema.js";
import { HttpError } from "./http.js";

const schemaReadyPromises = new WeakMap();
const SCHEMA_CACHE_KEY = Symbol("boardverse.schemaCacheKey");

class DurablePreparedStatement {
  constructor(stub, sql, binds = []) {
    this.stub = stub;
    this.sql = sql;
    this.binds = binds;
  }
  bind(...binds) { return new DurablePreparedStatement(this.stub, this.sql, binds); }
  first() { return this.stub.query("first", this.sql, this.binds); }
  all() { return this.stub.query("all", this.sql, this.binds); }
  run() { return this.stub.query("run", this.sql, this.binds); }
}

function durableDatabase(namespace) {
  const stub = namespace.getByName("primary");
  return {
    [SCHEMA_CACHE_KEY]: stub,
    exec(sql) { return stub.query("exec", sql, []); },
    prepare(sql) { return new DurablePreparedStatement(stub, sql); },
  };
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "", quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) current += sql[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function initializeSchema(db) {
  if (typeof db.batch === "function") {
    const statements = splitSqlStatements(schemaSql).map((sql) => db.prepare(sql));
    if (statements.length) await db.batch(statements);
    return;
  }
  await db.exec(schemaSql);
}

export function withDatabaseEnv(env) {
  if (!env || env.BOARDVERSE_DB || !env.BOARDVERSE_DB_DO) return env;
  const db = durableDatabase(env.BOARDVERSE_DB_DO);
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === "BOARDVERSE_DB") return db;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      return prop === "BOARDVERSE_DB" || Reflect.has(target, prop);
    },
  });
}

export async function ensureDbSchema(db) {
  if (!db) return;
  const key = db[SCHEMA_CACHE_KEY] || db;
  if ((typeof key !== "object" || key === null) && typeof key !== "function") {
    await initializeSchema(db);
    return;
  }
  let ready = schemaReadyPromises.get(key);
  if (!ready) {
    ready = initializeSchema(db).catch((error) => {
      schemaReadyPromises.delete(key);
      throw error;
    });
    schemaReadyPromises.set(key, ready);
  }
  return ready;
}

export function requireDb(env) {
  const effective = withDatabaseEnv(env);
  if (!effective?.BOARDVERSE_DB) throw new HttpError(503, "database_unavailable", "BoardVerse 資料庫尚未可用。");
  return effective.BOARDVERSE_DB;
}

export async function first(db, sql, ...binds) {
  return db.prepare(sql).bind(...binds).first();
}

export async function all(db, sql, ...binds) {
  const result = await db.prepare(sql).bind(...binds).all();
  return result?.results || [];
}

export async function run(db, sql, ...binds) {
  return db.prepare(sql).bind(...binds).run();
}

export async function setting(db, key, fallback = null) {
  const row = await first(db, "SELECT value_json FROM system_settings WHERE key = ?", key);
  if (!row) return fallback;
  try { return JSON.parse(row.value_json); } catch { return fallback; }
}

export async function setSetting(db, key, value) {
  const now = Date.now();
  await run(db, `INSERT INTO system_settings(key,value_json,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`, key, JSON.stringify(value), now);
}

export async function audit(db, actionType, { adminActor = "admin", targetType = null, targetId = null, reason = null, before = null, after = null } = {}) {
  await run(db, `INSERT INTO audit_logs(id,admin_actor,action_type,target_type,target_id,reason,before_json,after_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`, crypto.randomUUID(), adminActor, actionType, targetType, targetId, reason, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), Date.now());
}
