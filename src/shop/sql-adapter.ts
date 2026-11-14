/**
 * Durable Object-এর SQLite (ctx.storage.sql) কে D1-এর মতো API দেয়
 * (prepare → bind → first/all/run, আর batch)।
 * ফলে দোকানের আগের সব কোড কোনো পরিবর্তন ছাড়াই প্রতিটা দোকানের নিজস্ব ডাটাবেসে চলে।
 */

type Row = Record<string, unknown>;

function norm(v: unknown): SqlStorageValue {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Uint8Array) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  return v as SqlStorageValue;
}

export class SqlStatement {
  constructor(
    private readonly sql: SqlStorage,
    readonly query: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): SqlStatement {
    return new SqlStatement(this.sql, this.query, params);
  }

  /** সরাসরি চালায় (transaction-এর ভিতর থেকেও) */
  runSync<T = Row>() {
    const cursor = this.sql.exec(this.query, ...this.params.map(norm));
    const results = cursor.toArray() as T[];
    const changes = /^\s*(insert|update|delete|replace)/i.test(this.query)
      ? Number((this.sql.exec("SELECT changes() AS c").one() as { c: number }).c)
      : 0;
    const lastId = changes ? Number((this.sql.exec("SELECT last_insert_rowid() AS id").one() as { id: number }).id) : 0;
    return {
      success: true as const,
      results,
      meta: { changes, last_row_id: lastId, rows_read: cursor.rowsRead, rows_written: cursor.rowsWritten, duration: 0 },
    };
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const r = this.runSync<Row>().results[0] ?? null;
    if (r && column) return (r[column] ?? null) as T;
    return r as T | null;
  }

  async all<T = Row>() {
    return this.runSync<T>();
  }

  async run<T = Row>() {
    return this.runSync<T>();
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    return this.runSync<Row>().results.map((r) => Object.values(r)) as T[];
  }
}

export class SqlDatabase {
  constructor(private readonly storage: DurableObjectStorage) {}

  prepare(query: string): SqlStatement {
    return new SqlStatement(this.storage.sql, query);
  }

  /** সব statement একসাথে — একটা ব্যর্থ হলে সবগুলো বাতিল (transaction) */
  async batch<T = Row>(statements: SqlStatement[]) {
    return this.storage.transactionSync(() => statements.map((s) => s.runSync<T>()));
  }

  /** একাধিক statement (bind ছাড়া), যেমন migration */
  async exec(query: string) {
    this.storage.sql.exec(query);
    return { count: 1, duration: 0 };
  }

  /** D1Database টাইপ হিসেবে ব্যবহার করার জন্য */
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
