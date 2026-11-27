// Keeps imported ROMs in this device's IndexedDB. Nothing is uploaded.
const DB = 'project-pet-roms';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('roms', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('roms', mode);
    const result = fn(t.objectStore('roms'));
    t.oncomplete = () => { db.close(); resolve(result.result ?? result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const saveRom = record => tx('readwrite', s => s.put(record));
export const loadRom = id => tx('readonly', s => s.get(id));
export const deleteRom = id => tx('readwrite', s => s.delete(id));
export async function listRoms() {
  const all = await tx('readonly', s => s.getAll());
  return all.map(({ id, code, title, sha1, known }) => ({ id, code, title, sha1, known }));
}
