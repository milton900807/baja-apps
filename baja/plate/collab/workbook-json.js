function () {

    // A REPEATED REFERENCE IS NOT A CYCLE.
    //
    // The workbook was serialized with a WeakSet of every object already visited, and
    // anything seen twice was written as '[a_c]'. That catches real loops, and it also
    // catches a perfectly ordinary thing: ONE object reachable by two paths. A graph that
    // holds the plate list at the top AND again under plateTrack serializes the second one
    // as a string, so plateTrack.root stops being an array -- and a workbook whose root,
    // m_plots and glyphs are all strings counts as EMPTY. The server's save guard then
    // refuses it ("this would replace test.bjb (2 tables, charts and notes) with an empty
    // workbook"), every twenty seconds, for a canvas that is plainly not empty. Without that
    // guard it would have written the empty one over the file.
    //
    // A CYCLE IS A VALUE THAT CONTAINS ITSELF, which means it is one of its own ANCESTORS,
    // not merely something seen before somewhere else in the tree. JSON.stringify calls the
    // replacer with `this` set to the object the value was read from, so the path from the
    // root to here can be kept exactly: unwind to `this`, and if the value is already on that
    // path it is a genuine loop. Anything else is written out, twice if it is reachable
    // twice, which is larger and correct rather than smaller and wrong.
    //
    // This also retires the special cases that were bolted on for arrays of points: they
    // existed only because the old guard was eating legitimate repeats, and a point is never
    // an ancestor of itself.

    // Handed back as a function rather than run once, because the save on the way out
    // happens inside a pagehide handler: there is no awaiting anything there, and a second
    // copy of this written out inline for that one caller is how the three serializers that
    // disagreed with each other came about in the first place.
    const write = (target, opts) => {
    const o = opts || {};
    const ancestors = [];
    const text = JSON.stringify(target, function (key, v) {
        if (key === 'canvas') return undefined;
        // The leading-underscore convention marks working state that must not be saved.
        if (key != null && ('' + key).toLowerCase().startsWith('_')) return null;
        if (typeof v !== 'object' || v === null) return v;
        while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
        if (ancestors.indexOf(v) >= 0) return '[a_c]';
        ancestors.push(v);
        return v;
    });

    // WHAT THE SERVER WILL COUNT, counted here first. The same arithmetic the save guard
    // uses, so a workbook that would be refused as empty is known to be empty before it is
    // sent rather than after. null means there is no plateTrack to judge, which the server
    // lets through untouched.
    const count = (text) => {
        try {
            const d = JSON.parse(text);
            if (!d || typeof d !== 'object') return null;
            const pt = d.plateTrack;
            if (!pt || typeof pt !== 'object') return null;
            const n = (a) => (Array.isArray(a) ? a.length : 0);
            return n(pt.root) + n(pt.m_plots) + n(pt.glyphs) + n(d.track);
        } catch (e) { return null; }
    };

    const items = count(text);

    // What is actually on the canvas right now, which is the thing the count is checked
    // against: a workbook that serializes to nothing while the track holds tables is a
    // serialization fault, not an empty document, and sending it would be the bug.
    let live = null;
    try {
        const pt = o.track || (target && target.plateTrack) || null;
        if (pt) {
            const n = (a) => (Array.isArray(a) ? a.length : 0);
            live = n(pt.root) + n(pt.m_plots) + n(pt.glyphs);
        }
    } catch (e) { live = null; }

    return { json: text, items: items, live: live, wouldBeRefused: (items === 0 && live > 0) };
    };

    return { write: write };
}
