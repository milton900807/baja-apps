function (platetrack) {

    // DELETE A DOCUMENT FROM THE CANVAS.
    //
    //   await exec('baja/draw/delete-document.js', platetrack)
    //
    // The document that is selected, or -- when nothing is selected -- the one chosen from
    // a list of the documents on the canvas, each shown with its opening words so the right
    // one is picked without having to find it first. There is a confirmation either way,
    // because a document is prose that was typed rather than derived, and nothing else on
    // the canvas can bring it back. The confirmation pushes the canvas onto the undo stack
    // before it removes anything, so Ctrl+Z still has the last word.
    return (async () => {
        // HM is a local of whichever app module happens to define it, not a global, so a
        // script that is exec'd on its own loads its own copy: a bare HM() was undefined
        // here and the snapshot never reached the undo stack.
        const HM_ = await exec('baja/history/HM');
        const docs = (platetrack.root || []).filter(p => p && p.plateType === 'document');
        if (!docs.length) {
            try { platetrack.setMessage('There is no document on the canvas to delete', 1); } catch (e) { }
            return null;
        }

        // The first words of the text, as a reminder of which document this is.
        const opening = (d) => {
            const s = ('' + (d.source || d.html || ''))
                .replace(/<[^>]*>/g, ' ').replace(/^#{1,3}\s+[^\n]*/m, ' ')
                .replace(/[#*`_>|-]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!s) return 'empty';
            return s.length > 90 ? s.slice(0, 90).replace(/\s+\S*$/, '') + '…' : s;
        };

        const remove = (doc) => {
            const name = doc.name;
            // The canvas as it stands, before anything is taken out of it. A snapshot of the
            // document alone would not do: undo restores an object it can still find, and a
            // deleted one is not there to be found. HM(platetrack) carries the whole root,
            // which handleUndo feeds to updatePlateTracks.
            try { pushHistory(HM_(platetrack)); } catch (e) { console.warn('[document] history', e); }
            try { platetrack.removePlate(doc); } catch (e) { console.warn('[document] delete', e); }
            try { platetrack.wb(null); } catch (e) { }
            try { platetrack.setMessage('Deleted “' + name + '” (Ctrl+Z undoes it)', 1.1); } catch (e) { }
        };
        // confirm.js snapshots the canvas onto the undo stack before it runs this.
        const ask = async (doc) => {
            const c = await exec('baja/lib/confirm.js',
                'Delete the document “' + doc.name + '”? Its text is not written anywhere else.',
                () => remove(doc), 'Delete');
            try { showModal(c); } catch (e) { }
            return doc;
        };

        const selected = docs.find(d => d.selected);
        if (selected) return await ask(selected);
        if (docs.length === 1) return await ask(docs[0]);

        // Nothing selected and several to choose from: name them, with their opening words.
        // The picker reports the choice through onPick and closes itself, so there is
        // nothing to wait for here -- the confirmation follows from the pick.
        await exec('baja/lib/pick-list.js', {
            title: 'Delete a document',
            subtitle: docs.length + ' documents on the canvas',
            items: docs.map(d => ({ label: d.name, sub: opening(d), ref: d })),
            onPick: (item) => { ask(item.ref); },
        });
        return null;
    })();
}
