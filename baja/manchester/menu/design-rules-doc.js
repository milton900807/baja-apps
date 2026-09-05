function (kind) {

    // The rules a DEFAULT design run will apply, as a document.
    //   const html = await exec('baja/manchester/menu/design-rules-doc.js', 'gapmer');
    //
    // Default mode takes every parameter out of the user's hands, which is the point of it --
    // and left them with no way to find out what it chose. The Advanced tab at least showed
    // the numbers; Default showed one field. So the rules are written out where the choice is
    // being made, rather than being discoverable only by reading the python afterwards.
    //
    // The numbers here are the scripts' own defaults and weights (py/ssaso/design.py,
    // design-steric-blocking.py, py/sirna/design.py). They have to be kept in step by hand,
    // so each block names its script: a claim in this file that the script no longer makes is
    // worse than no claim at all.

    const K = ('' + (kind || 'gapmer')).toLowerCase();

    const H = (t) => '<div style="font:700 11px Arial;letter-spacing:1.6px;text-transform:uppercase;'
        + 'color:#7f9bb8;margin:18px 0 8px;">' + t + '</div>';
    const P = (t) => '<div style="font:13px/1.65 Arial;color:#c3d2e2;margin:0 0 8px;">' + t + '</div>';
    const UL = (items) => '<ul style="margin:0 0 8px;padding-left:18px;font:13px/1.7 Arial;color:#c3d2e2;">'
        + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>';
    // A weight table reads better than a sentence per term: the point of it is the RELATIVE
    // sizes, and prose hides those.
    const TABLE = (rows) => '<table style="border-collapse:collapse;width:100%;margin:2px 0 10px;">'
        + rows.map(([a, b]) => '<tr>'
            + '<td style="padding:4px 8px 4px 0;font:13px Arial;color:#e8f0fb;'
            + 'border-bottom:1px solid rgba(255,255,255,0.07);">' + a + '</td>'
            + '<td style="padding:4px 0;font:13px Arial;color:#9fb3c8;text-align:right;white-space:nowrap;'
            + 'border-bottom:1px solid rgba(255,255,255,0.07);">' + b + '</td></tr>').join('')
        + '</table>';
    const NOTE = (t) => '<div style="font:12.5px/1.6 Arial;color:#9fb3c8;border-left:2px solid rgba(255,255,255,0.18);'
        + 'padding:2px 0 2px 12px;margin:10px 0 4px;">' + t + '</div>';

    const SHARED_SELECTION = H('How the winners are chosen')
        + P('Every candidate over the whole sequence is scored, then the list is walked from the '
            + 'top and a candidate is taken only if it does not overlap one already taken. '
            + 'Rank 1 is the best anywhere on the sequence; rank 2 is the best that is not the '
            + 'same site again.')
        + NOTE('Without that rule the top N is mostly one good site repeated at every length and '
            + 'offset. On a 3&nbsp;kb test sequence it was 49 distinct sites for 100 designs, '
            + '21 of them stacked on the single best one.');

    if (K.indexOf('gap') >= 0) {
        return H('What runs')
            + P('<b>py/ssaso/design.py</b> — an RNase&nbsp;H1 gapmer designer. It scans every start '
                + 'position on the sequence at each length and gap size, scores all of them, and '
                + 'returns the best non-overlapping sites.')
            + H('The candidate space')
            + UL([
                'Lengths <b>16, 17, 18, 19, 20</b> nt',
                'DNA gaps of <b>8, 9, 10</b> nt, centred, with the wings split as evenly as the length allows',
                'Wings <b>LNA</b>; gap left as DNA, which is what recruits RNase&nbsp;H1',
                'Backbone <b>phosphorothioate</b> throughout',
                'Output written as <b>DNA</b>'
            ])
            + P('On a 3&nbsp;kb transcript that is roughly 44,000 candidates, all of them scored.')
            + H('Sequence score, weighted to 1.00')
            + TABLE([
                ['Tm — flat 55–65&nbsp;°C, falling outside', '0.20'],
                ['GC — flat 40–60%, falling outside', '0.18'],
                ['Self-complementarity', '0.12'],
                ['Gap size — ideal 9&nbsp;nt', '0.08'],
                ['Homopolymer run', '0.08'],
                ['G-run', '0.08'],
                ['CpG motif', '0.06'],
                ['Wing balance', '0.05'],
                ['Palindrome', '0.05'],
                ['Simple repeat', '0.05'],
                ['Gap clear of cleavage motifs', '0.05']
            ])
            + P('A candidate whose DNA gap matches a configured endonuclease motif is <b>excluded '
                + 'outright</b>, not merely penalised.')
            + NOTE('The nucleobase-composition tolerability term — guanine for CNS, adenine for '
                + 'hepatic — is present in the scorer but <b>off</b> unless a tissue is named, '
                + 'and Default does not name one.')
            + H('Ties, and why they matter')
            + P('The GC and Tm terms are plateaus, so thousands of candidates score identically '
                + 'and the tie-break is what actually orders them. Ties go to <b>Tm nearest '
                + '60&nbsp;°C</b>, then <b>GC nearest 50%</b>, then the <b>longer</b> candidate.')
            + NOTE('Not highest Tm: highest Tm means most GC, so a run of ties would resolve '
                + 'toward whichever stretch of the transcript happens to be GC-richest.')
            + SHARED_SELECTION
            + H('Off-target screen')
            + P('The best sites — three times as many as requested — are searched against a cDNA '
                + 'index for the track’s species at <b>edit distance ≤ 2</b>. Burden counts '
                + '<b>distinct gene symbols</b>, weighted 40 / 8 / 0.35 by distance, and one gene '
                + 'at distance 0 is subtracted as the intended target.')
            + P('Final score = <b>0.80 × the sequence terms + 0.20 × off-target cleanliness</b>. '
                + 'With no index reachable, the run scores on the sequence terms alone and the '
                + 'report says so.');
    }

    if (K.indexOf('ster') >= 0 || K.indexOf('block') >= 0) {
        return H('What runs')
            + P('<b>py/ssaso/design-steric-blocking.py</b> — a fully modified single strand that '
                + 'occupies its site rather than triggering cleavage. No DNA gap, so no '
                + 'RNase&nbsp;H1 and no degradation of the transcript.')
            + H('The candidate space')
            + UL([
                'Lengths <b>18, 19, 20</b> nt',
                'Uniform <b>2′-MOE</b> across the whole strand',
                'Backbone <b>phosphorothioate</b>',
                'Output written as <b>DNA</b>'
            ])
            + H('Score, as points')
            + TABLE([
                ['GC — best at 50%, inside 40–60%', 'up to +20'],
                ['Tm — best at 65&nbsp;°C, inside 55–75&nbsp;°C', 'up to +18'],
                ['Fully modified architecture', 'bonus'],
                ['Overlaps a supplied annotation', 'bonus'],
                ['Palindrome / strong self-symmetry', '−10'],
                ['CpG motif', '−8'],
                ['Repetitive sequence', '−8'],
                ['Long G run', '−6 per base over 3'],
                ['Self-complementary stretch', '−3 per base over 5']
            ])
            + NOTE('With no annotations supplied the ranking is sequence-only, and the report says '
                + 'so rather than implying a site was chosen for what it sits on.')
            + H('Ties')
            + P('Ties go to <b>Tm nearest 65&nbsp;°C</b>, then <b>GC nearest 50%</b>, then the '
                + '<b>longer</b> candidate — 65 and 50 being this scorer’s own optima, so a '
                + 'tie is settled by the same criteria that produced it.')
            + SHARED_SELECTION
            + H('Off-target screen')
            + P('Searched at <b>edit distance ≤ 3</b>, not 2. At 18–20&nbsp;nt an ASO is '
                + 'essentially unique in the transcriptome below ED3 — a 20-mer hits a median of '
                + '0 genes at ED1 and 1 at ED2 — so an ED2 screen returns a burden of zero for '
                + 'nearly everything and cannot discriminate. Costs up to <b>−20 points</b>.');
    }

    return H('What runs')
        + P('<b>py/sirna/design.py</b> — an siRNA duplex designer. It slides across the whole '
            + 'sequence, scores every candidate window, and ranks them.')
        + H('The candidate space')
        + UL([
            'Duplex cores of <b>21, 22, 23</b> nt',
            'Sense 3′ overhang <b>dTdT</b>; antisense overhang none',
            'Overhangs are attached <b>after</b> ranking and are excluded from scoring',
            'Output written as <b>DNA</b>'
        ])
        + H('Ranking rules')
        + UL([
            'Prefer <b>30–50% GC</b>',
            'Prefer <b>A or U at antisense position 1</b> — the guide’s 5′ end',
            'Prefer <b>G or C at sense position 1</b>',
            'Prefer an <b>AU-rich antisense seed</b> across positions 2–8',
            'Penalise homopolymer runs and repeats',
            'Score duplex-end asymmetry (ΔΔG), which is what decides which strand loads'
        ])
        + NOTE('The first three rules are all about strand selection: an siRNA whose passenger '
            + 'strand loads is an off-target reagent, so thermodynamic asymmetry is weighted as '
            + 'heavily as the sequence itself.')
        + P('The guide is always the <b>reverse complement of the target</b>. The track sequence '
            + 'is read as sense mRNA regardless of which genomic strand the gene sits on.');
}
