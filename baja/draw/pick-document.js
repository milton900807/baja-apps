function (platetrack, opts, onPick) {

    // WHICH DOCUMENT? -- shared by the Draw menu's document commands.
    //
    //   await exec('baja/draw/pick-document.js', platetrack,
    //              { title: 'Delete a document', empty: 'There is no document to delete' },
    //              (doc) => { ... })
    //
    // The one that is selected; failing that, the only one there is; failing that, the one
    // chosen from a list that shows each document's opening words, because two cards both
    // called "Method" are told apart by what they say, not by their names.
    //
    // The choice is reported through the callback rather than returned, because the picker
    // can also be closed without choosing -- a promise would simply never settle, and the
    // command that was waiting on it would hang.
    return (async () => {
        const o = opts || {};
        const cb = (typeof onPick === 'function') ? onPick : (() => { });
        const docs = (platetrack.root || []).filter(p => p && p.plateType === 'document');
        if (!docs.length) {
            try { platetrack.setMessage(o.empty || 'There is no document on the canvas', 1); } catch (e) { }
            return null;
        }

        // The first words of the text, as a reminder of which document this is. The heading
        // is dropped: it is usually the name, which is already in the row beside this.
        const opening = (d) => {
            const s = ('' + (d.source || d.html || ''))
                .replace(/<[^>]*>/g, ' ').replace(/^#{1,3}\s+[^\n]*/m, ' ')
                .replace(/[#*`_>|-]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!s) return 'empty';
            return s.length > 90 ? s.slice(0, 90).replace(/\s+\S*$/, '') + '…' : s;
        };

        const selected = docs.find(d => d.selected);
        if (selected) { cb(selected); return selected; }
        if (docs.length === 1) { cb(docs[0]); return docs[0]; }

        await exec('baja/lib/pick-list.js', {
            title: o.title || 'Choose a document',
            subtitle: docs.length + ' documents on the canvas',
            items: docs.map(d => ({ label: d.name, sub: opening(d), ref: d })),
            onPick: (item) => { cb(item.ref); },
        });
        return null;
    })();
}
