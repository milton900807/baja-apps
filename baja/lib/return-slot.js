function () {
    // WHAT A SCREEN KEEPS FOR THE ONE IT IS LEAVING, and for itself across a reload.
    //
    // The Genome Viewer and the oligo editor replace each other in place, so each keeps its
    // whole document for the way back (manchester/karyotype.js keepForReturn, the editor's
    // Genome Viewer button). Those slots lived on `window`, which a browser reload empties.
    // This is the same two slots in IndexedDB: 'karyo' (the viewer's stateDoc bundle) and
    // 'editor' (the serialized design), per origin, no practical size limit -- a
    // 900,000-variant karyotype is tens of megabytes and would never fit sessionStorage.
    //
    //   const slots = await exec('baja/lib/return-slot.js');
    //   await slots.put('editor', { json, name, at });
    //   const kept = await slots.get('editor');      // null when there is nothing
    //   await slots.del('editor');
    //
    // Every call swallows its own errors: a browser with storage blocked simply behaves as
    // before this existed, keeping only in memory. Nothing here decides WHEN to restore;
    // that is the screens' business.
    const DB = 'baja-return', STORE = 'slots';
    const open = () => new Promise((res, rej) => {
        try {
            const r = indexedDB.open(DB, 1);
            r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (e) { } };
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
            r.onblocked = () => rej(new Error('blocked'));
        } catch (e) { rej(e); }
    });
    const withStore = async (mode, fn) => {
        let db = null;
        try {
            db = await open();
            const out = await new Promise((res, rej) => {
                const tx = db.transaction(STORE, mode);
                let result = undefined;
                try { result = fn(tx.objectStore(STORE)); } catch (e) { rej(e); return; }
                tx.oncomplete = () => res((result && typeof result === 'object' && 'result' in result) ? result.result : undefined);
                tx.onerror = () => rej(tx.error);
                tx.onabort = () => rej(tx.error || new Error('aborted'));
            });
            return out;
        } catch (e) {
            return null;
        } finally {
            try { if (db) db.close(); } catch (e) { }
        }
    };
    return {
        get: async (key) => { const v = await withStore('readonly', (st) => st.get(key)); return (v == null) ? null : v; },
        put: async (key, value) => { await withStore('readwrite', (st) => st.put(value, key)); },
        del: async (key) => { await withStore('readwrite', (st) => st.delete(key)); },
    };
}
