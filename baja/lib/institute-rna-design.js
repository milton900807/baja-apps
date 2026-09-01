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

        // [name, mechanism/function, objective/application, case-study tag, clinical example]
        // The case studies are real drugs and real trials from the field, named as precedent.
        // Entries with no clinical example carry no tag rather than a speculative one.
        const TARGETING = [
            ['RNase H1 gapmer ASO', 'DNA-like central gap recruits RNase H1 to cleave the RNA', 'Reduce a toxic, overexpressed, mutant, or gain-of-function transcript',
                'TOFERSEN', 'Tofersen (Qalsody) lowers SOD1 mRNA in SOD1-ALS and was approved in 2023 on neurofilament reduction. Inotersen and eplontersen apply the same mechanism to TTR.'],
            ['Steric-blocking ASO', 'Occupies an RNA site without degrading the transcript', 'Alter splicing, translation, RNA processing, localization, or protein binding',
                'NUSINERSEN', 'Nusinersen (Spinraza) occupies the ISS-N1 site in SMN2 pre-mRNA without recruiting RNase H1: the transcript is redirected rather than destroyed.'],
            ['Exon-skipping ASO', 'Blocks a splice site or enhancer to remove an exon', 'Restore a reading frame or eliminate a pathogenic exon',
                'DUCHENNE MORPHOLINOS', 'Eteplirsen (exon 51), golodirsen and viltolarsen (exon 53) and casimersen (exon 45) restore the dystrophin reading frame in Duchenne muscular dystrophy.'],
            ['Exon-inclusion ASO', 'Blocks a splice silencer or repressor site', 'Restore inclusion of a therapeutically important exon',
                'SMN2 EXON 7', 'Nusinersen remains the only approved inclusion drug: it restores SMN2 exon 7 inclusion and raises full-length SMN protein in spinal muscular atrophy.'],
            ['Cryptic-exon suppression ASO', 'Blocks a cryptic splice site or regulatory element', 'Restore normal RNA processing, such as in TDP-43 loss-of-function disease',
                'SEPOFARSEN', 'Sepofarsen blocks the c.2991+1655A>G cryptic exon in CEP290 (Leber congenital amaurosis 10) and reached Phase 3; QRL-201 addresses STMN2 cryptic splicing in ALS.'],
            ['Allele-specific ASO', 'Targets a mutation, SNP, repeat, or mutant-specific splice junction', 'Selectively suppress mutant RNA while preserving wild-type RNA',
                'WVE-003', 'WVE-003 selects a SNP on the mutant HTT allele, lowering mutant huntingtin while sparing the wild-type transcript in the SELECT-HD trial.'],
            ['Translation-blocking ASO', 'Blocks the start codon, ribosome-binding region, or UTR element', 'Reduce protein production without destroying the RNA',
                'FOMIVIRSEN', 'Fomivirsen (Vitravene, 1998), the first approved antisense drug, hybridised to CMV IE2 mRNA to arrest its translation in CMV retinitis.'],
            ['RNA-processing ASO', 'Blocks polyadenylation, cleavage, RNA modification, or localization signals', 'Redirect transcript maturation or cellular distribution',
                '', ''],
            ['siRNA', 'Duplex guide loads into AGO2/RISC and cleaves complementary RNA', 'Potent cytoplasmic transcript knockdown',
                'PATISIRAN', 'Patisiran (Onpattro, 2018) was the first approved siRNA; inclisiran, givosiran, lumasiran, vutrisiran and nedosiran followed within six years.'],
            ['shRNA', 'Vector-expressed hairpin is processed into an siRNA-like guide', 'Sustained RNA interference',
                'CAL-1', 'Cal-1 (LVsh5/C46) expresses an anti-CCR5 shRNA from a lentiviral vector in HIV, tested in Phase 1/2 autologous cell trials.'],
            ['Artificial miRNA', 'Engineered guide expressed within a miRNA scaffold', 'Vector-based knockdown with endogenous miRNA processing',
                'AMT-130', 'AMT-130 expresses an engineered miRNA against huntingtin from an AAV5 vector delivered to the striatum; Phase 1/2 in Huntington disease.'],
            ['miRNA inhibitor', 'Antagomir, LNA, or similar oligo sequesters a miRNA', 'Restore expression of genes repressed by the miRNA',
                'MIRAVIRSEN', 'Miravirsen sequestered miR-122 and produced dose-dependent HCV RNA reductions in Phase 2; cobomarsen targeted miR-155 in cutaneous T-cell lymphoma.'],
            ['miRNA mimic', 'Synthetic duplex restores or increases miRNA activity', 'Simultaneously suppress a network of target transcripts',
                'MRX34', 'MRX34, a miR-34a mimic, entered Phase 1 in solid tumours and was halted for severe immune-mediated adverse events: the clearest cautionary case in the field.'],
            ['CRISPR-Cas13', 'Guide RNA directs Cas13 to bind or cleave RNA', 'Programmable RNA knockdown without changing DNA',
                '', ''],
            ['ADAR-guided RNA editing', 'Guide recruits endogenous or engineered ADAR', 'Correct specific bases, principally A-to-I, interpreted as A-to-G',
                'WVE-006', 'WVE-006 restored circulating M-AAT protein in alpha-1 antitrypsin deficiency (RestorAATion-2, 2024): the first demonstration of RNA editing in humans.'],
            ['Cas13 RNA base editor', 'Catalytically inactive Cas13 positions an editing enzyme', 'Programmable A-to-I or engineered C-to-U editing',
                '', ''],
            ['RNA trans-splicing', 'Replaces part of a transcript through spliceosome- or ribozyme-mediated trans-splicing', 'Repair a mutation or replace a large RNA segment',
                '', ''],
            ['Ribozyme', 'Catalytic RNA recognizes and cleaves or repairs another RNA', 'Sequence-specific RNA cleavage or trans-splicing',
                'ANGIOZYME', 'Angiozyme (anti-VEGFR-1) and Heptazyme (anti-HCV) both reached Phase 2; OZ1 delivered an anti-HIV ribozyme in autologous haematopoietic stem cells.'],
            ['DNAzyme', 'Catalytic DNA binds and cleaves a complementary RNA', 'Direct RNA degradation without RNase H or RISC',
                'SB010', 'SB010 (hgd40), a GATA-3 DNAzyme, reduced late asthmatic responses and sputum eosinophils in a Phase 2 allergen-challenge trial; Dz13 targeted c-Jun in basal-cell carcinoma.'],
            ['RNA-targeting small molecule', 'Small molecule binds a structured RNA pocket', 'Alter splicing, translation, stability, or RNA-protein interactions',
                'RISDIPLAM', 'Risdiplam (Evrysdi, 2020) binds structured SMN2 pre-mRNA and shifts exon 7 splicing: an orally available small molecule doing an ASO job.'],
            ['RIBOTAC', 'Bifunctional molecule binds an RNA and recruits an endogenous ribonuclease', 'Proximity-induced degradation of a selected RNA',
                '', ''],
            ['RNA decoy or sponge', 'Engineered RNA sequesters an RNA-binding protein or miRNA', 'Neutralize a pathogenic regulatory interaction',
                'TAR DECOY', 'A TAR RNA decoy was delivered alongside an shRNA and a CCR5 ribozyme in autologous stem cells for HIV-related lymphoma (Phase 1).'],
            ['RNA-targeting aptamer', 'Structured oligonucleotide binds a selected RNA structure', 'Block RNA function or recruit another therapeutic activity',
                '', '']
        ];

        const MEDICINE = [
            ['Linear mRNA', 'Transient protein expression', 'Protein replacement, vaccines, antibodies, transcription factors, or genome editors',
                'CVnCoV', 'CureVac unmodified linear mRNA COVID-19 vaccine reached Phase 3 at roughly 48% efficacy: the trial that showed how much work nucleoside modification was doing.'],
            ['Modified mRNA', 'Chemically modified mRNA with reduced innate immune sensing', 'Improved expression, stability, and tolerability',
                'BNT162b2', 'BNT162b2 (Comirnaty) and mRNA-1273 (Spikevax) both substitute N1-methylpseudouridine to blunt innate sensing; billions of doses administered.'],
            ['Self-amplifying RNA', 'Encodes an RNA replicase that amplifies the payload', 'Lower-dose vaccines or prolonged protein expression',
                'ARCT-154', 'ARCT-154 (Kostaive), a self-amplifying COVID-19 vaccine, was approved in Japan in 2023 at a small fraction of a conventional mRNA dose.'],
            ['Trans-amplifying RNA', 'Separates replicase and payload into different RNAs', 'Modular amplification with potentially improved control',
                '', ''],
            ['Circular RNA', 'Covalently closed RNA resistant to exonucleases', 'Longer-duration protein production',
                '', ''],
            ['Suppressor tRNA', 'Recognizes a premature stop codon and inserts an amino acid', 'Nonsense-mutation suppression',
                '', ''],
            ['Engineered tRNA', 'Alters decoding, amino-acid incorporation, or translation', 'Codon correction and programmable protein synthesis',
                '', ''],
            ['RNA aptamer', 'Folded RNA binds a protein or small molecule', 'Receptor agonism/antagonism, inhibition, targeting, or delivery',
                'PEGAPTANIB', 'Pegaptanib (Macugen, 2004) bound VEGF165 in wet AMD; avacincaptad pegol (Izervay, 2023) binds complement C5 in geographic atrophy.'],
            ['Guide RNA', 'Directs a DNA- or RNA-editing enzyme to its target', 'CRISPR genome editing, RNA editing, or epigenetic regulation',
                'EXA-CEL', 'Exagamglogene autotemcel (Casgevy, 2023) uses a guide RNA against the BCL11A erythroid enhancer; NTLA-2001 delivers guide and Cas9 by LNP for ATTR amyloidosis.'],
            ['RNA vaccine', 'Encodes an antigen', 'Infectious-disease or cancer vaccination',
                'mRNA-4157', 'mRNA-4157 (V940) encodes up to 34 patient-specific neoantigens and improved recurrence-free survival with pembrolizumab in resected melanoma (Phase 2b).'],
            ['Replicon RNA', 'Self-replicating RNA expression system', 'Vaccines and sustained therapeutic-protein expression',
                'GEMCOVAC-19', 'GEMCOVAC-19, a self-replicating RNA COVID-19 vaccine, received emergency use authorisation in India in 2022.']
        ];

        // [name, case-study tag, clinical example]
        const STRATEGIES = [
            ['Gene-specific targeting',
                'INCLISIRAN', 'Inclisiran (Leqvio) silences PCSK9 in hepatocytes on a twice-yearly schedule: one gene, whole-transcript.'],
            ['Transcript- or isoform-specific targeting',
                'NUSINERSEN', 'Nusinersen does not silence a gene; it shifts SMN2 between two isoforms, exon-7-skipped and full length.'],
            ['Exon- or splice-junction targeting',
                'CASIMERSEN', 'The Duchenne skippers each address a single exon: 45 (casimersen), 51 (eteplirsen), 53 (golodirsen, viltolarsen).'],
            ['Allele-specific or mutation-specific targeting',
                'WVE-003', 'WVE-003 discriminates mutant from wild-type HTT at a single SNP, lowering only the mutant transcript.'],
            ['Repeat-expansion targeting',
                'DEL-DESIRAN', 'Del-desiran (AOC 1001) targets the CUG-expanded DMPK transcript in myotonic dystrophy type 1; BIIB078 targeted the C9orf72 repeat in ALS before being discontinued.'],
            ['Fusion-transcript targeting',
                '', ''],
            ['RNA-structure targeting',
                'RISDIPLAM', 'Risdiplam recognises a structured element in SMN2 pre-mRNA rather than a linear sequence: the design problem is a fold, not a string.'],
            ['RNA-protein-interaction targeting',
                'ISS-N1', 'Nusinersen acts by displacing hnRNP A1 from the ISS-N1 silencer; the target is an interaction, not a transcript.'],
            ['RNA-modification-site targeting',
                'STC-15', 'STC-15, a METTL3 inhibitor, was the first m6A-writer drug to enter first-in-human trials in cancer.'],
            ['Cell- or tissue-specific targeting',
                'GalNAc', 'GalNAc conjugation confines inclisiran and givosiran to ASGPR-bearing hepatocytes; antibody-oligonucleotide conjugates use TfR1 to reach muscle.'],
            ['Inducible or conditionally active targeting',
                '', ''],
            ['Multiplex targeting of several transcripts',
                'rHIV7-shI-TAR-CCR5RZ', 'One lentiviral vector carried three RNA agents at once, an shRNA, a TAR decoy and a CCR5 ribozyme, into autologous stem cells for HIV.'],
            ['Pan-variant targeting of a shared sequence',
                'VUTRISIRAN', 'A single TTR site lets vutrisiran and patisiran cover wild-type transthyretin and more than 130 variants together.'],
            ['Personalized or n-of-1 variant targeting',
                'MILASEN', 'Milasen was designed, manufactured and dosed for one child with CLN7 Batten disease inside a year (2018): the founding n-of-1 case.']
        ];

        const SOON = '<span style="flex:0 0 auto;background:#f1e2c4;color:#7a5a1e;border:1px solid #e0cba0;'
            + 'border-radius:999px;padding:2px 9px;font:700 10px Arial;letter-spacing:0.8px;">COMING SOON</span>';

        // Sits immediately after COMING SOON. The tag names the precedent; the card body
        // carries the detail, since a whole sentence in a pill wrecks the column layout.
        const CASE = (tag) => (!tag ? '' : '<span style="flex:0 0 auto;background:#e3efe9;color:#14705c;'
            + 'border:1px solid #bcd8ce;border-radius:999px;padding:2px 9px;font:700 10px Arial;'
            + 'letter-spacing:0.8px;">CASE STUDY IN ' + esc(tag).toUpperCase() + '</span>');

        const card = (name, a, b, labelA, labelB, caseTag, caseText) => ''
            + '<article style="break-inside:avoid;border:1px solid #d9d3c7;border-left:3px solid #14705c;'
            + 'background:#fffefb;padding:14px 16px;margin:0 0 12px;">'
            + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:7px 10px;">'
            + '<span style="flex:1 1 100%;font:700 16px Georgia,\'Times New Roman\',serif;color:#14211f;">' + esc(name) + '</span>'
            + SOON + CASE(caseTag) + '</div>'
            + (a ? ('<div style="margin-top:9px;font:13px/1.55 Arial;color:#2f3a38;">'
                + '<span style="font:700 10.5px Arial;letter-spacing:1.2px;text-transform:uppercase;color:#14705c;">' + labelA + '</span><br>' + esc(a) + '</div>') : '')
            + (b ? ('<div style="margin-top:7px;font:13px/1.55 Arial;color:#2f3a38;">'
                + '<span style="font:700 10.5px Arial;letter-spacing:1.2px;text-transform:uppercase;color:#14705c;">' + labelB + '</span><br>' + esc(b) + '</div>') : '')
            + (caseText ? ('<div style="margin-top:10px;padding-top:9px;border-top:1px dashed #ded8cc;'
                + 'font:italic 13px/1.55 Georgia,serif;color:#3a4a45;">'
                + '<span style="font:700 10.5px Arial;font-style:normal;letter-spacing:1.2px;text-transform:uppercase;color:#8a6a2a;">Clinical example</span><br>'
                + esc(caseText) + '</div>') : '')
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
                + (TARGETING.length + MEDICINE.length + STRATEGIES.length) + ' entries · every one in preparation · '
                + (TARGETING.filter((r) => r[3]).length + MEDICINE.filter((r) => r[3]).length + STRATEGIES.filter((r) => r[1]).length)
                + ' with a clinical case study</div></div>';
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
                + 'entry is marked accordingly, so this reads as what it is: where the work is going. '
                + 'The case studies name drugs and trials that already exist in the field. They are precedent, not our work, '
                + 'and the categories without one have no clinical example to point to yet.</p>'
                + centre(1, 'RNA as the target',
                    'The therapeutic acts on a transcript that already exists — degrading it, blocking a site on it, '
                    + 'editing it, or redirecting how it is processed.',
                    cols(TARGETING.map((r) => card(r[0], r[1], r[2], 'Principal mechanism', 'Typical design objective', r[3], r[4])).join('')))
                + centre(2, 'RNA as the medicine',
                    'The RNA is itself the payload — it is delivered to be expressed, translated, or to act directly.',
                    cols(MEDICINE.map((r) => card(r[0], r[1], r[2], 'Function', 'Typical application', r[3], r[4])).join('')))
                + centre(3, 'Cross-modality targeting strategies',
                    'Design choices that cut across the centres above: how a target is chosen and scoped, whichever '
                    + 'modality carries it.',
                    cols(STRATEGIES.map((r) => card(r[0], '', '', '', '', r[1], r[2])).join('')));

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
