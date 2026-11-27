function () {

    // A SMALL, NAMED CATALOGUE OF RNA SEQUENCE ELEMENTS, as patterns.
    //   const CAT = await exec('baja/bio/rna/nucleotide-motif-catalog.js');
    //   CAT.scan('ACGT...')            // [{motif, site, start, end, match, blurb}]  1-based
    //
    // WHAT THIS IS. The textbook consensus sequences for a handful of post-transcriptional
    // elements, written as regular expressions over the MESSAGE (U written as T). It is
    // the nucleotide counterpart of the ELM catalogue the protein side uses, and it is
    // deliberately SHORT: every pattern here is one somebody can name, and anything whose
    // consensus is really a weight matrix or a structure (an IRE, an SR-protein enhancer)
    // is left out rather than written as a regex that would match constantly and mean
    // nothing.
    //
    // WHAT IT IS NOT. A match is a PATTERN MATCH, not a site: ATTTA occurs by chance every
    // few hundred bases, and a real AU-rich element is a cluster in a 3' UTR with the
    // right context around it. Nothing here is scored, because there is no model behind it
    // to score with, and an invented number would be read as evidence. So the honest use
    // is the DIFFERENCE a variant makes -- a pattern that appears or disappears -- rather
    // than the bare list, and every caller is expected to say so.
    //
    // NOT EXHAUSTIVE, and the absence of a match means only that these fourteen patterns
    // did not match.

    const M = [
        { motif: 'PAS_AAUAAA', site: 'Polyadenylation signal', rx: 'AATAAA',
          blurb: 'The canonical polyadenylation signal, usually 10 to 30 nt upstream of the '
              + 'cleavage site. The strongest and commonest of the hexamers.' },
        { motif: 'PAS_AUUAAA', site: 'Polyadenylation signal', rx: 'ATTAAA',
          blurb: 'The commonest variant polyadenylation hexamer, generally weaker than '
              + 'AAUAAA.' },
        { motif: 'ARE_pentamer', site: 'AU-rich element', rx: 'ATTTA',
          blurb: 'The AUUUA pentamer at the core of AU-rich elements, which recruit decay '
              + 'and stability factors in 3’ UTRs. One pentamer on its own is weak '
              + 'evidence: real elements are clusters.' },
        { motif: 'ARE_nonamer', site: 'AU-rich element', rx: 'TATTTATT',
          blurb: 'The class II AU-rich element nonamer UAUUUAUU, the form bound by ELAVL1 '
              + '(HuR) and by the decay-promoting factors.' },
        { motif: 'GRE_CELF', site: 'GU-rich element', rx: 'GTTTG[ACGT]{0,3}GTTTG',
          blurb: 'A GU-rich element, the CELF1 (CUGBP1) binding form, associated with rapid '
              + 'decay.' },
        { motif: 'CPE_UUUUAU', site: 'Cytoplasmic polyadenylation element', rx: 'TTTTAT',
          blurb: 'The CPEB binding element that drives cytoplasmic polyadenylation and '
              + 'translational activation, read together with a nearby polyadenylation '
              + 'signal.' },
        { motif: 'CPE_UUUUAAU', site: 'Cytoplasmic polyadenylation element', rx: 'TTTTAAT',
          blurb: 'The longer CPE variant, same function as UUUUAU.' },
        { motif: 'PUM_PRE', site: 'Pumilio response element', rx: 'TGTA[ACGT]ATA',
          blurb: 'The Pumilio (PUM1 and PUM2) response element UGUANAUA, which represses '
              + 'and destabilizes the message it sits in.' },
        { motif: 'MBE_Musashi', site: 'Musashi binding element', rx: '[GA]T{1,3}AGT',
          blurb: 'The Musashi binding element, a translational repressor site in 3’ UTRs.' },
        { motif: 'U_rich_HuR', site: 'U-rich stretch', rx: 'T{7,}',
          blurb: 'An uninterrupted U-rich stretch, the simplest form of ELAVL1 (HuR) and '
              + 'polypyrimidine-tract binding.' },
        { motif: 'm6A_DRACH', site: 'm6A methylation consensus', rx: '[AGT][AG]AC[ACT]',
          blurb: 'The DRACH consensus around an m6A site. Extremely common by chance: it '
              + 'means only that the adenosine sits in a methylatable context, not that it '
              + 'is methylated.' },
        { motif: 'SS_DONOR_U1', site: '5’ splice site', rx: 'GT[AG]AGT',
          blurb: 'The U1 snRNP consensus at a donor site. A new one inside an exon is how a '
              + 'variant creates a cryptic splice donor; BajaSplice scores whether it is '
              + 'actually used, which this does not.' },
        { motif: 'SS_BRANCH', site: 'Branch point', rx: 'CT[GA]A[CT]',
          blurb: 'The branch point consensus CURAY, 20 to 50 nt upstream of a 3’ splice '
              + 'site.' },
        { motif: 'KOZAK', site: 'Translation initiation context', rx: '[AG][ACGT]{2}ATGG',
          blurb: 'A strong Kozak context: a purine at −3 and a G at +4 around an AUG. '
              + 'A gained one inside a 5’ UTR is an upstream start codon.' }
    ];

    const compiled = M.map((m) => Object.assign({}, m, {
        // (?=(...)) so overlapping instances are all found. Sequence elements overlap.
        re: new RegExp('(?=(' + m.rx + '))', 'g')
    }));

    const clean = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');

    // Every instance, 1-based and inclusive, in the order they occur.
    const scan = (seq) => {
        const s = clean(seq);
        const out = [];
        for (const m of compiled) {
            m.re.lastIndex = 0;
            let hit;
            while ((hit = m.re.exec(s)) !== null) {
                const text = hit[1];
                const start = hit.index + 1;
                out.push({ motif: m.motif, site: m.site, start: start,
                    end: start + text.length - 1, match: text, blurb: m.blurb });
                if (m.re.lastIndex <= hit.index) m.re.lastIndex = hit.index + 1;
            }
        }
        out.sort((a, b) => (a.start - b.start) || (a.end - b.end)
            || (a.motif < b.motif ? -1 : (a.motif > b.motif ? 1 : 0)));
        return out;
    };

    return { list: M, scan: scan, clean: clean, size: M.length };
}
