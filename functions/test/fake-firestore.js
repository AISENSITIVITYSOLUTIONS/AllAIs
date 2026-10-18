// Firestore de mentiras para las pruebas: guarda los documentos en memoria y
// reproduce lo que importa del original.
//
// Lo esencial es la transacción: cada documento lleva un número de versión y, al
// confirmar, se comprueba que ninguno de los leídos haya cambiado. Si cambió, la
// transacción se reintenta desde cero, igual que hace Firestore. Eso permite
// probar de verdad las solicitudes simultáneas en lugar de suponer que funcionan.

class FakeSnapshot {
  constructor(id, record) {
    this.id = id;
    this.exists = Boolean(record);
    this._data = record ? { ...record.data } : null;
  }
  data() {
    return this._data ? { ...this._data } : undefined;
  }
  get(field) {
    return this._data ? this._data[field] : undefined;
  }
}

class FakeDocRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this.id = path.split("/").pop();
  }
  async get() {
    this.store.reads += 1;
    return new FakeSnapshot(this.id, this.store.docs.get(this.path));
  }
  async set(data, options = {}) {
    this.store.write(this.path, data, Boolean(options.merge));
  }
  async update(data) {
    const record = this.store.docs.get(this.path);
    if (!record) throw new Error(`NOT_FOUND: ${this.path}`);
    const next = { ...record.data };
    for (const [key, value] of Object.entries(data)) {
      next[key] = value && value.__increment !== undefined
        ? Number(next[key] || 0) + value.__increment
        : value;
    }
    this.store.write(this.path, next, false);
  }
}

class FakeCollection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
  }
  doc(id) {
    return new FakeDocRef(this.store, `${this.name}/${id}`);
  }
}

class FakeFirestore {
  constructor() {
    this.docs = new Map();
    this.reads = 0;
    this.transactionAttempts = 0;
    // Gancho para forzar una carrera: se llama justo después de las lecturas de
    // la transacción y antes de confirmarla.
    this.onTransactionRead = null;
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  write(path, data, merge) {
    const previous = this.docs.get(path);
    const base = merge && previous ? previous.data : {};
    const clean = {};
    for (const [key, value] of Object.entries({ ...base, ...data })) {
      clean[key] = value && value.__increment !== undefined
        ? Number(base[key] || 0) + value.__increment
        : value;
    }
    this.docs.set(path, { data: clean, version: (previous?.version || 0) + 1 });
  }

  // Siembra directa, sin contar como escritura de la prueba.
  seed(path, data) {
    this.docs.set(path, { data, version: 1 });
  }

  count(path) {
    return Number(this.docs.get(path)?.data?.count || 0);
  }

  async runTransaction(fn, { maxAttempts = 12 } = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.transactionAttempts += 1;
      const seen = new Map();
      const pending = [];

      const transaction = {
        get: async (ref) => {
          const record = this.docs.get(ref.path);
          seen.set(ref.path, record?.version || 0);
          this.reads += 1;
          return new FakeSnapshot(ref.id, record);
        },
        set: (ref, data, options = {}) => {
          pending.push({ ref, data, merge: Boolean(options.merge) });
        },
        update: (ref, data) => {
          pending.push({ ref, data, merge: true });
        }
      };

      const result = await fn(transaction);

      if (this.onTransactionRead) {
        const hook = this.onTransactionRead;
        this.onTransactionRead = null;
        await hook();
      }

      // Confirmación: si algo que leímos cambió, se reintenta todo.
      const stale = [...seen.entries()].some(
        ([path, version]) => (this.docs.get(path)?.version || 0) !== version
      );
      if (stale) continue;

      for (const op of pending) this.write(op.ref.path, op.data, op.merge);
      return result;
    }
    throw new Error("ABORTED: too much contention");
  }
}

module.exports = { FakeFirestore, increment: (n) => ({ __increment: n }) };
