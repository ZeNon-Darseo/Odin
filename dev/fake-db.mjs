// Credential-free in-memory stand-in for the platform database adapter.
// Local tests only — never packaged with the Function.
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
    if (this.op === 'insert' || this.op === 'insertIfAbsent' || this.op === 'update' || this.op === 'delete') this.returning = columns;
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
  conflicts(candidate) {
    const keys = CONSTRAINTS[this.table] ?? [];
    const rows = this.db.tables.get(this.table) ?? [];
    return keys.some((columns) => rows.some((row) => sameKey(row, candidate, columns)));
  }

  async exec() {
    const rows = this.db.tables.get(this.table) ?? [];
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
      if (this.conflicts(this.row)) {
        if (this.op === 'insertIfAbsent') return { data: [], error: null };
        return { data: null, error: { code: 'unique_violation', status: 409 } };
      }
      rows.push({ ...this.row });
      this.db.tables.set(this.table, rows);
      return { data: this.returning ? [this.project(this.row)] : [], error: null };
    }
    if (this.op === 'update') {
      const affected = rows.filter((row) => this.matches(row));
      for (const row of affected) Object.assign(row, this.patch);
      return { data: this.returning ? affected.map((row) => this.project(row)) : [], error: null };
    }
    if (this.op === 'delete') {
      const affected = rows.filter((row) => this.matches(row));
      this.db.tables.set(this.table, rows.filter((row) => !this.matches(row)));
      return { data: this.returning ? affected.map((row) => this.project(row)) : [], error: null };
    }
    return { data: null, error: { code: 'unsupported_operation', status: 500 } };
  }
}

export function createFakeDb(initial = {}) {
  const db = {
    tables: new Map(Object.entries(initial).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])),
    from(table) {
      if (!db.tables.has(table)) db.tables.set(table, []);
      return new Builder(db, table);
    },
  };
  return db;
}