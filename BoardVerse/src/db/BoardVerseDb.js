import { DurableObject } from "cloudflare:workers";

export class BoardVerseDb extends DurableObject {
  query(mode, sql, binds = []) {
    const values = Array.isArray(binds) ? binds : [];
    const cursor = this.ctx.storage.sql.exec(String(sql || ""), ...values);
    const rows = cursor.toArray();
    const meta = {
      changes: Number(cursor.rowsWritten || 0),
      rows_read: Number(cursor.rowsRead || 0),
      rows_written: Number(cursor.rowsWritten || 0),
    };
    if (mode === "first") return rows[0] || null;
    if (mode === "all") return { success: true, results: rows, meta };
    if (mode === "run") return { success: true, meta };
    if (mode === "exec") return { success: true, meta };
    throw new Error(`Unsupported database query mode: ${mode}`);
  }
}
