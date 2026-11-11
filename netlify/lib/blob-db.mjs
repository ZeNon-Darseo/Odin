// Netlify Blobs adapter for the application database interface.
// Each table is a JSON document; every operation reads and writes one table.
// Suitable for a demo deployment: writes are last-write-wins across instances.
const CONSTRAINTS = {
  users: [['id'], ['email']],
  sessions: [['token_digest']],
  auth_limiter: [['key']],
  services: [['id']],
  bookings: [['id']],
  slot_holds: [['service_id', 'booking_date', 'slot']],
  comments: [['id']],
  gallery_items: [['id']],
  orders: [['id']],
};

const sameKey = (row, candidate, columns) => columns.every((column) => row[column] === candidate[column]);

class Builder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.op = null;
    this.returning = null;
    this.ordering = null;
    this.cap = null;
  }
  select(columns) {
    if (['insert', 'insertIfAbsent', 'update', 'delete'].includes(this.op)) this.returning = columns;
    else { this.op = 'select'; this.columns = columns; }
    return this;
  }
  eq(column, value) { this.filters.push([column, value]); return this; }
  order(column, { ascending = true } = {}) { this.ordering = { column, ascending }; return this; }
  limit(count) { this.cap = count; return this; }
  insert(row) { this.op = 'insert'; this.row = row; return this; }
  insertIfAbsent(row, { onConflict } = {}) { this.op = 'insertIfAbsent'; this.row = row; this.onConflict = onConflict; return this; }
  update(patch) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  then(resolve, reject) { return this.exec().then(resolve, reject); }

  matches(row) { return this.filters.every(([column, value]) => row[column] === value); }
  project(row) {
    if (!this.returning && this.op !== 'select') return { ...row };
    const columns = (this.returning || this.columns || '*').split(',').map((column) => column.trim());
    if (columns.includes('*')) return { ...row };
    const out = {};
    for (const column of columns) out[column] = row[column];
    return out;
  }
  conflicts(candidate, rows) {
    const keys = CONSTRAINTS[this.table] ?? [];
    return keys.some((columns) => rows.some((row) => sameKey(row, candidate, columns)));
  }

  async exec() {
    const rows = await this.db.read(this.table);
    if (this.op === 'select') {
      let found = rows.filter((row) => this.matches(row)).map((row) => ({ ...row }));
      if (this.ordering) {
        const { column, ascending } = this.ordering;
        found.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (this.cap != null) found = found.slice(0, this.cap);
      return { data: found.map((row) => this.project(row)), error: null };
    }
    if (this.op === 'insert' || this.op === 'insertIfAbsent') {
      if (this.conflicts(this.row, rows)) {
        if (this.op === 'insertIfAbsent') return { data: [], error: null };
        return { data: null, error: { code: 'unique_violation', status: 409 } };
      }
      rows.push({ ...this.row });
      await this.db.write(this.table, rows);
      return { data: this.returning ? [this.project(this.row)] : [], error: null };
    }
    if (this.op === 'update') {
      const affected = rows.filter((row) => this.matches(row));
      for (const row of affected) Object.assign(row, this.patch);
      await this.db.write(this.table, rows);
      return { data: this.returning ? affected.map((row) => this.project(row)) : [], error: null };
    }
    if (this.op === 'delete') {
      const affected = rows.filter((row) => this.matches(row));
      await this.db.write(this.table, rows.filter((row) => !this.matches(row)));
      return { data: this.returning ? affected.map((row) => this.project(row)) : [], error: null };
    }
    return { data: null, error: { code: 'unsupported_operation', status: 500 } };
  }
}

export function createBlobDb(store) {
  const key = (table) => `tables/${table}`;
  const db = {
    async read(table) {
      const raw = await store.get(key(table));
      if (raw == null) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async write(table, rows) {
      await store.set(key(table), JSON.stringify(rows));
    },
    from(table) {
      return new Builder(db, table);
    },
  };
  return db;
}

export async function ensureSeeded(store, loadSeed) {
  if (await store.get('meta/seeded')) return;
  const seed = await loadSeed();
  for (const [table, rows] of Object.entries(seed)) {
    if ((await store.get(`tables/${table}`)) == null) {
      await store.set(`tables/${table}`, JSON.stringify(rows));
    }
  }
  await store.set('meta/seeded', new Date().toISOString());
}
