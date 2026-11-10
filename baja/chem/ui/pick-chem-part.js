function () {
    // WHICH PART OF A DRAWN OLIGO IS UNDER THE CURSOR — one monomer, or the linkage between
    // two of them. Resolved against `oligo.__chemGeom`, the origin/pitch/radius the polymer
    // renderer (flexigraph/chem-draw.js) records each frame.
    //
    // Geometry rather than a rect per residue, because the renderer culls off-screen
    // residues: an array of rects would be missing entries exactly where the user has
    // scrolled to, and a lookup by index would return nothing for a bead that is plainly
    // visible. From x0 + pitch every index is arithmetic and no residue can go missing.
    //
    // Returns { kind: 'monomer' | 'linkage', i } — for a linkage, `i` is the residue BEFORE
    // it, matching how the renderer stores linkage on the 5' partner. Returns null when the
    // oligo is not drawn as molecules, or the cursor is not on it.
    return {
        pickChemPart: (oligo, sx, sy) => {
            try {
                const g = oligo && oligo.__chemGeom;
                if (!g || !g.editable || !(g.n > 0) || !(g.per > 0)) return null;

                // Vertical band: the beads plus a little slack, and more headroom above,
                // where the phosphate group and the base letter are drawn. A click on the
                // P of a linkage should pick that linkage, not miss the molecule entirely.
                const dy = sy - g.sy;
                if (dy > g.R + 6 || dy < -(g.R * 2.4 + 8)) return null;

                // SLOT -> MONOMER. chem-draw draws a compound in genomic order, so on a
                // mirrored (antisense) compound the leftmost bead is the LAST residue. The
                // slot is what was clicked; the index everything downstream wants is the
                // monomer, because __chemGeom.monos and the compound's own HELM are both in
                // the compound's order. A linkage spans two slots and is recorded on the 5'
                // partner, which after mirroring is the right-hand one of the pair.
                const __slotToMono = (kind, k) => !g.flipped ? k
                    : (kind === 'linkage' ? (g.n - 2 - k) : (g.n - 1 - k));
                const fx = (sx - g.x0) / g.per;
                if (fx < -0.5 || fx > g.n + 0.5) return null;
                let i = Math.floor(fx);
                if (i < 0) i = 0;
                if (i > g.n - 1) i = g.n - 1;

                // Inside the bead's own width -> the monomer. Between two beads -> the
                // linkage that occupies that gap. The bead half-width is used rather than
                // half the pitch so that at high zoom, where beads are small relative to
                // their spacing, the space between them belongs to the bond that is drawn
                // there -- which is what the user is aiming at when they click it.
                const cx = g.x0 + (i + 0.5) * g.per;
                if (Math.abs(sx - cx) <= g.R * 1.05) return { kind: 'monomer', i: __slotToMono('monomer', i) };

                const j = (sx > cx) ? i : i - 1;      // the 5' partner of the gap clicked in
                if (j < 0 || j >= g.n - 1) {
                    // Past the 5' or 3' end of the backbone there is no linkage; the nearest
                    // real thing is the terminal residue.
                    return { kind: 'monomer', i: __slotToMono('monomer', Math.max(0, Math.min(g.n - 1, i))) };
                }
                return { kind: 'linkage', i: __slotToMono('linkage', j) };
            } catch (e) { return null; }
        },

        // A short human name for what was clicked, for the in-place menu's title bar. The
        // title is the only confirmation the user gets that the click landed on the residue
        // they aimed at rather than its neighbour, so it names the position AND its current
        // chemistry rather than just "Residue 7".
        describeChemPart: (oligo, part) => {
            try {
                const g = oligo && oligo.__chemGeom;
                const monos = (g && g.monos) || [];
                const SUG = { d: 'DNA', dna: 'DNA', r: 'RNA', rna: 'RNA', moe: "2'-MOE", mo: "2'-MOE", m: "2'-OMe", ome: "2'-OMe", f: "2'-F", fana: "2'-F", fl2r: "2'-F", lna: 'LNA', bna: 'LNA', cet: 'cEt', ena: 'ENA', pmo: 'PMO' };
                const LNK = { sp: 'PS', ps: 'PS', rsp: 'PS (Rp)', ssp: 'PS (Sp)', p: 'PO', po: 'PO' };
                if (!part) return 'Compound';
                const m = monos[part.i] || {};
                if (part.kind === 'linkage') {
                    const nx = monos[part.i + 1] || {};
                    return 'Linkage ' + (part.i + 1) + '–' + (part.i + 2)
                        + '  ' + (LNK[m.linkage] || 'unspecified')
                        + '  (' + (m.base || '?') + '→' + (nx.base || '?') + ')';
                }
                return 'Residue ' + (part.i + 1) + (g && g.n ? ' of ' + g.n : '')
                    + '  ' + (m.base || '?') + '  ' + (SUG[m.sugar] || m.sugar || '');
            } catch (e) { return 'Compound'; }
        },

        // Why per-monomer editing is unavailable, in words a user can act on. Called when a
        // click did not resolve, so the feature never just fails to happen.
        chemPickHint: (oligo) => {
            const g = oligo && oligo.__chemGeom;
            if (!g) return 'This compound is not drawn as a molecule.';
            if (g.thin) return 'Zoom in — the chemistry is not drawn at this scale.';
            if (!g.editable) return 'Zoom in until the sugar rings are drawn to select individual parts.';
            return null;
        },
    };
}
