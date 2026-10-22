// scripts/fake-db.ts
// A tiny in-memory stand-in for the parts of the Supabase client the report code uses.
// Test helper only.

// ------------------------------------------------------------------ a tiny in-memory PostgREST look-alike
export type Row = Record<string, any>;
export class FakeDb {
  tables: Record<string, Row[]> = {};
  from(table: string) {
    this.tables[table] ??= [];
    return new Query(this.tables[table]);
  }
}
const asTime = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : v);
class Query {
  private mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: any;
  private conflict: string[] = [];
  private filters: Array<(r: Row) => boolean> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max = Infinity;
  constructor(private rows: Row[]) {}
  select(_cols?: string, _opts?: unknown) { return this; }
  insert(payload: Row | Row[]) { this.mode = 'insert'; this.payload = payload; return this; }
  upsert(payload: Row, opts: { onConflict: string }) { this.mode = 'upsert'; this.payload = payload; this.conflict = opts.onConflict.split(','); return this; }
  delete() { this.mode = 'delete'; return this; }
  update(payload: Row) { this.mode = 'update'; this.payload = payload; return this; }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  in(col: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  gte(col: string, val: unknown) { this.filters.push((r) => (asTime(r[col]) as any) >= (asTime(val) as any)); return this; }
  lt(col: string, val: unknown) { this.filters.push((r) => (asTime(r[col]) as any) < (asTime(val) as any)); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  private run() {
    if (this.mode === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = list.map((p) => ({ id: `row-${this.rows.length + 1}`, ...p }));
      inserted.forEach((row) => this.rows.push(row));
      return { data: inserted, error: null };
    }
    if (this.mode === 'upsert') {
      const existing = this.rows.find((r) => this.conflict.every((c) => r[c] === this.payload[c]));
      if (existing) Object.assign(existing, this.payload);
      else this.rows.push({ id: `row-${this.rows.length + 1}`, ...this.payload });
      return { data: null, error: null };
    }
    const matched = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'delete') {
      matched.forEach((r) => this.rows.splice(this.rows.indexOf(r), 1));
      return { data: matched, error: null };
    }
    if (this.mode === 'update') {
      matched.forEach((r) => Object.assign(r, this.payload));
      return { data: matched, error: null };
    }
    let out = [...matched];
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out.sort((a, b) => ((asTime(a[col]) as any) > (asTime(b[col]) as any) ? 1 : -1) * (asc ? 1 : -1));
    }
    return { data: out.slice(0, this.max), error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }); }
  single() { return this.maybeSingle(); }
  then(resolve: (v: any) => any, reject?: (e: any) => any) { return Promise.resolve(this.run()).then(resolve, reject); }
}