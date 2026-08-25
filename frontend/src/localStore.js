// 極簡 localStorage「資料表」：每個 key 存一個物件陣列，id 自動遞增。

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? [];
  } catch {
    return [];
  }
}

function write(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function nextId(rows) {
  return rows.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;
}

export const store = {
  list(key) {
    return read(key);
  },
  insert(key, obj) {
    const rows = read(key);
    const row = { ...obj, id: nextId(rows) };
    rows.push(row);
    write(key, rows);
    return row;
  },
  update(key, id, patch) {
    const rows = read(key);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch };
    write(key, rows);
    return rows[idx];
  },
  remove(key, id) {
    write(
      key,
      read(key).filter((r) => r.id !== id)
    );
  },
  removeWhere(key, predicate) {
    write(key, read(key).filter((r) => !predicate(r)));
  },
  updateWhere(key, predicate, patch) {
    write(
      key,
      read(key).map((r) => (predicate(r) ? { ...r, ...patch } : r))
    );
  },
};

export const KEYS = {
  events: "dispatch.local.events",
  categories: "dispatch.local.categories",
  subtasks: "dispatch.local.subtasks",
  transactions: "dispatch.local.transactions",
  ledgerCats: "dispatch.local.ledgerCats",
  members: "dispatch.local.members",
  splitbills: "dispatch.local.splitbills",
};
