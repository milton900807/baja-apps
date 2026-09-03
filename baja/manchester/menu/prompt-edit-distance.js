function (graph, defaultEd) {

    // A quick center-menu choice of how many mismatches (edit distance, 0-3) a pasted
    // sequence's CLIENT-SIDE search is willing to tolerate -- asked once, right before that
    // search runs, instead of a fixed tolerance baked into the caller. "Client-side" means
    // py/bio/map/le-map-sequences.py, which compares the pasted sequence directly against
    // the tracks already on the canvas (brute-force, base by base). This does NOT apply to
    // the SERVER-side pre-mRNA reference search a miss can fall through to
    // (py/sequence/offtarget/find-gene-in-premrna.py, a different algorithm -- a 2-bit
    // seed-and-verify index over the whole genome) -- that one keeps its own tolerance.
    //   const ed = await exec('baja/manchester/menu/prompt-edit-distance.js', graph, 1);
    // Resolves the chosen number (0, 1, 2, or 3). If the menu can't be shown for some reason
    // (no graph, no showMenu), resolves `defaultEd` (or 1) rather than blocking the paste.

    return new Promise((resolve) => {
        const fallback = Number.isFinite(defaultEd) ? defaultEd : 1;
        const DESCRIPTIONS = {
            0: 'Exact match only',
            1: 'Allow 1 mismatch/gap',
            2: 'Allow 2 mismatches/gaps',
            3: 'Allow 3 mismatches/gaps (loosest)',
        };
        try {
            graph.showMenu([0, 1, 2, 3].map((n) => ({
                label: 'Edit distance ' + n + ' — ' + DESCRIPTIONS[n]
                    + (n === fallback ? '  (default)' : ''),
                move: () => { },
                click: () => resolve(n)
            })));
        } catch (e) {
            resolve(fallback);
        }
    });
}
