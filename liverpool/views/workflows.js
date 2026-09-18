function (opts) {
    // EXAMPLE WORKFLOWS for the neoantigen designer.
    //
    // Opened from the header. Each entry is a route through the five tabs for one kind of
    // job, written as the steps somebody actually takes, with the control that does each
    // step named as it appears on screen. "Start here" closes the panel and resolves the
    // tab that step 1 lives on, so the caller can switch to it.
    //
    // These are ROUTES, not data: nothing here fills the patient, allele or mutation
    // fields. A worked example with invented alleles and variants reads like a real case
    // and would be a poor thing to have sitting in a design file.
    return new Promise((resolve) => {
        const ID = 'lv-workflows';
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        const WF = [
            {
                id: 'tumour-normal',
                tab: 'patient',
                title: 'Tumour and normal sequencing to a class I cassette',
                when: 'The usual route: a patient, their HLA typing, and a somatic variant list from a tumour/normal pair.',
                steps: [
                    ['Patient & HLA', 'Enter the patient reference. Add each class I allele from the typing report — four-digit resolution, one field per allele. An allele the motif library knows only weakly is marked, and candidates that rest on it should be read with that in mind.'],
                    ['Mutations', 'Paste a list… takes the variant table. Give each row its gene, protein change, variant allele frequency and expression. Fetch pulls the wild-type protein for a symbol, transcript or accession, and the protein change is checked against that protein before it is applied.'],
                    ['Mutations', 'Drop anything the expression column says is not transcribed. A neoepitope from a gene that is not expressed in this tumour is not a target.'],
                    ['Candidates', 'Run. Sort on rank, then read the wild-type rank beside it: the gap between mutant and wild-type binding is what makes an epitope worth carrying. Select the top 10 as a starting shortlist, then prune by hand.'],
                    ['Construct', 'Order the selected epitopes, pick the class I linker, then Build and check.'],
                    ['Output', 'Read the design report, then export the transcript and the candidate table together.']
                ]
            },
            {
                id: 'single-driver',
                tab: 'mutations',
                title: 'One shared driver mutation',
                when: 'A single recurrent driver, against a cohort of patients who share an allele. The smallest complete design.',
                steps: [
                    ['Mutations', 'Add a mutation for the driver alone. Fetch the wild-type protein and let the protein change be checked against it — a driver written against the wrong isoform is the easiest mistake to make here.'],
                    ['Patient & HLA', 'Add only the alleles the cohort is selected on. Fewer alleles make the candidate list short enough to read every row.'],
                    ['Candidates', 'Run. With one mutation the whole list is worth reading: look at where the mutated residue sits in each peptide, because a change at an anchor position and a change on the face the receptor sees do quite different things.'],
                    ['Construct', 'Select the peptides that cover the mutation in more than one register, so the design does not rest on a single processing outcome.'],
                    ['Output', 'Export and keep the report beside the cohort definition.']
                ]
            },
            {
                id: 'frameshift',
                tab: 'mutations',
                title: 'Frameshift and indel neoepitopes',
                when: 'A frameshift, which yields a stretch of protein that has no wild-type counterpart at all.',
                steps: [
                    ['Mutations', 'Add the mutation as a p.…fs change. The novel peptide field is required for a frameshift: read the new reading frame off the mutant transcript and paste the residues from the shift to the first stop. The designer will not invent them.'],
                    ['Mutations', 'Paste the wild-type protein as well, so the sequence before the shift is the real one.'],
                    ['Candidates', 'Run. There is no meaningful wild-type rank for a peptide that lies entirely in the novel stretch, and the table says so rather than showing a number.'],
                    ['Construct', 'Frameshift peptides are often long. Check what the cassette length does to the transcript before committing to several of them.'],
                    ['Output', 'Export, and note in the record which transcript the novel stretch was read from.']
                ]
            },
            {
                id: 'class-i-ii',
                tab: 'patient',
                title: 'Class I and class II in one cassette',
                when: 'You want CD8 epitopes and CD4 help in the same construct.',
                steps: [
                    ['Patient & HLA', 'Add the class I alleles and the class II alleles. Both lists feed the same run and the candidates are labelled by class.'],
                    ['Candidates', 'Run, then shortlist each class separately. Class II peptides are longer and their ranks are not comparable with class I — do not sort the two together and take the top of the list.'],
                    ['Construct', 'Group the class I epitopes with the class I linker and the class II epitopes with GPGPG, which is there to discourage new epitopes forming across the seam. Search for a better order will propose an arrangement; the junction report is the thing to read afterwards.'],
                    ['Construct', 'Build and check, then look at every junction it flags before moving on.'],
                    ['Output', 'Export the protein cassette as well as the transcript, so the two can be checked independently.']
                ]
            },
            {
                id: 'junctions',
                tab: 'construct',
                title: 'Working on the order and the seams',
                when: 'The shortlist is settled and the question is how to string it together.',
                steps: [
                    ['Construct', 'Move epitopes with the arrows to see what each arrangement costs. The order changes which peptides sit next to each other and therefore which junctional sequences exist at all.'],
                    ['Construct', 'Search for a better order when there are more than two epitopes. It proposes an arrangement; it does not decide for you.'],
                    ['Construct', 'Try the alternative linkers. A linker that helps release the epitope in front of it and one that suppresses junctional epitopes are not the same choice, and the blurb under each says which it is.'],
                    ['Construct', 'Build and check after each change. A seam that was clean under one order will not stay clean under another.'],
                    ['Output', 'Only export once the junction check is clean or every flag is understood and written down.']
                ]
            },
            {
                id: 're-type',
                tab: 'patient',
                title: 'Re-running a saved design against a new HLA typing',
                when: 'The typing has been corrected or extended and an existing design has to be revisited.',
                steps: [
                    ['Patient & HLA', 'Open the saved design first, then correct the allele list. Everything else in the file is left alone.'],
                    ['Candidates', 'Run again. The previous selection is kept where the peptides still rank, so you can see what the new typing changed rather than starting over.'],
                    ['Candidates', 'Clear selection and re-shortlist if the allele change was substantial. A shortlist chosen for the old typing is not evidence about the new one.'],
                    ['Construct', 'Build and check again — the cassette is only valid for the alleles it was chosen against.'],
                    ['Output', 'Save under a new name and keep both. The superseded design is part of the record.']
                ]
            },
            {
                id: 'to-order',
                tab: 'construct',
                title: 'Getting to something orderable',
                when: 'The design is final and the transcript is going out for synthesis.',
                steps: [
                    ['Construct', 'Settle the leader, trailer, untranslated regions, poly(A) length and codon strategy. Any part shown in red has residues or bases that must be confirmed against the record named beside it.'],
                    ['Construct', 'Check those parts against their primary records and tick to say you did. Export stays held until then, on purpose: a signal peptide with one residue wrong looks exactly like a signal peptide on screen.'],
                    ['Construct', 'Build and check for the last time.'],
                    ['Output', 'Read the full transcript, not just the cassette. Then take the design report, the transcript FASTA and the candidate CSV together — the report is what makes the other two interpretable later.'],
                    ['Output', 'Write the notes for the record before saving. Whoever reads this file next will not have this session.']
                ]
            }
        ];

        const wrap = document.createElement('div');
        wrap.id = ID;
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:rgba(3,12,24,0.72);'
            + 'display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 16px;'
            + 'font-family:Arial,Helvetica,sans-serif;';
        wrap.innerHTML = ''
            + '<div style="width:min(860px,100%);background:#0b2545;color:#fff;border:1px solid rgba(255,255,255,0.14);'
            + 'border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,0.45);overflow:hidden;">'
            + '  <div style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.12);">'
            + '    <div style="min-width:0;">'
            + '      <div style="font:700 17px Arial;">Example workflows</div>'
            + '      <div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Routes through the five tabs. Pick the one that matches the job in front of you.</div>'
            + '    </div>'
            + '    <button id="lv-wf-x" style="margin-left:auto;cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#dbe6f3;">Close</button>'
            + '  </div>'
            + '  <div id="lv-wf-list" style="padding:8px 20px 20px;"></div>'
            + '</div>';

        const list = wrap.querySelector('#lv-wf-list');
        list.innerHTML = WF.map((w, i) => ''
            + '<details style="border-bottom:1px solid rgba(255,255,255,0.09);padding:12px 0;"' + (i === 0 ? ' open' : '') + '>'
            + '<summary style="cursor:pointer;font:700 14px Arial;list-style:none;display:flex;gap:10px;align-items:baseline;">'
            + '<span style="flex:0 0 auto;display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;'
            + 'border-radius:6px;background:rgba(255,255,255,0.10);font:700 11px Arial;color:#9fb3c8;">' + (i + 1) + '</span>'
            + '<span>' + esc(w.title) + '</span></summary>'
            + '<div style="font:12.5px/1.6 Arial;color:#9fb3c8;margin:8px 0 10px 30px;">' + esc(w.when) + '</div>'
            + '<ol style="margin:0 0 12px 30px;padding-left:18px;font:13px/1.65 Arial;">'
            + w.steps.map((s) => '<li style="margin-bottom:7px;">'
                + '<span style="display:inline-block;border-radius:5px;padding:1px 7px;margin-right:7px;background:rgba(255,255,255,0.09);'
                + 'font:700 10.5px Arial;color:#dbe6f3;vertical-align:1px;">' + esc(s[0]) + '</span>'
                + esc(s[1]) + '</li>').join('')
            + '</ol>'
            + '<div style="margin-left:30px;"><button class="lv-wf-go" data-tab="' + esc(w.tab) + '" style="cursor:pointer;border-radius:8px;'
            + 'padding:8px 14px;font:700 12px Arial;border:1px solid #2f6f8f;background:#123d5e;color:#eaf6f9;">Start here</button></div>'
            + '</details>').join('');

        document.body.appendChild(wrap);

        let done = false;
        const close = (tabId) => {
            if (done) return;
            done = true;
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { }
            resolve(tabId || null);
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } else { e.stopPropagation(); } };
        document.addEventListener('keydown', onKey, true);
        wrap.querySelector('#lv-wf-x').onclick = () => close(null);
        wrap.onclick = (e) => { if (e.target === wrap) close(null); };
        list.querySelectorAll('.lv-wf-go').forEach((b) => { b.onclick = () => close(b.getAttribute('data-tab')); });
    });
}
