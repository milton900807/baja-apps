function () {
    // Which LOH tract a variant lies in, and what kind of loss it is, for the editor.
    //   const loh = await exec('baja/manchester/menu/loh-label.js');  loh.at('chr16', 70000000) -> { word, text, ... } | null
    // The tracts come from the genome viewer's LOH scan (the hand-off carries them into
    // window.__bajaLohTracts); with no scan there is nothing to say and at() returns null.
    const T = (typeof window !== 'undefined' && Array.isArray(window.__bajaLohTracts)) ? window.__bajaLohTracts : [];
    const norm = (c) => ('' + c).replace(/^chr/i, '');
    return {
        count: T.length,
        at: (chr, pos) => {
            const c = norm(chr), p = +pos;
            if (!T.length || !c || !(p > 0)) return null;
            for (const t of T) {
                if (norm(t.chr) !== c || p < t.lo || p > t.hi) continue;
                const where = (t.band || t.chr) + (t.extent ? ' (' + t.extent + ')' : '');
                return { word: t.word, kind: t.kind, ratio: t.ratio, band: t.band, extent: t.extent,
                    text: t.word + (t.ratio != null ? ', depth ' + (+t.ratio).toFixed(2) + 'x' : '') + ', ' + where };
            }
            return null;
        }
    };
}
