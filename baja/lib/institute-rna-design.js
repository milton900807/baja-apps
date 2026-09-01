function (graph, genegraph_panel_layout) {

    // Institute for RNA Therapeutics Design — a reading room, in three centres.
    //   exec('baja/lib/institute-rna-design.js', graph, genegraph_panel_layout)
    //
    // A map of the design space rather than a tool: what each modality does, what it is for,
    // and which targeting strategies cut across all of them. Every entry is marked COMING SOON
    // because none of it is wired to a designer yet — saying so on each card is the honest way
    // to publish a roadmap, since a page of capabilities with no such mark reads as a feature
    // list rather than an intention.
    //
    // Three centres, matching how the field actually divides:
    //   1. RNA as the TARGET   — the oligo or molecule acts on a transcript that already exists
    //   2. RNA as the MEDICINE — the RNA is itself the therapeutic payload
    //   3. Cross-modality strategies — design choices that apply across both

    return (async () => {
        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // [name, mechanism/function, objective/application]
        const TARGETING = [
            ['RNase H1 gapmer ASO', 'DNA-like central gap recruits RNase H1 to cleave the RNA', 'Reduce a toxic, overexpressed, mutant, or gain-of-function transcript'],
            ['Steric-blocking ASO', 'Occupies an RNA site without degrading the transcript', 'Alter splicing, translation, RNA processing, localization, or protein binding'],
            ['Exon-skipping ASO', 'Blocks a splice site or enhancer to remove an exon', 'Restore a reading frame or eliminate a pathogenic exon'],
            ['Exon-inclusion ASO', 'Blocks a splice silencer or repressor site', 'Restore inclusion of a therapeutically important exon'],
            ['Cryptic-exon suppression ASO', 'Blocks a cryptic splice site or regulatory element', 'Restore normal RNA processing, such as in TDP-43 loss-of-function disease'],
            ['Allele-specific ASO', 'Targets a mutation, SNP, repeat, or mutant-specific splice junction', 'Selectively suppress mutant RNA while preserving wild-type RNA'],
            ['Translation-blocking ASO', 'Blocks the start codon, ribosome-binding region, or UTR element', 'Reduce protein production without destroying the RNA'],
            ['RNA-processing ASO', 'Blocks polyadenylation, cleavage, RNA modification, or localization signals', 'Redirect transcript maturation or cellular distribution'],
            ['siRNA', 'Duplex guide loads into AGO2/RISC and cleaves complementary RNA', 'Potent cytoplasmic transcript knockdown'],
            ['shRNA', 'Vector-expressed hairpin is processed into an siRNA-like guide', 'Sustained RNA interference'],
            ['Artificial miRNA', 'Engineered guide expressed within a miRNA scaffold', 'Vector-based knockdown with endogenous miRNA processing'],
            ['miRNA inhibitor', 'Antagomir, LNA, or similar oligo sequesters a miRNA', 'Restore expression of genes repressed by the miRNA'],
            ['miRNA mimic', 'Synthetic duplex restores or increases miRNA activity', 'Simultaneously suppress a network of target transcripts'],
            ['CRISPR–Cas13', 'Guide RNA directs Cas13 to bind or cleave RNA', 'Programmable RNA knockdown without changing DNA'],
            ['ADAR-guided RNA editing', 'Guide recruits endogenous or engineered ADAR', 'Correct specific bases, principally A-to-I, interpreted as A-to-G'],
            ['Cas13 RNA base editor', 'Catalytically inactive Cas13 positions an editing enzyme', 'Programmable A-to-I or engineered C-to-U editing'],
            ['RNA trans-splicing', 'Replaces part of a transcript through spliceosome- or ribozyme-mediated trans-splicing', 'Repair a mutation or replace a large RNA segment'],
            ['Ribozyme', 'Catalytic RNA recognizes and cleaves or repairs another RNA', 'Sequence-specific RNA cleavage or trans-splicing'],
            ['DNAzyme', 'Catalytic DNA binds and cleaves a complementary RNA', 'Direct RNA degradation without RNase H or RISC'],
            ['RNA-targeting small molecule', 'Small molecule binds a structured RNA pocket', 'Alter splicing, translation, stability, or RNA–protein interactions'],
            ['RIBOTAC', 'Bifunctional molecule binds an RNA and recruits an endogenous ribonuclease', 'Proximity-induced degradation of a selected RNA'],
            ['RNA decoy or sponge', 'Engineered RNA sequesters an RNA-binding protein or miRNA', 'Neutralize a pathogenic regulatory interaction'],
            ['RNA-targeting aptamer', 'Structured oligonucleotide binds a selected RNA structure', 'Block RNA function or recruit another therapeutic activity']
        ];

        const MEDICINE = [
            ['Linear mRNA', 'Transient protein expression', 'Protein replacement, vaccines, antibodies, transcription factors, or genome editors'],
            ['Modified mRNA', 'Chemically modified mRNA with reduced innate immune sensing', 'Improved expression, stability, and tolerability'],
            ['Self-amplifying RNA', 'Encodes an RNA replicase that amplifies the payload', 'Lower-dose vaccines or prolonged protein expression'],
            ['Trans-amplifying RNA', 'Separates replicase and payload into different RNAs', 'Modular amplification with potentially improved control'],
            ['Circular RNA', 'Covalently closed RNA resistant to exonucleases', 'Longer-duration protein production'],
            ['Suppressor tRNA', 'Recognizes a premature stop codon and inserts an amino acid', 'Nonsense-mutation suppression'],
            ['Engineered tRNA', 'Alters decoding, amino-acid incorporation, or translation', 'Codon correction and programmable protein synthesis'],
            ['RNA aptamer', 'Folded RNA binds a protein or small molecule', 'Receptor agonism/antagonism, inhibition, targeting, or delivery'],
            ['Guide RNA', 'Directs a DNA- or RNA-editing enzyme to its target', 'CRISPR genome editing, RNA editing, or epigenetic regulation'],
            ['RNA vaccine', 'Encodes an antigen', 'Infectious-disease or cancer vaccination'],
            ['Replicon RNA', 'Self-replicating RNA expression system', 'Vaccines and sustained therapeutic-protein expression']
        ];

        const STRATEGIES = [
            ['Gene-specific targeting'],
            ['Transcript- or isoform-specific targeting'],
            ['Exon- or splice-junction targeting'],
            ['Allele-specific or mutation-specific targeting'],
            ['Repeat-expansion targeting'],
            ['Fusion-transcript targeting'],
            ['RNA-structure targeting'],
            ['RNA–protein-interaction targeting'],
            ['RNA-modification-site targeting'],
            ['Cell- or tissue-specific targeting'],
            ['Inducible or conditionally active targeting'],
            ['Multiplex targeting of several transcripts'],
            ['Pan-variant targeting of a shared sequence'],
            ['Personalized or n-of-1 variant targeting']
        ];

        const SOON = '<span style="flex:0 0 auto;background:#f1e2c4;color:#7a5a1e;border:1px solid #e0cba0;'
            + 'border-radius:999px;padding:2px 9px;font:700 10px Arial;letter-spacing:0.8px;">COMING SOON</span>';

        const card = (name, a, b, labelA, labelB) => ''
            + '<article style="break-inside:avoid;border:1px solid #d9d3c7;border-left:3px solid #14705c;'
            + 'background:#fffefb;padding:14px 16px;margin:0 0 12px;">'
            + '<div style="display:flex;align-items:center;gap:10px;">'
            + '<span style="flex:1 1 auto;font:700 16px Georgia,\'Times New Roman\',serif;color:#14211f;">' + esc(name) + '</span>'
            + SOON + '</div>'
            + (a ? ('<div style="margin-top:9px;font:13px/1.55 Arial;color:#2f3a38;">'
                + '<span style="font:700 10.5px Arial;letter-spacing:1.2px;text-transform:uppercase;color:#14705c;">' + labelA + '</span><br>' + esc(a) + '</div>') : '')
            + (b ? ('<div style="margin-top:7px;font:13px/1.55 Arial;color:#2f3a38;">'
                + '<span style="font:700 10.5px Arial;letter-spacing:1.2px;text-transform:uppercase;color:#14705c;">' + labelB + '</span><br>' + esc(b) + '</div>') : '')
            + '</article>';

        const centre = (n, title, sub, inner) => ''
            + '<section style="margin:0 0 30px;">'
            + '<div style="display:flex;align-items:baseline;gap:12px;border-bottom:2px solid #14705c;padding-bottom:7px;margin-bottom:14px;">'
            + '<span style="font:700 11px Arial;letter-spacing:2px;color:#14705c;">CENTRE ' + n + '</span>'
            + '<span style="font:700 21px Georgia,serif;color:#14211f;">' + esc(title) + '</span></div>'
            + '<p style="max-width:76ch;font:14px/1.6 Georgia,serif;color:#4a534f;margin:0 0 14px;">' + esc(sub) + '</p>'
            + inner + '</section>';

        try {
            const ID = 'baja-institute-rna-design';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(8,20,16,0.74);'
                + 'display:flex;align-items:stretch;justify-content:center;padding:22px;font-family:Arial,Helvetica,sans-serif;';

            const pane = document.createElement('div');
            pane.style.cssText = 'width:100%;max-width:1040px;height:100%;display:flex;flex-direction:column;'
                + 'background:#f6f4ef;color:#14211f;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:flex-end;gap:16px;padding:20px 26px 16px;'
                + 'background:#14705c;color:#fff;';
            head.innerHTML = '<div style="min-width:0;">'
                + '<div style="font:700 26px Georgia,\'Times New Roman\',serif;">Institute for RNA Therapeutics Design</div>'
                + '<div style="font:12.5px Arial;opacity:0.92;margin-top:4px;">Three centres · '
                + (TARGETING.length + MEDICINE.length + STRATEGIES.length) + ' entries · every one in preparation</div></div>';
            const x = document.createElement('button');
            x.textContent = '✕ Close';
            x.style.cssText = 'margin-left:auto;flex:0 0 auto;cursor:pointer;border-radius:6px;padding:8px 15px;'
                + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;';
            head.appendChild(x);

            const scroll = document.createElement('div');
            scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px 26px 32px;';
            // Two columns where there is room; one when there is not. Long lists of short cards
            // are far easier to scan in columns than as a single tall stack.
            const cols = (html) => '<div style="columns:2;column-gap:18px;">' + html + '</div>';

            scroll.innerHTML = ''
                + '<p style="max-width:76ch;font:15px/1.65 Georgia,serif;color:#3d4744;margin:0 0 24px;">'
                + 'A map of the design space, not a toolbox. Nothing here is wired to a designer yet — each '
                + 'entry is marked accordingly, so this reads as what it is: where the work is going.</p>'
                + centre(1, 'RNA as the target',
                    'The therapeutic acts on a transcript that already exists — degrading it, blocking a site on it, '
                    + 'editing it, or redirecting how it is processed.',
                    cols(TARGETING.map((r) => card(r[0], r[1], r[2], 'Principal mechanism', 'Typical design objective')).join('')))
                + centre(2, 'RNA as the medicine',
                    'The RNA is itself the payload — it is delivered to be expressed, translated, or to act directly.',
                    cols(MEDICINE.map((r) => card(r[0], r[1], r[2], 'Function', 'Typical application')).join('')))
                + centre(3, 'Cross-modality targeting strategies',
                    'Design choices that cut across the centres above: how a target is chosen and scoped, whichever '
                    + 'modality carries it.',
                    cols(STRATEGIES.map((r) => card(r[0], '', '', '', '')).join('')));

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
                restoreHover();
            };
            onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
            x.onclick = close;
            overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            overlay.appendChild(pane);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not open the institute: ' + e + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
