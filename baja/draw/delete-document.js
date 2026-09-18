function (platetrack) {

    // DELETE A DOCUMENT FROM THE CANVAS.
    //
    //   await exec('baja/draw/delete-document.js', platetrack)
    //
    // The document that is selected, or -- when nothing is selected -- the one chosen from
    // the picker (pick-document.js). There is a confirmation either way,
    // because a document is prose that was typed rather than derived, and nothing else on
    // the canvas can bring it back. The confirmation pushes the canvas onto the undo stack
    // before it removes anything, so Ctrl+Z still has the last word.
    return (async () => {
        // HM is a local of whichever app module happens to define it, not a global, so a
        // script that is exec'd on its own loads its own copy: a bare HM() was undefined
        // here and the snapshot never reached the undo stack.
        const HM_ = await exec('baja/history/HM');
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
        const ask = async (doc) => {
            const c = await exec('baja/lib/confirm.js',
                'Delete the document “' + doc.name + '”? Its text is not written anywhere else.',
                () => remove(doc), 'Delete');
            try { showModal(c); } catch (e) { }
            return doc;
        };

        await exec('baja/draw/pick-document.js', platetrack,
            { title: 'Delete a document', empty: 'There is no document on the canvas to delete' },
            (doc) => { ask(doc); });
        return null;
    })();
}
