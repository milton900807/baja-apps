function (opts) {

    // The monomer library, trimmed for prompting -- baja/chem/monomers.js filtered down to
    // the chemistries an oligo therapeutic actually gets built from, with the molfiles
    // stripped out.
    //   const mons = await exec('baja/chem/common-monomers.js');            // curated (default)
    //   const mons = await exec('baja/chem/common-monomers.js', { all: true });  // everything
    // Resolves { monomers: [ {symbol, name, polymerType, monomerType, naturalAnalog}, ... ] },
    // the same shape monomers.js's consumers already read.
    //
    // Why this exists: the full library is 552 monomers / ~1.5 MB, and 1.0 MB of that is
    // molfile structure blocks -- the atom/bond tables. Handing the whole thing to the
    // chemistry designer failed with the request being too long, and it was never useful
    // anyway: py/sequence/design-helm-chemistry.py reads only symbol/name/polymerType/
    // monomerType/naturalAnalog and then puts just the SYMBOLS in the prompt. Dropping
    // molfiles alone takes it to ~69 KB.
    //
    // Curating on top of that is the other half. 552 symbols is a lot of near-duplicates to
    // choose between ((5'R)-5'-methyl-alpha-L-LNA and 29 other LNA variants, and so on), and
    // a shorter, deliberately therapeutic list gets more idiomatic chemistry back. Everything
    // kept is named below, so what the designer may reach for is a decision in this file
    // rather than an accident of the library's size.

    return new Promise(async (resolve) => {

        // The workhorses, by exact symbol. Each verified present in the library.
        const CORE = [
            // sugars / backbones
            'd',        // deoxyribose
            'r',        // ribose
            'm',        // 2'-O-methyl
            'moe',      // 2'-O-methoxyethyl
            'fl2r',     // 2'-fluoro
            'lna',      // LNA (2',4'-BNA)
            'cet',      // (S)-cEt BNA
            'Rcet',     // (R)-cEt BNA
            'ana',      // ANA
            'fana',     // 2'-fluoroarabinose
            'tcdna',    // tricycloDNA
            // linkers
            'p',        // phosphate
            'sp',       // phosphorothioate
            'Rsp',      // (Rp)-phosphorothioate
            'Ssp',      // (Sp)-phosphorothioate
            'mp',       // methylphosphonate
            // bases
            'A', 'C', 'G', 'T', 'U'
        ];

        // Whole classes worth keeping wholesale rather than symbol by symbol.
        //   - every PEPTIDE monomer (the 20 residues and their variants) -- asked for, and
        //     they are what a peptide conjugate is written from
        //   - anything GalNAc, the standard hepatocyte-targeting conjugate, whose symbols
        //     (3GN3C10hp, THAGN3, hpC6GN3, ...) are not guessable from a naming rule
        const KEEP_POLYMER_TYPES = ['PEPTIDE'];
        const KEEP_PATTERNS = [/galnac/i, /\bGN3?\b/, /^3GN/, /^hpC6GN/, /^TrisGN/, /^TAHbuGN/, /^THAGN/];

        let raw = null;
        try { raw = await exec('baja/chem/monomers.js'); } catch (e) { raw = null; }
        // monomers.js returns a Monomers instance (.monomers), but has also been seen
        // handing back the bare array or a doubly-nested {monomers:{monomers:[]}} --
        // biopolymer.js unwraps all three the same way, so this does too.
        let list = [];
        try {
            const a = (raw && raw.monomers) ? raw.monomers : raw;
            list = Array.isArray(a) ? a : ((a && Array.isArray(a.monomers)) ? a.monomers : []);
        } catch (e) { list = []; }

        // Molfiles never go out of here: they are the bulk, and nothing downstream reads them.
        const slim = (m) => ({
            symbol: m.symbol,
            name: m.name,
            polymerType: m.polymerType,
            monomerType: m.monomerType,
            naturalAnalog: m.naturalAnalog
        });

        const all = list.filter((m) => m && m.symbol);
        if (opts && opts.all) { resolve({ monomers: all.map(slim) }); return; }

        const core = new Set(CORE);
        const wanted = all.filter((m) => {
            if (core.has(m.symbol)) return true;
            if (KEEP_POLYMER_TYPES.indexOf(m.polymerType) >= 0) return true;
            const hay = (m.symbol || '') + ' ' + (m.name || '');
            for (const re of KEEP_PATTERNS) { if (re.test(hay)) return true; }
            return false;
        });

        // If the library could not be read at all, say so with an empty list rather than
        // resolving something that looks like a successful tiny library.
        resolve({ monomers: wanted.map(slim), total: all.length, kept: wanted.length });
    });
}
