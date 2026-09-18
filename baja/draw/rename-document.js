function (platetrack) {

    // RENAME A DOCUMENT.
    //
    //   await exec('baja/draw/rename-document.js', platetrack)
    //
    // The name is the line above the rule on the card and the row in every list of what is
    // on the canvas, so it is worth being able to change without editing the text. A
    // document names itself from its first heading when it is made, which is right most of
    // the time and wrong when the heading is a sentence -- this is the way out of that.
    //
    // The text is left exactly as it is: the heading inside the document and the name on
    // its card are two different things, and rewriting the prose to match a new name would
    // be a change nobody asked for.
    return (async () => {
        const HM_ = await exec('baja/history/HM');
        await exec('baja/draw/pick-document.js', platetrack,
            { title: 'Rename a document', empty: 'There is no document on the canvas to rename' },
            async (doc) => {
                const taken = new Set((platetrack.root || [])
                    .filter(p => p && p !== doc && p.plateType === 'document')
                    .map(p => ('' + p.name).toLowerCase()));
                const name = await exec('baja/lib/prompt-name.js', {
                    title: 'Rename document',
                    message: 'This is the name on the card and in the lists; the text itself is not touched.',
                    label: 'Document name',
                    value: doc.name || '',
                    placeholder: 'e.g. Method',
                    confirmLabel: 'Rename',
                    validate: (v) => {
                        const t = ('' + v).trim();
                        if (!t) return 'A document needs a name.';
                        if (taken.has(t.toLowerCase())) return 'Another document on this canvas is already called that.';
                        return '';
                    },
                });
                if (!name || name === doc.name) return;
                const was = doc.name;
                // The canvas as it stands, so Ctrl+Z puts the old name back.
                try { pushHistory(HM_(platetrack)); } catch (e) { console.warn('[document] history', e); }
                doc.name = name;
                try { doc.setLastTouched(); } catch (e) { }
                try { platetrack.wb(null); } catch (e) { }
                try { platetrack.setMessage('“' + was + '” is now “' + name + '”', 1.1); } catch (e) { }
            });
        return null;
    })();
}
