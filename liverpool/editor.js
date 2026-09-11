function (path, config) {

    // LIVERPOOL — the neoantigen editor.
    //
    // A design tool for the peptides that go into an mRNA cancer vaccine, and for the
    // transcript that carries them. It walks the antigen-processing pathway in order --
    // whose HLA, which mutations, which peptides survive processing and binding, how they
    // are strung together, what the transcript then looks like -- because that order is the
    // one that decides whether any of it works.
    //
    // It is a sibling of manchester/editor.js and shares its file drive, its save format
    // conventions and its look. It shares no code with it: the screening editor designs
    // oligonucleotides against a transcript, and this designs a transcript against an
    // immune system. The only overlap is that both end in a sequence somebody orders.
    //
    // READ THIS BEFORE USING THE OUTPUT. The built-in binding predictor is a MOTIF SCREEN
    // (lib/hla.js explains exactly what that means). It is good enough to sort a list and
    // to catch a junctional epitope while you are still editing. It is not a trained
    // predictor and its ranks are not affinities. Re-rank the shortlist with a real
    // predictor before anything is synthesised. The editor says so on every screen that
    // shows a rank, and the exported report says so in writing.
    //
    //   exec('liverpool/editor')                 -- start a new design
    //   exec('liverpool/editor', '/path/x.liverpool')   -- open a saved one

    if (Array.isArray(path)) path = path[0];

    return (async () => {

        const ID = 'liverpool-editor';
        const step = (m) => { try { console.log('[liverpool] ' + m); } catch (e) { } };

        const GC = await exec('liverpool/lib/genetic-code.js');
        const HLA = await exec('liverpool/lib/hla.js');
        const MUT = await exec('liverpool/lib/mutation.js');
        const EP = await exec('liverpool/lib/epitope.js');
        const CON = await exec('liverpool/lib/construct.js');
        const PRESETS = await exec('liverpool/lib/presets.js');
        const STORE = await exec('liverpool/io/store.js');

        // Everything a user types reaches the page through innerHTML, and a gene name is
        // whatever somebody pasted. Escaped, always, with no exceptions made for "our own"
        // strings -- a mutation label is built from user input too.
        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const pct = (v, d) => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%';
        const num = (v, d) => (v == null || isNaN(v)) ? '—' : (+v).toFixed(d == null ? 2 : d);
        const rankTxt = (r) => (r == null) ? '—' : (r < 0.01 ? r.toFixed(4) : (r < 1 ? r.toFixed(3) : r.toFixed(2))) + '%';

        // ---- state ---------------------------------------------------------------------------
        let S = {
            name: '', patientLabel: '',
            classI: ['HLA-A*02:01'], classII: [],
            lengthsI: [8, 9, 10, 11], lengthsII: [15],
            mutations: [], proteome: '',
            candidates: [], collapsed: [], ran: false,
            selected: [],
            linker: 'aay', leader: 'none', trailer: 'none',
            utr5: 'none', utr3: 'none', polyA: 120, optMode: 'balanced',
            useVaf: true, useTpm: true, useAgretopicity: true,
            acknowledgedVerify: false,
            filterBinders: true, filterSelf: true, sortKey: 'priority', sortDir: -1,
            built: null, junctions: null, context: null, qcFindings: null, cassette: null,
            notes: '', savedPath: ''
        };
        let tab = 'patient';
        let nextId = 1;

        const weights = () => ({ useVaf: S.useVaf, useTpm: S.useTpm, useAgretopicity: S.useAgretopicity });

        // ---- the panel -------------------------------------------------------------------------
        try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        if (!document.getElementById('liverpool-style')) {
            const st = document.createElement('style');
            st.id = 'liverpool-style';
            st.textContent = [
                '#' + ID + ' *{box-sizing:border-box;}',
                '#' + ID + ' button{font-family:Arial,Helvetica,sans-serif;cursor:pointer;}',
                '#' + ID + ' .lv-btn{border-radius:8px;padding:8px 14px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;}',
                '#' + ID + ' .lv-btn:hover{background:rgba(255,255,255,0.10);}',
                '#' + ID + ' .lv-btn.go{border-color:#22c55e;background:#22c55e;color:#04210f;}',
                '#' + ID + ' .lv-btn.go:hover{filter:brightness(1.1);background:#22c55e;}',
                '#' + ID + ' .lv-btn[disabled]{opacity:0.4;cursor:not-allowed;}',
                '#' + ID + ' .lv-tab{padding:10px 16px;font:600 13px Arial;color:#9fb3c8;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;}',
                '#' + ID + ' .lv-tab.on{color:#fff;border-bottom-color:#22c55e;}',
                '#' + ID + ' .lv-tab .n{display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.12);font:700 11px Arial;margin-right:7px;}',
                '#' + ID + ' .lv-card{background:#0a1e3a;border:1px solid rgba(255,255,255,0.10);border-radius:10px;padding:16px 18px;margin:0 0 16px;}',
                '#' + ID + ' .lv-card h3{margin:0 0 4px;font:700 15px Arial;color:#fff;}',
                '#' + ID + ' .lv-card p.sub{margin:0 0 14px;font:12.5px/1.55 Arial;color:#9fb3c8;}',
                '#' + ID + ' label.f{display:block;font:600 11.5px Arial;color:#9fb3c8;margin:0 0 5px;letter-spacing:0.02em;}',
                '#' + ID + ' input[type=text],#' + ID + ' input[type=number],#' + ID + ' textarea,#' + ID + ' select{width:100%;background:#071a30;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:7px;padding:8px 10px;font:13px Arial;}',
                '#' + ID + ' textarea{font:12px/1.5 "SF Mono",Menlo,Consolas,monospace;resize:vertical;}',
                '#' + ID + ' .mono{font:12px/1.5 "SF Mono",Menlo,Consolas,monospace;}',
                '#' + ID + ' .chip{display:inline-block;margin:0 6px 6px 0;padding:6px 11px;border-radius:16px;font:600 12px Arial;cursor:pointer;border:1px solid rgba(255,255,255,0.18);color:#c8d6e6;background:transparent;user-select:none;}',
                '#' + ID + ' .chip.on{background:#1d4ed8;border-color:#3b82f6;color:#fff;}',
                '#' + ID + ' .chip.weakmotif{border-style:dashed;}',
                '#' + ID + ' table.lv{width:100%;border-collapse:collapse;font:12px Arial;}',
                '#' + ID + ' table.lv th{position:sticky;top:0;background:#0b2545;color:#9fb3c8;font:600 11px Arial;text-align:left;padding:8px 8px;border-bottom:1px solid rgba(255,255,255,0.14);cursor:pointer;white-space:nowrap;z-index:2;}',
                '#' + ID + ' table.lv td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#dbe6f3;vertical-align:top;}',
                '#' + ID + ' table.lv tr:hover td{background:rgba(255,255,255,0.04);}',
                '#' + ID + ' table.lv tr.sel td{background:rgba(34,197,94,0.10);}',
                '#' + ID + ' .tag{display:inline-block;padding:2px 7px;border-radius:5px;font:700 10.5px Arial;}',
                '#' + ID + ' .tag.strong{background:#14532d;color:#86efac;}',
                '#' + ID + ' .tag.weak{background:#3f3f16;color:#fde68a;}',
                '#' + ID + ' .tag.none{background:rgba(255,255,255,0.07);color:#9fb3c8;}',
                '#' + ID + ' .tag.bad{background:#4c1d24;color:#fca5a5;}',
                '#' + ID + ' .tag.info{background:#12324f;color:#9ecbff;}',
                '#' + ID + ' .note{border-left:3px solid #3b82f6;background:rgba(59,130,246,0.08);padding:11px 14px;border-radius:0 8px 8px 0;font:12.5px/1.6 Arial;color:#c8d9ec;margin:0 0 14px;}',
                '#' + ID + ' .warn{border-left:3px solid #f59e0b;background:rgba(245,158,11,0.09);padding:11px 14px;border-radius:0 8px 8px 0;font:12.5px/1.6 Arial;color:#fbd38d;margin:0 0 14px;}',
                '#' + ID + ' .stop{border-left:3px solid #ef4444;background:rgba(239,68,68,0.10);padding:11px 14px;border-radius:0 8px 8px 0;font:12.5px/1.6 Arial;color:#fca5a5;margin:0 0 14px;}',
                '#' + ID + ' .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}',
                '#' + ID + ' .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}',
                '#' + ID + ' .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}',
                '@media (max-width:900px){#' + ID + ' .grid2,#' + ID + ' .grid3,#' + ID + ' .grid4{grid-template-columns:1fr;}}',
                '#' + ID + ' .scroll{overflow:auto;max-height:52vh;border:1px solid rgba(255,255,255,0.10);border-radius:9px;}',
                '#' + ID + ' .kv{display:flex;gap:8px;font:12px Arial;color:#9fb3c8;padding:3px 0;}',
                '#' + ID + ' .kv b{color:#e8f0fb;font-weight:700;}',
                '#' + ID + ' .seq{word-break:break-all;font:12px/1.7 "SF Mono",Menlo,Consolas,monospace;color:#cfe0f2;background:#071a30;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 14px;}',
                '#' + ID + ' .seg-ep{color:#86efac;}', '#' + ID + ' .seg-lk{color:#fbbf24;}',
                '#' + ID + ' .seg-ld{color:#93c5fd;}', '#' + ID + ' .seg-tr{color:#c4b5fd;}',
                '#' + ID + ' .row-act{display:flex;gap:6px;align-items:center;}',
                '#' + ID + ' .mini{border-radius:6px;padding:4px 9px;font:700 11px Arial;border:1px solid rgba(255,255,255,0.20);background:transparent;color:#dbe6f3;}',
                '#' + ID + ' .mini:hover{background:rgba(255,255,255,0.10);}',
                '#' + ID + ' .mini.danger{border-color:#7f1d1d;color:#fca5a5;}'
            ].join('\n');
            (document.head || document.documentElement).appendChild(st);
        }

        const panel = document.createElement('div');
        panel.id = ID;
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147482900;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
        panel.innerHTML = ''
            + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:14px 22px 12px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
            + '  <div style="min-width:0;">'
            + '    <div style="font:700 19px Arial;">Liverpool <span style="color:#9fb3c8;font-weight:400;">· neoantigen designer</span></div>'
            + '    <div id="lv-sub" style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Design the peptides, then the mRNA that carries them.</div>'
            + '  </div>'
            + '  <div style="margin-left:auto;display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end;">'
            + '    <button class="lv-btn" data-act="open">Open</button>'
            + '    <button class="lv-btn" data-act="save">Save</button>'
            + '    <button class="lv-btn" data-act="close">Close</button>'
            + '  </div>'
            + '</div>'
            + '<div id="lv-tabs" style="flex:0 0 auto;display:flex;gap:2px;padding:0 16px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.10);overflow-x:auto;"></div>'
            + '<div id="lv-msg" style="flex:0 0 auto;"></div>'
            + '<div id="lv-body" style="flex:1 1 auto;overflow:auto;padding:20px 22px 40px;"></div>';
        document.body.appendChild(panel);

        const $ = (sel) => panel.querySelector(sel);
        const body = $('#lv-body');
        const msgBar = $('#lv-msg');

        // Typing in this panel must not reach whatever is behind it: the application binds
        // paste and key handlers at the document level and they would act on the editor
        // underneath while somebody is typing a protein sequence in here.
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
            panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        }

        let msgTimer = null;
        const say = (text, kind) => {
            const k = kind || 'note';
            msgBar.innerHTML = text ? ('<div class="' + k + '" style="margin:12px 22px 0;">' + esc(text) + '</div>') : '';
            if (msgTimer) clearTimeout(msgTimer);
            if (text && k === 'note') msgTimer = setTimeout(() => { try { msgBar.innerHTML = ''; } catch (e) { } }, 9000);
        };

        // ---- tabs ---------------------------------------------------------------------------
        const TABS = [
            { id: 'patient', n: 1, label: 'Patient & HLA' },
            { id: 'mutations', n: 2, label: 'Mutations' },
            { id: 'candidates', n: 3, label: 'Candidates' },
            { id: 'construct', n: 4, label: 'Construct' },
            { id: 'output', n: 5, label: 'Output' }
        ];
        const drawTabs = () => {
            $('#lv-tabs').innerHTML = TABS.map((t) =>
                '<div class="lv-tab' + (tab === t.id ? ' on' : '') + '" data-tab="' + t.id + '">'
                + '<span class="n">' + t.n + '</span>' + esc(t.label) + '</div>').join('');
        };
        $('#lv-tabs').addEventListener('click', (e) => {
            const el = e.target.closest ? e.target.closest('[data-tab]') : null;
            if (!el) return;
            tab = el.getAttribute('data-tab');
            drawTabs(); render();
        });

        // =====================================================================================
        //  TAB 1 — patient and HLA
        // =====================================================================================
        const chipRow = (list, chosen, kind) => list.map((a) => {
            const meta = HLA.info(a);
            const weak = meta && (meta.conf === 'weak');
            return '<span class="chip' + (chosen.indexOf(a) >= 0 ? ' on' : '') + (weak ? ' weakmotif' : '') + '"'
                + ' data-allele="' + esc(a) + '" data-kind="' + kind + '"'
                + ' title="' + esc((meta ? (meta.note || '') : '') + (weak ? ' (motif confidence: weak)' : '')) + '">'
                + esc(a.replace('HLA-', '')) + '</span>';
        }).join('');

        const renderPatient = () => {
            const lenChip = (L, on, kind) => '<span class="chip' + (on ? ' on' : '') + '" data-len="' + L + '" data-lenkind="' + kind + '">' + L + '-mer</span>';
            body.innerHTML = ''
                + '<div class="warn"><b>What the binding numbers in this editor are.</b> The built-in predictor is a '
                + 'motif screen: it scores each peptide against the published anchor preferences of the allele and '
                + 'reports a percentile rank against a random background. It is not NetMHCpan or any other trained '
                + 'predictor, it has no training data in it, and its ranks are not affinities. Use it to sort and to '
                + 'catch problems early. Re-rank the shortlist with a trained predictor before anything is synthesised.</div>'

                + '<div class="lv-card">'
                + '<h3>Who this design is for</h3>'
                + '<p class="sub">A label for the record. It is written into the saved file and the exported report, and it is never sent anywhere.</p>'
                + '<div class="grid2">'
                + '<div><label class="f">Design name</label><input type="text" data-bind="name" value="' + esc(S.name) + '" placeholder="e.g. melanoma-01 cassette A"></div>'
                + '<div><label class="f">Subject / sample label</label><input type="text" data-bind="patientLabel" value="' + esc(S.patientLabel) + '" placeholder="e.g. PT-014 pre-treatment biopsy"></div>'
                + '</div></div>'

                + '<div class="lv-card">'
                + '<h3>HLA class I</h3>'
                + '<p class="sub">The alleles the CD8 response will be restricted by. Pick the subject\'s type — normally six alleles, two each of A, B and C. '
                + 'A dashed outline marks an allele whose motif is weakly described here; its ranks are the least reliable in the set.</p>'
                + '<div style="margin-bottom:10px;">' + chipRow(HLA.COMMON_CLASS_I, S.classI, 'I') + '</div>'
                + '<div class="grid2"><div><label class="f">Add an allele not listed</label>'
                + '<div style="display:flex;gap:8px;"><input type="text" id="lv-add-i" placeholder="A*30:01"><button class="mini" data-act="add-allele" data-kind="I">Add</button></div></div>'
                + '<div><label class="f">Peptide lengths to enumerate</label><div>' + [8, 9, 10, 11].map((L) => lenChip(L, S.lengthsI.indexOf(L) >= 0, 'I')).join('') + '</div></div>'
                + '</div>'
                + (S.classI.length ? '<div class="kv" style="margin-top:10px;"><b>' + S.classI.length + '</b> selected: ' + esc(S.classI.join(', ')) + '</div>'
                    : '<div class="warn" style="margin-top:12px;">No class I allele selected. Nothing can be ranked until at least one is.</div>')
                + '</div>'

                + '<div class="lv-card">'
                + '<h3>HLA class II <span class="tag info">optional</span></h3>'
                + '<p class="sub">CD4 help matters for a durable response, and the longer peptides that carry it are worth designing for. '
                + 'Be aware that the class II motifs in this tool are weaker than the class I ones — P1 is solid, the rest is a coarse preference. '
                + 'Treat class II ranks as a sort, not a shortlist.</p>'
                + '<div style="margin-bottom:10px;">' + chipRow(HLA.COMMON_CLASS_II, S.classII, 'II') + '</div>'
                + '<div class="grid2"><div><label class="f">Add an allele not listed</label>'
                + '<div style="display:flex;gap:8px;"><input type="text" id="lv-add-ii" placeholder="DRB1*08:01"><button class="mini" data-act="add-allele" data-kind="II">Add</button></div></div>'
                + '<div><label class="f">Peptide lengths to enumerate</label><div>' + [13, 15, 17, 19, 21].map((L) => lenChip(L, S.lengthsII.indexOf(L) >= 0, 'II')).join('') + '</div></div>'
                + '</div></div>'

                + '<div class="lv-card">'
                + '<h3>Use a trained predictor instead</h3>'
                + '<p class="sub">' + (HLA.hasExternalPredictor()
                    ? 'An external predictor is connected. Every rank in this session comes from it, and each row says so in its Source column.'
                    : 'No external predictor is connected, so every rank comes from the motif screen. To connect one, call '
                    + 'HLA.setExternalPredictor(fn) on the module returned by liverpool/lib/hla.js, where fn(allele, peptides) '
                    + 'resolves to one {rank} per peptide. Every consumer in the folder switches over with no other change.') + '</p>'
                + '</div>';
        };

        // =====================================================================================
        //  TAB 2 — mutations
        // =====================================================================================
        const blankMutation = () => ({
            id: nextId++, gene: '', change: '', protein: '', neoPeptide: '',
            mutantPeptide: '', wtPeptide: '', vaf: null, tpm: null, note: ''
        });

        // Validate one row and say precisely what is wrong. A row that cannot produce a
        // mutant/wild-type pair is never silently skipped during a run.
        const checkMutation = (m) => {
            if (m.mutantPeptide && !m.change) {
                const r = MUT.apply('', { kind: 'peptide', mutant: m.mutantPeptide, wt: m.wtPeptide });
                return r.ok ? { ok: true, applied: r, how: 'peptide pair' } : { ok: false, message: r.message };
            }
            if (!m.change) return { ok: false, message: 'no protein change given' };
            const c = MUT.parse(m.change);
            if (c.kind === 'error') return { ok: false, message: c.message };
            if (!m.protein) return { ok: false, message: 'no protein sequence for ' + MUT.label(c) + ' to be applied to' };
            const r = MUT.apply(m.protein, c, { neoPeptide: m.neoPeptide });
            if (!r.ok) return { ok: false, message: r.message };
            return { ok: true, applied: r, change: c, how: MUT.label(c) };
        };

        const renderMutations = () => {
            const rows = S.mutations.map((m) => {
                const v = checkMutation(m);
                const status = v.ok
                    ? '<span class="tag strong">' + esc(v.how) + '</span>' + (v.applied.note ? '<div style="color:#9fb3c8;font-size:11px;margin-top:5px;">' + esc(v.applied.note) + '</div>' : '')
                    : '<span class="tag bad">cannot use</span><div style="color:#fca5a5;font-size:11px;margin-top:5px;">' + esc(v.message) + '</div>';
                return '<div class="lv-card" data-mut="' + m.id + '">'
                    + '<div style="display:flex;gap:12px;align-items:flex-start;">'
                    + '  <div style="flex:1 1 auto;">'
                    + '    <div class="grid4">'
                    + '      <div><label class="f">Gene</label><input type="text" data-mfield="gene" value="' + esc(m.gene) + '" placeholder="KRAS"></div>'
                    + '      <div><label class="f">Protein change</label><input type="text" data-mfield="change" value="' + esc(m.change) + '" placeholder="p.G12D"></div>'
                    + '      <div><label class="f">Variant allele frequency</label><input type="number" step="0.01" min="0" max="1" data-mfield="vaf" value="' + (m.vaf == null ? '' : m.vaf) + '" placeholder="0.35"></div>'
                    + '      <div><label class="f">Expression (TPM)</label><input type="number" step="0.1" min="0" data-mfield="tpm" value="' + (m.tpm == null ? '' : m.tpm) + '" placeholder="120"></div>'
                    + '    </div>'
                    + '    <div style="margin-top:12px;"><label class="f">Wild-type protein sequence</label>'
                    + '      <textarea data-mfield="protein" rows="3" placeholder="Paste the wild-type protein, or fetch it below.">' + esc(m.protein) + '</textarea>'
                    + '      <div class="row-act" style="margin-top:8px;">'
                    + '        <input type="text" data-mfetch="1" placeholder="KRAS, ENST00000311936, ENSP00000256078 or P01116" style="max-width:340px;">'
                    + '        <button class="mini" data-act="fetch-protein">Fetch</button>'
                    + '        <span style="color:#9fb3c8;font:11.5px Arial;">Ensembl for a symbol or Ensembl ID, UniProt for an accession.</span>'
                    + '      </div></div>'
                    + '    <div class="grid2" style="margin-top:12px;">'
                    + '      <div><label class="f">Novel peptide after a frameshift</label><input type="text" data-mfield="neoPeptide" value="' + esc(m.neoPeptide) + '" placeholder="required for p.…fs — read off the mutant transcript"></div>'
                    + '      <div><label class="f">Note</label><input type="text" data-mfield="note" value="' + esc(m.note) + '" placeholder="clonal / driver / from panel v3"></div>'
                    + '    </div>'
                    + '    <div class="grid2" style="margin-top:12px;">'
                    + '      <div><label class="f">…or give the peptides directly — mutant</label><input type="text" data-mfield="mutantPeptide" value="' + esc(m.mutantPeptide) + '" placeholder="SLYNTVAKL"></div>'
                    + '      <div><label class="f">…and its wild-type counterpart</label><input type="text" data-mfield="wtPeptide" value="' + esc(m.wtPeptide) + '" placeholder="SLYNTVATL"></div>'
                    + '    </div>'
                    + '  </div>'
                    + '  <div style="flex:0 0 190px;text-align:right;">' + status
                    + '    <div style="margin-top:12px;"><button class="mini danger" data-act="del-mut">Remove</button></div>'
                    + '  </div>'
                    + '</div></div>';
            }).join('');

            body.innerHTML = ''
                + '<div class="note"><b>A protein change is checked against the protein before it is applied.</b> If the sequence does not have the '
                + 'stated residue at the stated position, the row is refused rather than mutated anyway. Nearly every silently wrong neoantigen list '
                + 'starts with a coordinate that did not mean what the pipeline assumed — a different isoform, a transcript-numbered position, an off-by-one.</div>'
                + (rows || '<div class="lv-card"><h3>No mutations yet</h3><p class="sub">Add one below, or paste a list.</p></div>')
                + '<div class="lv-card"><div class="row-act" style="flex-wrap:wrap;">'
                + '  <button class="lv-btn go" data-act="add-mut">Add a mutation</button>'
                + '  <button class="lv-btn" data-act="paste-muts">Paste a list…</button>'
                + '  <span style="color:#9fb3c8;font:12px Arial;">' + S.mutations.length + ' mutation(s), ' + S.mutations.filter((m) => checkMutation(m).ok).length + ' usable.</span>'
                + '</div></div>'
                + '<div class="lv-card"><h3>Background proteome <span class="tag info">optional</span></h3>'
                + '<p class="sub">Paste a proteome as FASTA and every candidate is checked for an exact match in it. A peptide that occurs in the normal '
                + 'proteome is a self peptide however it arose, and the repertoire is already tolerised against it. Exact matches only — a near-match is '
                + 'a real and different signal that needs an alignment, and a naive one-mismatch rule produces more noise than information.</p>'
                + '<textarea data-bind="proteome" rows="4" placeholder="&gt;sp|P01116|RASK_HUMAN&#10;MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL…">' + esc(S.proteome) + '</textarea>'
                + (S.proteome ? '<div class="kv" style="margin-top:8px;"><b>' + S.proteome.replace(/^>.*$/gm, '').replace(/[^A-Za-z]/g, '').length.toLocaleString() + '</b> residues loaded.</div>' : '')
                + '</div>';
        };

        // =====================================================================================
        //  TAB 3 — candidates
        // =====================================================================================
        const COLS = [
            { k: 'peptide', t: 'Peptide', w: '' },
            { k: 'mutation', t: 'From', w: '' },
            { k: 'allele', t: 'Allele', w: '' },
            { k: 'rank', t: 'Rank', w: '' },
            { k: 'wtRank', t: 'WT rank', w: '' },
            { k: 'agretopicity', t: 'Agreto.', w: '' },
            { k: 'effect', t: 'Effect of the mutation', w: '' },
            { k: 'cleavage', t: 'Cleave', w: '' },
            { k: 'tap', t: 'TAP', w: '' },
            { k: 'presentation', t: 'Present.', w: '' },
            { k: 'priority', t: 'Priority', w: '' },
            { k: 'flags', t: 'Flags', w: '' }
        ];

        const visibleCandidates = () => {
            let rows = S.collapsed.slice();
            if (S.filterBinders) rows = rows.filter((r) => r.band !== 'none');
            if (S.filterSelf) rows = rows.filter((r) => r.selfHit !== true);
            const key = S.sortKey, dir = S.sortDir;
            const val = (r) => (key === 'priority') ? EP.priority(r, weights())
                : (key === 'flags') ? ((r.selfHit ? 1 : 0) + (r.glycoSequon ? 1 : 0) + r.cysteines)
                    : r[key];
            rows.sort((a, b) => {
                const x = val(a), y = val(b);
                if (x == null && y == null) return 0;
                if (x == null) return 1;
                if (y == null) return -1;
                if (typeof x === 'string') return dir * x.localeCompare(y);
                return dir * (x - y);
            });
            return rows;
        };

        const renderCandidates = () => {
            if (!S.ran) {
                const usable = S.mutations.filter((m) => checkMutation(m).ok).length;
                body.innerHTML = ''
                    + '<div class="lv-card"><h3>Rank the candidates</h3>'
                    + '<p class="sub">Every peptide of the chosen lengths that overlaps a novel residue is enumerated, then taken through the pathway in order: '
                    + 'can the proteasome release it, will TAP carry it, does it bind one of the subject\'s alleles, and does it bind better than the wild-type '
                    + 'peptide it replaced. Peptides that do not contain the mutation are self peptides and are never enumerated.</p>'
                    + '<div class="kv"><b>' + usable + '</b> usable mutation(s) · <b>' + S.classI.length + '</b> class I allele(s) · <b>' + S.classII.length + '</b> class II allele(s)</div>'
                    + '<div style="margin-top:14px;"><button class="lv-btn go" data-act="run"' + ((usable && (S.classI.length + S.classII.length)) ? '' : ' disabled') + '>Run</button></div>'
                    + (usable ? '' : '<div class="warn" style="margin-top:14px;">Add at least one usable mutation on the previous tab.</div>')
                    + ((S.classI.length + S.classII.length) ? '' : '<div class="warn" style="margin-top:14px;">Select at least one HLA allele on the first tab.</div>')
                    + '</div>';
                return;
            }
            const rows = visibleCandidates();
            const head = COLS.map((c) => '<th data-sort="' + c.k + '">' + esc(c.t) + (S.sortKey === c.k ? (S.sortDir < 0 ? ' ▾' : ' ▴') : '') + '</th>').join('');
            const trs = rows.map((r) => {
                const on = S.selected.indexOf(r.peptide) >= 0;
                const flags = []
                    .concat(r.selfHit === true ? ['<span class="tag bad" title="exact match in the background proteome">self</span>'] : [])
                    .concat(r.cleavageBlocked ? ['<span class="tag bad" title="' + esc(r.cleavageNote) + '">no cut</span>'] : [])
                    .concat(r.glycoSequon ? ['<span class="tag none" title="N-X-S/T sequon">glyco</span>'] : [])
                    .concat(r.cysteines >= 2 ? ['<span class="tag none" title="' + r.cysteines + ' cysteines: oxidation and manufacturing risk">' + r.cysteines + '×C</span>'] : [])
                    .concat(r.alleleConfidence === 'weak' ? ['<span class="tag none" title="the motif for this allele is weakly described">weak motif</span>'] : [])
                    .concat((r.alsoBinds && r.alsoBinds.length) ? ['<span class="tag info" title="' + esc(r.alsoBinds.join(', ')) + '">+' + r.alsoBinds.length + ' allele</span>'] : []);
                return '<tr class="' + (on ? 'sel' : '') + '" data-pep="' + esc(r.peptide) + '">'
                    + '<td><input type="checkbox" data-pick="' + esc(r.peptide) + '"' + (on ? ' checked' : '') + '> <span class="mono">' + esc(r.peptide) + '</span>'
                    + (r.alleleClass === 2 ? '<div style="color:#9fb3c8;font-size:11px;">core ' + esc(r.core) + '</div>' : '') + '</td>'
                    + '<td>' + esc(r.mutation || '—') + '</td>'
                    + '<td>' + esc(r.allele.replace('HLA-', '')) + '<div style="color:#9fb3c8;font-size:10.5px;">class ' + r.alleleClass + ' · ' + esc(r.source) + '</div></td>'
                    + '<td><span class="tag ' + r.band + '">' + rankTxt(r.rank) + '</span></td>'
                    + '<td>' + rankTxt(r.wtRank) + (r.wtPeptide ? '<div class="mono" style="color:#9fb3c8;font-size:10.5px;">' + esc(r.wtPeptide) + '</div>' : '') + '</td>'
                    + '<td>' + (r.agretopicity == null ? '—' : num(r.agretopicity, 2)) + '</td>'
                    + '<td>' + esc(r.effect || '—') + '</td>'
                    + '<td>' + num(r.cleavage, 2) + '</td>'
                    + '<td>' + num(r.tap, 2) + '</td>'
                    + '<td>' + num(r.presentation, 3) + '</td>'
                    + '<td><b>' + num(EP.priority(r, weights()), 3) + '</b></td>'
                    + '<td>' + (flags.join(' ') || '—') + '</td>'
                    + '</tr>';
            }).join('');

            body.innerHTML = ''
                + '<div class="lv-card"><div class="row-act" style="flex-wrap:wrap;gap:10px;">'
                + '<button class="lv-btn" data-act="run">Run again</button>'
                + '<button class="lv-btn" data-act="pick-top" data-n="10">Select the top 10</button>'
                + '<button class="lv-btn" data-act="pick-top" data-n="20">Top 20</button>'
                + '<button class="lv-btn" data-act="clear-pick">Clear selection</button>'
                + '<span style="width:14px;"></span>'
                + '<label style="font:12px Arial;color:#c8d6e6;"><input type="checkbox" data-toggle="filterBinders"' + (S.filterBinders ? ' checked' : '') + '> binders only (rank ≤ 2%)</label>'
                + '<label style="font:12px Arial;color:#c8d6e6;"><input type="checkbox" data-toggle="filterSelf"' + (S.filterSelf ? ' checked' : '') + '> hide proteome matches</label>'
                + '<label style="font:12px Arial;color:#c8d6e6;"><input type="checkbox" data-toggle="useVaf"' + (S.useVaf ? ' checked' : '') + '> weight by allele frequency</label>'
                + '<label style="font:12px Arial;color:#c8d6e6;"><input type="checkbox" data-toggle="useTpm"' + (S.useTpm ? ' checked' : '') + '> weight by expression</label>'
                + '<label style="font:12px Arial;color:#c8d6e6;"><input type="checkbox" data-toggle="useAgretopicity"' + (S.useAgretopicity ? ' checked' : '') + '> demote poor agretopicity</label>'
                + '</div>'
                + '<div class="kv" style="margin-top:10px;"><b>' + rows.length + '</b> shown of ' + S.collapsed.length + ' peptides (' + S.candidates.length + ' peptide-allele pairs) · <b>' + S.selected.length + '</b> selected</div>'
                + '</div>'
                + '<div class="note"><b>Reading the columns.</b> <b>Rank</b> is the percentile against a random background — lower is better, 0.5% and 2% are the '
                + 'conventional strong and weak thresholds. <b>Agreto.</b> is the wild-type rank over the mutant rank: above 1 the mutation improved binding. '
                + '<b>Cleave</b> and <b>TAP</b> are 0–1 heuristics for proteasomal release and transport. <b>Present.</b> combines them with binding; <b>Priority</b> '
                + 'then applies allele frequency, expression and the flags. Sort by any column.</div>'
                + '<div class="scroll"><table class="lv"><thead><tr>' + head + '</tr></thead><tbody>' + (trs || '<tr><td colspan="12" style="padding:24px;color:#9fb3c8;">Nothing passes the current filters.</td></tr>') + '</tbody></table></div>';
        };

        // =====================================================================================
        //  TAB 4 — construct
        // =====================================================================================
        const selectedRows = () => S.selected.map((p) => {
            const hit = S.collapsed.filter((r) => r.peptide === p)[0];
            return hit || { peptide: p, mutation: '', allele: '', rank: null };
        });

        const optGroup = (list, chosen, act) => list.map((x) =>
            '<option value="' + esc(x.id) + '"' + (chosen === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');

        const verifyItems = () => {
            const out = [];
            const L = PRESETS.byId(PRESETS.LEADERS, S.leader);
            const T = PRESETS.byId(PRESETS.TRAILERS, S.trailer);
            const U5 = PRESETS.byId(PRESETS.UTR5, S.utr5);
            const U3 = PRESETS.byId(PRESETS.UTR3, S.utr3);
            for (const x of [L, T, U5, U3]) if (x && x.verify && x.id !== 'none') out.push(x);
            return out;
        };

        const renderConstruct = () => {
            const sel = selectedRows();
            const list = sel.map((r, i) => '<tr>'
                + '<td style="width:34px;color:#9fb3c8;">' + (i + 1) + '</td>'
                + '<td class="mono">' + esc(r.peptide) + '</td>'
                + '<td>' + esc(r.mutation || '—') + '</td>'
                + '<td>' + esc((r.allele || '').replace('HLA-', '')) + '</td>'
                + '<td>' + rankTxt(r.rank) + '</td>'
                + '<td class="row-act">'
                + '<button class="mini" data-act="move" data-dir="-1" data-i="' + i + '">↑</button>'
                + '<button class="mini" data-act="move" data-dir="1" data-i="' + i + '">↓</button>'
                + '<button class="mini danger" data-act="drop" data-i="' + i + '">✕</button>'
                + '</td></tr>').join('');

            const vi = verifyItems();
            const linker = PRESETS.byId(PRESETS.LINKERS, S.linker);

            body.innerHTML = ''
                + '<div class="lv-card"><h3>The epitope string <span class="tag info">' + sel.length + '</span></h3>'
                + '<p class="sub">Order matters: what sits next to what decides whether each epitope is released with the right C-terminus, and whether the seams '
                + 'create binding peptides that exist in no protein anywhere. Both are checked when you build.</p>'
                + (sel.length ? '<div class="scroll" style="max-height:34vh;"><table class="lv"><thead><tr><th></th><th>Peptide</th><th>From</th><th>Allele</th><th>Rank</th><th></th></tr></thead><tbody>' + list + '</tbody></table></div>'
                    : '<div class="warn">Nothing selected. Pick candidates on the previous tab.</div>')
                + (sel.length > 2 ? '<div style="margin-top:12px;"><button class="lv-btn" data-act="order">Search for a better order</button> '
                    + '<span style="color:#9fb3c8;font:12px Arial;">Greedy, not exhaustive — it appends whichever epitope adds the least junctional binding. The final construct is scanned regardless.</span></div>' : '')
                + '</div>'

                + '<div class="lv-card"><h3>Parts</h3>'
                + '<div class="grid3">'
                + '<div><label class="f">Linker between epitopes</label><select data-bind="linker">' + optGroup(PRESETS.LINKERS, S.linker) + '</select>'
                + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc(linker.blurb) + '</div></div>'
                + '<div><label class="f">Leader</label><select data-bind="leader">' + optGroup(PRESETS.LEADERS, S.leader) + '</select>'
                + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc(PRESETS.byId(PRESETS.LEADERS, S.leader).blurb) + '</div></div>'
                + '<div><label class="f">Trailer</label><select data-bind="trailer">' + optGroup(PRESETS.TRAILERS, S.trailer) + '</select>'
                + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc(PRESETS.byId(PRESETS.TRAILERS, S.trailer).blurb) + '</div></div>'
                + '</div>'
                + '<div class="grid4" style="margin-top:16px;">'
                + '<div><label class="f">5ʹ UTR</label><select data-bind="utr5">' + optGroup(PRESETS.UTR5, S.utr5) + '</select></div>'
                + '<div><label class="f">3ʹ UTR</label><select data-bind="utr3">' + optGroup(PRESETS.UTR3, S.utr3) + '</select></div>'
                + '<div><label class="f">Poly(A) tail (nt)</label><input type="number" min="0" max="400" data-bind="polyA" value="' + (S.polyA | 0) + '"></div>'
                + '<div><label class="f">Codon strategy</label><select data-bind="optMode">'
                + ['balanced', 'cai', 'low-u', 'gc-rich'].map((m) => '<option value="' + m + '"' + (S.optMode === m ? ' selected' : '') + '>'
                    + ({ balanced: 'Balanced (sample human usage)', cai: 'Maximum CAI (top codon everywhere)', 'low-u': 'Minimise uridine', 'gc-rich': 'GC-rich wobble' })[m] + '</option>').join('')
                + '</select></div>'
                + '</div>'
                + (vi.length ? '<div class="warn" style="margin-top:16px;"><b>Confirm these before ordering anything.</b> The following parts are reference '
                    + 'sequences that must be checked against their source record: <ul style="margin:8px 0 0 18px;padding:0;">'
                    + vi.map((x) => '<li style="margin-bottom:5px;"><b>' + esc(x.name) + '</b> — ' + esc(x.source || 'source not recorded') + '</li>').join('')
                    + '</ul><label style="display:block;margin-top:10px;"><input type="checkbox" data-toggle="acknowledgedVerify"' + (S.acknowledgedVerify ? ' checked' : '')
                    + '> I have checked these against their source records.</label></div>' : '')
                + '</div>'

                + '<div class="lv-card"><div class="row-act">'
                + '<button class="lv-btn go" data-act="build"' + (sel.length ? '' : ' disabled') + '>Build and check</button>'
                + '<span style="color:#9fb3c8;font:12px Arial;">Assembles the cassette, scans every seam, recomputes release in context, writes the transcript and runs QC.</span>'
                + '</div></div>'
                + (S.built ? renderBuildReport() : '');
        };

        const renderBuildReport = () => {
            const jr = S.junctions || { junctions: [], scanned: 0 };
            const strong = jr.junctions.filter((j) => j.band === 'strong');
            const ctxBad = (S.context || []).filter((c) => c.degraded || c.blocked);
            const stops = (S.qcFindings || []).filter((f) => f.severity === 'stop');
            const warns = (S.qcFindings || []).filter((f) => f.severity === 'warn');
            const notes = (S.qcFindings || []).filter((f) => f.severity === 'note');

            const jrows = jr.junctions.slice(0, 60).map((j) => '<tr>'
                + '<td class="mono">' + esc(j.peptide) + '</td>'
                + '<td>' + esc((j.allele || '').replace('HLA-', '')) + '</td>'
                + '<td><span class="tag ' + j.band + '">' + rankTxt(j.rank) + '</span></td>'
                + '<td>' + esc(j.spans.join('  +  ')) + '</td>'
                + '<td>' + j.at + '</td></tr>').join('');

            const crows = (S.context || []).map((c) => '<tr>'
                + '<td class="mono">' + esc(c.peptide) + '</td>'
                + '<td>' + esc(c.name) + '</td>'
                + '<td>' + esc(c.following) + '</td>'
                + '<td>' + num(c.alone, 2) + '</td>'
                + '<td>' + num(c.inCassette, 2) + '</td>'
                + '<td>' + (c.blocked ? '<span class="tag bad">blocked</span>' : (c.degraded ? '<span class="tag weak">degraded</span>' : '<span class="tag strong">ok</span>'))
                + (c.note ? '<div style="color:#9fb3c8;font-size:11px;">' + esc(c.note) + '</div>' : '') + '</td></tr>').join('');

            return ''
                + '<div class="lv-card"><h3>Junctional epitopes</h3>'
                + '<p class="sub">Peptides that span more than one part of the cassette and bind one of the subject\'s alleles. These sequences exist in no protein — '
                + 'they were created by the act of joining the beads together. They compete with the designed epitopes for presentation and for the response. '
                + '<b>' + jr.scanned.toLocaleString() + '</b> seam-spanning windows were scanned.</p>'
                + (jr.junctions.length
                    ? (strong.length ? '<div class="warn"><b>' + strong.length + '</b> of them bind strongly (rank ≤ 0.5%). Change the linker, or reorder the epitopes, and build again.</div>' : '')
                    + '<div class="scroll" style="max-height:32vh;"><table class="lv"><thead><tr><th>Peptide</th><th>Allele</th><th>Rank</th><th>Spans</th><th>At</th></tr></thead><tbody>' + jrows + '</tbody></table></div>'
                    + (jr.junctions.length > 60 ? '<div class="kv" style="margin-top:8px;">Showing the 60 strongest of ' + jr.junctions.length + '.</div>' : '')
                    : '<div class="note">No seam-spanning peptide binds any of the selected alleles. That is the result you want.</div>')
                + '</div>'

                + '<div class="lv-card"><h3>Is each epitope still released?</h3>'
                + '<p class="sub">The proteasome makes the C-terminal cut, and that cut depends on the residue immediately after the epitope — which in the cassette '
                + 'is the first residue of the next linker, not whatever followed it in the source protein. <b>Alone</b> is the score during selection; '
                + '<b>in cassette</b> is the score in place.</p>'
                + (ctxBad.length ? '<div class="warn"><b>' + ctxBad.length + '</b> epitope(s) are harder to release in the cassette than they were alone. A different linker usually fixes this.</div>' : '')
                + '<div class="scroll" style="max-height:28vh;"><table class="lv"><thead><tr><th>Peptide</th><th>From</th><th>Followed by</th><th>Alone</th><th>In cassette</th><th></th></tr></thead><tbody>' + crows + '</tbody></table></div>'
                + '</div>'

                + '<div class="lv-card"><h3>Transcript checks</h3>'
                + stops.map((f) => '<div class="stop"><b>' + esc(f.what) + '</b><br>' + esc(f.detail) + '</div>').join('')
                + warns.map((f) => '<div class="warn"><b>' + esc(f.what) + '</b><br>' + esc(f.detail) + '</div>').join('')
                + notes.map((f) => '<div class="note"><b>' + esc(f.what) + '</b><br>' + esc(f.detail) + '</div>').join('')
                + (stops.length ? '' : (warns.length ? '' : '<div class="note">Nothing to report.</div>'))
                + '<div style="margin-top:14px;"><button class="lv-btn go" data-act="goto" data-tab="output">See the sequence</button></div>'
                + '</div>';
        };

        // =====================================================================================
        //  TAB 5 — output
        // =====================================================================================
        const coloredCassette = () => {
            if (!S.cassette) return '';
            const cls = { epitope: 'seg-ep', linker: 'seg-lk', leader: 'seg-ld', trailer: 'seg-tr', start: '' };
            return S.cassette.segments.map((s) =>
                '<span class="' + (cls[s.kind] || '') + '" title="' + esc(s.kind + ': ' + s.name) + '">' + esc(s.aa) + '</span>').join('');
        };

        const reportText = () => {
            if (!S.built) return '';
            const L = [];
            const push = (s) => L.push(s == null ? '' : s);
            push('LIVERPOOL NEOANTIGEN DESIGN');
            push('===========================');
            push('Design            : ' + (S.name || '(unnamed)'));
            push('Subject           : ' + (S.patientLabel || '(not given)'));
            push('Written           : ' + new Date().toISOString());
            push('');
            push('HOW THE RANKS WERE PRODUCED');
            push(HLA.hasExternalPredictor()
                ? 'An external trained predictor was connected and produced every rank in this report.'
                : 'Every rank in this report comes from the built-in MOTIF SCREEN: a position-specific score over');
            if (!HLA.hasExternalPredictor()) {
                push('published anchor motifs, expressed as a percentile against a random background. It is NOT a');
                push('trained predictor, it contains no training data, and its ranks are not affinities. This');
                push('shortlist must be re-ranked with a trained predictor before anything is synthesised.');
            }
            push('');
            push('HLA TYPE');
            push('  Class I  : ' + (S.classI.join(', ') || 'none'));
            push('  Class II : ' + (S.classII.join(', ') || 'none'));
            push('');
            push('MUTATIONS');
            for (const m of S.mutations) {
                const v = checkMutation(m);
                push('  ' + (m.gene || '?') + ' ' + (m.change || m.mutantPeptide || '?')
                    + (m.vaf != null ? '  VAF ' + m.vaf : '') + (m.tpm != null ? '  TPM ' + m.tpm : '')
                    + '   [' + (v.ok ? v.how : 'REFUSED: ' + v.message) + ']'
                    + (m.note ? '   // ' + m.note : ''));
            }
            push('');
            push('SELECTED EPITOPES (in cassette order)');
            selectedRows().forEach((r, i) => {
                push('  ' + String(i + 1).padStart(2, ' ') + '. ' + r.peptide.padEnd(24, ' ')
                    + (r.allele || '').replace('HLA-', '').padEnd(10, ' ')
                    + 'rank ' + rankTxt(r.rank).padStart(9, ' ')
                    + '  agreto ' + (r.agretopicity == null ? '—' : r.agretopicity.toFixed(2))
                    + '  ' + (r.effect || '') + '  <- ' + (r.mutation || ''));
            });
            push('');
            push('CASSETTE');
            push('  Linker  : ' + PRESETS.byId(PRESETS.LINKERS, S.linker).name);
            push('  Leader  : ' + PRESETS.byId(PRESETS.LEADERS, S.leader).name);
            push('  Trailer : ' + PRESETS.byId(PRESETS.TRAILERS, S.trailer).name);
            push('  Protein (' + S.cassette.protein.length + ' aa):');
            for (let i = 0; i < S.cassette.protein.length; i += 60) push('    ' + S.cassette.protein.substr(i, 60));
            push('');
            const vi = verifyItems();
            if (vi.length) {
                push('  UNVERIFIED REFERENCE PARTS — confirm before ordering:');
                for (const x of vi) push('    - ' + x.name + ': ' + (x.source || 'source not recorded'));
                push('    Acknowledged by the designer: ' + (S.acknowledgedVerify ? 'yes' : 'NO'));
                push('');
            }
            push('JUNCTIONAL EPITOPES');
            const jr = S.junctions || { junctions: [], scanned: 0 };
            push('  ' + jr.scanned + ' seam-spanning windows scanned; ' + jr.junctions.length + ' bind, of which '
                + jr.junctions.filter((j) => j.band === 'strong').length + ' strongly.');
            for (const j of jr.junctions.slice(0, 25)) {
                push('    ' + j.peptide.padEnd(24, ' ') + (j.allele || '').replace('HLA-', '').padEnd(10, ' ')
                    + rankTxt(j.rank).padStart(9, ' ') + '   ' + j.spans.join(' + '));
            }
            push('');
            push('RELEASE IN CONTEXT');
            for (const c of (S.context || [])) {
                push('    ' + c.peptide.padEnd(24, ' ') + 'followed by ' + String(c.following).padEnd(24, ' ')
                    + 'alone ' + c.alone.toFixed(2) + '  in cassette ' + c.inCassette.toFixed(2)
                    + (c.blocked ? '   BLOCKED' : (c.degraded ? '   DEGRADED' : '')));
            }
            push('');
            push('TRANSCRIPT');
            push('  Codon strategy : ' + S.optMode);
            push('  CDS            : ' + S.built.cds.length + ' nt, CAI ' + GC.cai(S.built.cds).toFixed(3)
                + ', GC ' + (GC.gc(S.built.cds) * 100).toFixed(1) + '%, U ' + (GC.uFraction(S.built.cds) * 100).toFixed(1) + '%');
            push('  Full           : ' + S.built.dna.length + ' nt including a ' + S.built.polyA.length + ' nt poly(A) tail');
            push('');
            push('CHECKS');
            for (const f of (S.qcFindings || [])) push('  [' + f.severity.toUpperCase() + '] ' + f.what + ' — ' + f.detail);
            push('');
            push('SEQUENCE (RNA, 5ʹ→3ʹ)');
            const rna = S.built.rna;
            for (let i = 0; i < rna.length; i += 60) push('  ' + String(i + 1).padStart(6, ' ') + '  ' + rna.substr(i, 60));
            push('');
            if (S.notes) { push('NOTES'); push('  ' + S.notes.replace(/\n/g, '\n  ')); push(''); }
            return L.join('\n');
        };

        const candidateCsv = () => {
            const cols = ['peptide', 'wtPeptide', 'mutation', 'allele', 'alleleClass', 'source', 'rank', 'wtRank',
                'agretopicity', 'effect', 'cleavage', 'tap', 'presentation', 'gravy', 'cysteines',
                'glycoSequon', 'selfHit', 'start', 'length', 'vaf', 'tpm'];
            const q = (v) => {
                if (v == null) return '';
                const s = '' + v;
                return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const lines = [cols.concat(['priority', 'selected']).join(',')];
            for (const r of S.collapsed) {
                lines.push(cols.map((c) => q(r[c])).concat([
                    EP.priority(r, weights()).toFixed(4),
                    S.selected.indexOf(r.peptide) >= 0 ? 'yes' : 'no'
                ]).join(','));
            }
            return lines.join('\n');
        };

        const renderOutput = () => {
            if (!S.built) {
                body.innerHTML = '<div class="lv-card"><h3>Nothing built yet</h3><p class="sub">Select candidates, then build the construct on the previous tab.</p></div>';
                return;
            }
            const vi = verifyItems();
            const blocked = vi.length && !S.acknowledgedVerify;
            const b = S.built;
            body.innerHTML = ''
                + (blocked ? '<div class="warn"><b>Export is held.</b> This construct contains reference parts that have not been confirmed against their '
                    + 'source records: ' + esc(vi.map((x) => x.name).join(', ')) + '. Confirm them on the Construct tab, or choose different parts.</div>' : '')
                + '<div class="lv-card"><h3>Protein cassette <span class="tag info">' + S.cassette.protein.length + ' aa</span></h3>'
                + '<p class="sub"><span class="seg-ld">leader</span> · <span class="seg-ep">epitope</span> · <span class="seg-lk">linker</span> · <span class="seg-tr">trailer</span></p>'
                + '<div class="seq">' + coloredCassette() + '</div></div>'

                + '<div class="lv-card"><h3>Coding sequence <span class="tag info">' + b.cds.length + ' nt</span></h3>'
                + '<div class="kv"><b>CAI</b> ' + GC.cai(b.cds).toFixed(3) + ' &nbsp; <b>GC</b> ' + (GC.gc(b.cds) * 100).toFixed(1) + '% &nbsp; <b>U</b> ' + (GC.uFraction(b.cds) * 100).toFixed(1) + '% &nbsp; <b>strategy</b> ' + esc(S.optMode) + '</div>'
                + '<div class="seq" style="margin-top:10px;">' + esc(GC.toRna(b.cds)) + '</div></div>'

                + '<div class="lv-card"><h3>Full transcript <span class="tag info">' + b.dna.length + ' nt</span></h3>'
                + '<p class="sub">5ʹ UTR (' + b.utr5.length + ') · Kozak (' + b.kozak.length + ') · CDS (' + b.cds.length + ') · stops (' + b.stops.length + ') · 3ʹ UTR (' + b.utr3.length + ') · poly(A) (' + b.polyA.length + ')</p>'
                + '<div class="seq">' + esc(b.rna) + '</div></div>'

                + '<div class="lv-card"><h3>Take it away</h3>'
                + '<div class="row-act" style="flex-wrap:wrap;gap:9px;">'
                + '<button class="lv-btn go" data-act="dl-report"' + (blocked ? ' disabled' : '') + '>Design report (.txt)</button>'
                + '<button class="lv-btn" data-act="dl-fasta"' + (blocked ? ' disabled' : '') + '>Transcript (.fasta)</button>'
                + '<button class="lv-btn" data-act="dl-csv">Candidates (.csv)</button>'
                + '<button class="lv-btn" data-act="copy-rna"' + (blocked ? ' disabled' : '') + '>Copy the RNA</button>'
                + '<button class="lv-btn" data-act="save">Save the design</button>'
                + '</div>'
                + '<div style="margin-top:16px;"><label class="f">Notes for the record</label>'
                + '<textarea data-bind="notes" rows="3" placeholder="Anything the next person reading this file needs to know.">' + esc(S.notes) + '</textarea></div>'
                + '</div>'

                + '<div class="lv-card"><h3>The report as it will be written</h3>'
                + '<div class="seq" style="max-height:44vh;overflow:auto;white-space:pre;">' + esc(reportText()) + '</div></div>';
        };

        // =====================================================================================
        //  actions
        // =====================================================================================
        const render = () => {
            if (tab === 'patient') renderPatient();
            else if (tab === 'mutations') renderMutations();
            else if (tab === 'candidates') renderCandidates();
            else if (tab === 'construct') renderConstruct();
            else renderOutput();
            const sub = $('#lv-sub');
            if (sub) sub.textContent = (S.name || 'Untitled design')
                + ' · ' + (S.classI.length + S.classII.length) + ' allele(s) · ' + S.mutations.length + ' mutation(s) · '
                + S.selected.length + ' epitope(s) selected';
        };

        const download = (name, text, mime) => {
            try {
                const blob = new Blob([text], { type: mime || 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { try { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); } catch (e) { } }, 500);
                say('Wrote ' + name + '.');
            } catch (e) {
                say('This browser would not start the download: ' + (e && e.message ? e.message : e), 'warn');
            }
        };

        // Protein by symbol, Ensembl id or UniProt accession. Every path is a documented
        // public endpoint and the failure of each is reported rather than swallowed --
        // an empty sequence box with no explanation is the worst outcome here.
        const fetchProtein = async (query) => {
            const q = ('' + (query || '')).trim();
            if (!q) return { ok: false, message: 'nothing to look up' };
            const get = async (url, asText) => {
                const r = await fetch(url, { headers: { 'Accept': asText ? 'text/plain' : 'application/json' } });
                if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url.split('/')[2]);
                return asText ? await r.text() : await r.json();
            };
            try {
                if (/^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/i.test(q)) {
                    const fa = await get('https://rest.uniprot.org/uniprotkb/' + encodeURIComponent(q.toUpperCase()) + '.fasta', true);
                    const seq = fa.replace(/^>.*$/m, '').replace(/[^A-Za-z]/g, '').toUpperCase();
                    if (seq) return { ok: true, seq: seq, from: 'UniProt ' + q.toUpperCase() };
                    return { ok: false, message: 'UniProt returned no sequence for ' + q };
                }
                let id = q;
                if (!/^ENS[A-Z]*[GTP][0-9]+/i.test(q)) {
                    const look = await get('https://rest.ensembl.org/lookup/symbol/homo_sapiens/' + encodeURIComponent(q) + '?content-type=application/json');
                    id = (look && (look.canonical_transcript || look.id)) || '';
                    if (!id) return { ok: false, message: 'Ensembl does not know the symbol ' + q };
                    id = ('' + id).split('.')[0];
                }
                const r = await get('https://rest.ensembl.org/sequence/id/' + encodeURIComponent(id) + '?type=protein;content-type=application/json');
                const seq = (r && (r.seq || (Array.isArray(r) && r[0] && r[0].seq))) || '';
                if (!seq) return { ok: false, message: 'Ensembl returned no protein sequence for ' + id };
                return { ok: true, seq: ('' + seq).toUpperCase().replace(/\*+$/, ''), from: 'Ensembl ' + id };
            } catch (e) {
                return { ok: false, message: (e && e.message) ? e.message : ('' + e) };
            }
        };

        const runPipeline = async () => {
            const usable = S.mutations.map((m) => ({ m: m, v: checkMutation(m) })).filter((x) => x.v.ok);
            if (!usable.length) { say('No usable mutation to run.', 'warn'); return; }
            const alleles = S.classI.concat(S.classII);
            if (!alleles.length) { say('Select at least one HLA allele first.', 'warn'); return; }

            const spin = await exec('baja/lib/work-spinner.js', 'Ranking candidates…');
            S.candidates = [];
            try {
                let n = 0;
                for (const x of usable) {
                    n++;
                    const a = x.v.applied;
                    const label = ((x.m.gene ? x.m.gene + ' ' : '') + (x.m.change || 'peptide')).trim();
                    try { spin.text('Ranking ' + label + ' (' + n + ' of ' + usable.length + ')…'); } catch (e) { }
                    if (a.novelTo <= a.novelFrom) continue;              // a stop creates nothing to enumerate
                    const lengths = [];
                    if (S.classI.length) for (const L of S.lengthsI) lengths.push(L);
                    if (S.classII.length) for (const L of S.lengthsII) if (lengths.indexOf(L) < 0) lengths.push(L);
                    const rows = await EP.run({
                        mutant: a.mutant, wt: a.wt, novelFrom: a.novelFrom, novelTo: a.novelTo, aligned: a.aligned,
                        alleles: alleles, lengths: lengths, label: label,
                        vaf: (typeof x.m.vaf === 'number') ? x.m.vaf : null,
                        tpm: (typeof x.m.tpm === 'number') ? x.m.tpm : null,
                        proteome: S.proteome,
                        onProgress: (p) => { try { spin.progress(Math.round(((n - 1) + p / 100) / usable.length * 100)); } catch (e) { } }
                    });
                    S.candidates = S.candidates.concat(rows);
                }
                // A class II allele is only ever scored against the class II lengths, and a
                // class I allele against the class I lengths. Mixing them produces rows that
                // are arithmetically fine and biologically meaningless.
                S.candidates = S.candidates.filter((r) => (r.alleleClass === 1)
                    ? S.lengthsI.indexOf(r.length) >= 0
                    : S.lengthsII.indexOf(r.length) >= 0);
                S.collapsed = EP.collapse(S.candidates, weights());
                S.ran = true;
                say('Ranked ' + S.collapsed.length + ' peptides from ' + usable.length + ' mutation(s) across '
                    + alleles.length + ' allele(s). ' + S.collapsed.filter((r) => r.band !== 'none').length + ' bind.');
            } catch (e) {
                say('The run failed: ' + (e && e.message ? e.message : e), 'stop');
                step('run failed: ' + e);
            } finally {
                try { spin.stop(); } catch (e) { }
            }
            render();
        };

        const buildConstruct = async () => {
            const sel = selectedRows();
            if (!sel.length) { say('Select some epitopes first.', 'warn'); return; }
            const spin = await exec('baja/lib/work-spinner.js', 'Building…');
            try {
                const linker = PRESETS.byId(PRESETS.LINKERS, S.linker);
                const leader = PRESETS.byId(PRESETS.LEADERS, S.leader);
                const trailer = PRESETS.byId(PRESETS.TRAILERS, S.trailer);
                const spec = {
                    epitopes: sel.map((r) => ({ peptide: r.peptide, name: r.mutation || r.peptide, meta: r })),
                    linker: linker.aa, linkerName: linker.name,
                    leader: leader.aa, leaderName: leader.name,
                    trailer: trailer.aa, trailerName: trailer.name
                };
                S.cassette = CON.assemble(spec);
                try { spin.text('Scanning every seam…'); } catch (e) { }
                S.junctions = await CON.scanJunctions(S.cassette.protein, S.cassette.segments,
                    S.classI.concat(S.classII), { lengths: S.lengthsI, classIILengths: S.lengthsII });
                S.context = CON.contextCheck(S.cassette.protein, S.cassette.segments);
                try { spin.text('Writing the transcript…'); } catch (e) { }
                S.built = CON.build(S.cassette.protein, {
                    mode: S.optMode,
                    utr5: GC.toDna(PRESETS.byId(PRESETS.UTR5, S.utr5).rna || ''),
                    utr3: GC.toDna(PRESETS.byId(PRESETS.UTR3, S.utr3).rna || ''),
                    polyA: S.polyA | 0
                });
                S.qcFindings = CON.qc(S.built, S.cassette.protein, {});
                const strong = S.junctions.junctions.filter((j) => j.band === 'strong').length;
                say('Built: ' + S.cassette.protein.length + ' aa, ' + S.built.dna.length + ' nt. '
                    + (strong ? (strong + ' strongly-binding junctional epitope(s) — see the report.') : 'No strongly-binding junctional epitope.'),
                    strong ? 'warn' : 'note');
            } catch (e) {
                say('The build failed: ' + (e && e.message ? e.message : e), 'stop');
                step('build failed: ' + e);
            } finally {
                try { spin.stop(); } catch (e) { }
            }
            render();
        };

        // ---- save and open ---------------------------------------------------------------------
        const saveDesign = async () => {
            const name = prompt('Save the design as:', S.name || 'design');
            if (name == null) return;
            const spin = await exec('baja/lib/work-spinner.js', 'Saving…');
            try {
                S.name = ('' + name).replace(/\.liverpool$/i, '');
                const r = await STORE.save(S, '', name);
                if (r.ok) { S.savedPath = r.path || ''; say('Saved ' + r.name + ' to My Files.'); }
                else say('Not saved: ' + r.message, 'warn');
            } catch (e) {
                say('Not saved: ' + (e && e.message ? e.message : e), 'warn');
            } finally { try { spin.stop(); } catch (e) { } render(); }
        };

        const applyDoc = (doc) => {
            const st = STORE.toState(doc);
            S = Object.assign(S, st, { candidates: [], collapsed: [], ran: false, built: null, junctions: null, context: null, qcFindings: null, cassette: null });
            for (const m of S.mutations) { if (!m.id) m.id = nextId++; else nextId = Math.max(nextId, m.id + 1); }
            tab = 'candidates';
            drawTabs();
            say('Opened ' + (doc.name || 'the design') + '. The scores are recomputed rather than read from the file — press Run.');
            render();
        };

        const openDesign = async () => {
            // The application's own file browser, filtered to this editor's files, mounted
            // over the panel rather than replacing it: cancelling leaves the design intact.
            const over = document.createElement('div');
            over.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(3,12,24,0.86);display:flex;align-items:center;justify-content:center;padding:40px;';
            over.innerHTML = '<div style="background:#0a1e3a;border:1px solid rgba(255,255,255,0.14);border-radius:12px;width:min(900px,96vw);max-height:88vh;overflow:hidden;display:flex;flex-direction:column;">'
                + '<div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;gap:12px;">'
                + '<b style="font:700 15px Arial;color:#fff;">Open a design</b>'
                + '<span style="font:12px Arial;color:#9fb3c8;">Files ending in .liverpool</span>'
                + '<button id="lv-open-cancel" class="lv-btn" style="margin-left:auto;">Cancel</button></div>'
                + '<div id="lv-open-body" style="flex:1 1 auto;overflow:auto;padding:12px;"><div style="color:#9fb3c8;font:13px Arial;padding:20px 20px 12px;">Paste the path of a saved design, or browse for one.</div>'
                + '<div style="display:flex;gap:8px;padding:0 20px 14px;"><input type="text" id="lv-open-path" placeholder="/…/design.liverpool" style="flex:1 1 auto;background:#071a30;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:7px;padding:9px 11px;font:13px Arial;">'
                + '<button id="lv-open-go" class="lv-btn go">Open</button></div>'
                + '<div style="padding:0 20px 20px;color:#9fb3c8;font:12.5px/1.6 Arial;">Or <button id="lv-open-browse" class="lv-btn" style="padding:6px 12px;">browse My Files</button> — that leaves this design, so save it first.</div>'
                + '</div></div>';
            document.body.appendChild(over);
            const close = () => { try { over.parentNode.removeChild(over); } catch (e) { } };
            over.querySelector('#lv-open-cancel').onclick = close;
            over.querySelector('#lv-open-go').onclick = async () => {
                const p = ('' + over.querySelector('#lv-open-path').value).trim();
                if (!p) return;
                close();
                const spin = await exec('baja/lib/work-spinner.js', 'Opening…');
                try {
                    const r = await STORE.open(p);
                    if (r.ok) applyDoc(r.doc); else say('Could not open it: ' + r.message, 'warn');
                } catch (e) { say('Could not open it: ' + (e && e.message ? e.message : e), 'warn'); }
                finally { try { spin.stop(); } catch (e) { } }
            };

            // The application's own file browser is a layout widget and cannot be mounted
            // inside a fixed overlay, so browsing means leaving this design. That is said
            // plainly and confirmed rather than done quietly -- an unsaved design is the
            // most expensive thing in this editor to lose.
            over.querySelector('#lv-open-browse').onclick = () => {
                const dirty = S.mutations.length || S.selected.length;
                if (dirty && !confirm('Browsing My Files leaves this design. Anything unsaved is lost. Continue?')) return;
                close();
                try { panel.parentNode.removeChild(panel); } catch (e2) { }
                try { clear(); } catch (e2) { }
                showWidget({
                    wid: 'card', height: '100%', width: '100%',
                    data: {
                        cards: [[
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: '<div style="padding:14px 16px;font:14px Arial;"><b>Open a neoantigen design</b>'
                                        + '<div style="color:#5b6b7a;margin-top:4px;">Files ending in .liverpool. '
                                        + 'Anything else opens in the editor it belongs to.</div></div>'
                                }
                            },
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'simple-file-browser', width: '100%', height: '100%',
                                    data: {
                                        width: '100%', columns: 3, showSearch: true,
                                        drive: 'user', user: getUser(), root: '/' + getUser(),
                                        filetype: '.liverpool',
                                        'ionfunction.cmd': createIonFunction(() => { }),
                                        'ionfunction.path': createIonFunction(() => { }),
                                        'ionfunction.openfile': createIonFunction(() => { }),
                                        'ionfunction.fileClick': createIonFunction(async (element) => {
                                            try { clear(); } catch (e2) { }
                                            window.history.pushState({ 'liverpool': element.path }, 'liverpool',
                                                `/app/liverpool/editor?path=${element.path}`);
                                            exec('liverpool/editor', element.path);
                                        })
                                    }
                                }
                            }
                        ]]
                    }
                });
            };
        };

        // ---- event handling ---------------------------------------------------------------------
        panel.addEventListener('click', async (e) => {
            const t = e.target;
            const el = t.closest ? t.closest('[data-act],[data-allele],[data-len],[data-sort]') : null;

            // HLA chip
            const chip = t.closest ? t.closest('[data-allele]') : null;
            if (chip) {
                const a = chip.getAttribute('data-allele');
                const kind = chip.getAttribute('data-kind');
                const arr = (kind === 'I') ? S.classI : S.classII;
                const i = arr.indexOf(a);
                if (i >= 0) arr.splice(i, 1); else arr.push(a);
                S.ran = false;
                render(); return;
            }
            const lenChip = t.closest ? t.closest('[data-len]') : null;
            if (lenChip) {
                const L = +lenChip.getAttribute('data-len');
                const arr = (lenChip.getAttribute('data-lenkind') === 'I') ? S.lengthsI : S.lengthsII;
                const i = arr.indexOf(L);
                if (i >= 0) arr.splice(i, 1); else arr.push(L);
                arr.sort((x, y) => x - y);
                S.ran = false;
                render(); return;
            }
            const th = t.closest ? t.closest('[data-sort]') : null;
            if (th) {
                const k = th.getAttribute('data-sort');
                if (S.sortKey === k) S.sortDir = -S.sortDir;
                else { S.sortKey = k; S.sortDir = (k === 'rank' || k === 'wtRank') ? 1 : -1; }
                render(); return;
            }

            if (!el) return;
            const act = el.getAttribute('data-act');
            if (!act) return;

            if (act === 'close') {
                // Confirm before leaving. This editor holds work that lives only in the page until
                // it is saved, so closing is destructive and is treated as such. The dialog stacks
                // above the editor and defaults to staying.
                let __leave = true;
                try {
                    __leave = await exec('baja/lib/confirm-leave.js', {
                        title: 'Close the neoantigen designer?',
                        message: 'Anything you have not saved will be lost.',
                        confirmLabel: 'Close without saving'
                    });
                } catch (e2) {
                    // A dialog that failed to appear must not become a silent discard.
                    __leave = false;
                }
                if (!__leave) return;
                // Back to the home screen, not to whatever happens to be underneath. The
                // launcher clears the page before it opens an editor, so removing this
                // overlay on its own leaves the user on a blank screen. baja/init.js does
                // its own clear() and pushes its own URL, so there is nothing to undo here
                // first. The panel comes down before the navigation either way -- if the
                // home screen fails to build, the user is still out of the editor rather
                // than trapped in it.
                try { panel.parentNode.removeChild(panel); } catch (e2) { }
                try { await exec('baja/init'); }
                catch (e2) { step('returning to the home screen failed: ' + e2); }
                return;
            }
            if (act === 'goto') { tab = el.getAttribute('data-tab'); drawTabs(); render(); return; }
            if (act === 'save') { await saveDesign(); return; }
            if (act === 'open') { await openDesign(); return; }
            if (act === 'add-allele') {
                const kind = el.getAttribute('data-kind');
                const input = $(kind === 'I' ? '#lv-add-i' : '#lv-add-ii');
                const raw = input ? ('' + input.value).trim() : '';
                if (!raw) return;
                const norm = HLA.normalise(raw);
                const arr = (kind === 'I') ? S.classI : S.classII;
                if (!HLA.known(norm)) {
                    say(norm + ' has no motif in this tool, so it cannot be scored. Add it anyway only if an external '
                        + 'predictor is connected — otherwise every peptide against it will come back at rank 100%.', 'warn');
                }
                if (arr.indexOf(norm) < 0) arr.push(norm);
                S.ran = false;
                render(); return;
            }
            if (act === 'add-mut') { S.mutations.push(blankMutation()); render(); return; }
            if (act === 'del-mut') {
                const card = el.closest('[data-mut]');
                const id = +card.getAttribute('data-mut');
                S.mutations = S.mutations.filter((m) => m.id !== id);
                S.ran = false; render(); return;
            }
            if (act === 'paste-muts') {
                const txt = prompt('One mutation per line: GENE change [VAF] [TPM]\n\nFor example:\n  KRAS p.G12D 0.35 120\n  TP53 p.R273H\n\nProtein sequences are fetched or pasted per row afterwards.');
                if (!txt) return;
                for (const line of ('' + txt).split(/\r?\n/)) {
                    const parts = line.trim().split(/\s+/).filter(Boolean);
                    if (!parts.length) continue;
                    const m = blankMutation();
                    m.gene = parts[0] || '';
                    m.change = parts[1] || '';
                    if (parts[2] != null && !isNaN(+parts[2])) m.vaf = +parts[2];
                    if (parts[3] != null && !isNaN(+parts[3])) m.tpm = +parts[3];
                    S.mutations.push(m);
                }
                S.ran = false; render(); return;
            }
            if (act === 'fetch-protein') {
                const card = el.closest('[data-mut]');
                const id = +card.getAttribute('data-mut');
                const m = S.mutations.filter((x) => x.id === id)[0];
                const q = card.querySelector('[data-mfetch]').value;
                el.textContent = '…';
                const r = await fetchProtein(q);
                if (r.ok) { m.protein = r.seq; say('Loaded ' + r.seq.length + ' residues from ' + r.from + '.'); }
                else say('Could not fetch it: ' + r.message, 'warn');
                render(); return;
            }
            if (act === 'run') { await runPipeline(); return; }
            if (act === 'pick-top') {
                const n = +el.getAttribute('data-n');
                S.selected = visibleCandidates().slice(0, n).map((r) => r.peptide);
                render(); return;
            }
            if (act === 'clear-pick') { S.selected = []; render(); return; }
            if (act === 'move') {
                const i = +el.getAttribute('data-i'), d = +el.getAttribute('data-dir');
                const j = i + d;
                if (j < 0 || j >= S.selected.length) return;
                const tmp = S.selected[i]; S.selected[i] = S.selected[j]; S.selected[j] = tmp;
                render(); return;
            }
            if (act === 'drop') { S.selected.splice(+el.getAttribute('data-i'), 1); render(); return; }
            if (act === 'order') {
                const spin = await exec('baja/lib/work-spinner.js', 'Searching orderings…');
                try {
                    const linker = PRESETS.byId(PRESETS.LINKERS, S.linker);
                    const ordered = await CON.orderEpitopes(
                        selectedRows().map((r) => ({ peptide: r.peptide, name: r.mutation || r.peptide })),
                        { linker: linker.aa, linkerName: linker.name },
                        S.classI.concat(S.classII),
                        (p) => { try { spin.progress(p); } catch (e) { } });
                    S.selected = ordered.map((x) => x.peptide);
                    say('Reordered. Build again to see what it did to the seams.');
                } catch (e) { say('The search failed: ' + (e && e.message ? e.message : e), 'warn'); }
                finally { try { spin.stop(); } catch (e) { } render(); }
                return;
            }
            if (act === 'build') { await buildConstruct(); return; }
            if (act === 'dl-report') { download((S.name || 'design') + '.liverpool-report.txt', reportText()); return; }
            if (act === 'dl-fasta') {
                const n = (S.name || 'design').replace(/\s+/g, '_');
                download(n + '.fasta',
                    CON.fasta(n + '_transcript_RNA', S.built.rna)
                    + CON.fasta(n + '_transcript_DNA', S.built.dna)
                    + CON.fasta(n + '_CDS_DNA', S.built.cds)
                    + CON.fasta(n + '_cassette_protein', S.cassette.protein));
                return;
            }
            if (act === 'dl-csv') { download((S.name || 'design') + '.candidates.csv', candidateCsv(), 'text/csv'); return; }
            if (act === 'copy-rna') {
                try { await navigator.clipboard.writeText(S.built.rna); say('The RNA sequence is on the clipboard.'); }
                catch (e2) { say('The browser would not give access to the clipboard. Use the FASTA download instead.', 'warn'); }
                return;
            }
        });

        // Text inputs, textareas, selects and checkboxes, by delegation.
        panel.addEventListener('change', (e) => {
            const t = e.target;
            const bind = t.getAttribute && t.getAttribute('data-bind');
            if (bind) {
                let v = t.value;
                if (t.type === 'number') v = (v === '') ? null : +v;
                S[bind] = v;
                if (bind === 'proteome' || bind === 'optMode') S.built = null;
                if (['linker', 'leader', 'trailer', 'utr5', 'utr3', 'polyA', 'optMode'].indexOf(bind) >= 0) { S.built = null; render(); }
                return;
            }
            const tog = t.getAttribute && t.getAttribute('data-toggle');
            if (tog) { S[tog] = !!t.checked; render(); return; }
            const pick = t.getAttribute && t.getAttribute('data-pick');
            if (pick) {
                const i = S.selected.indexOf(pick);
                if (t.checked && i < 0) S.selected.push(pick);
                else if (!t.checked && i >= 0) S.selected.splice(i, 1);
                S.built = null;
                const tr = t.closest('tr'); if (tr) tr.className = t.checked ? 'sel' : '';
                const sub = $('#lv-sub');
                if (sub) sub.textContent = (S.name || 'Untitled design') + ' · ' + (S.classI.length + S.classII.length)
                    + ' allele(s) · ' + S.mutations.length + ' mutation(s) · ' + S.selected.length + ' epitope(s) selected';
                return;
            }
            const mf = t.getAttribute && t.getAttribute('data-mfield');
            if (mf) {
                const card = t.closest('[data-mut]');
                if (!card) return;
                const id = +card.getAttribute('data-mut');
                const m = S.mutations.filter((x) => x.id === id)[0];
                if (!m) return;
                m[mf] = (t.type === 'number') ? (t.value === '' ? null : +t.value) : t.value;
                S.ran = false;
                render();
                return;
            }
        });

        // ---- go ------------------------------------------------------------------------------
        drawTabs();
        render();
        step('open');

        if (path && /\.liverpool$/i.test('' + path)) {
            const spin = await exec('baja/lib/work-spinner.js', 'Opening…');
            try {
                const r = await STORE.open('' + path);
                if (r.ok) applyDoc(r.doc); else say('Could not open that file: ' + r.message, 'warn');
            } catch (e) { say('Could not open that file: ' + (e && e.message ? e.message : e), 'warn'); }
            finally { try { spin.stop(); } catch (e) { } }
        }

        // Subscriber-only. A non-subscriber gets everything above -- laid out, populated,
        // and inert -- behind a notice. Mounted LAST so the interface it covers is the real
        // one rather than an empty shell. Fails open; see baja/lib/subscription-gate.js.
        try {
            await exec('baja/lib/subscription-gate.js', {
                panel: panel,
                name: 'Neoantigen designer',
                what: 'Designing neoantigen cassettes, and the mRNA that carries them,'
            });
        } catch (e) { step('subscription gate did not run: ' + (e && e.message ? e.message : e)); }

        return {
            state: () => S,
            setState: (o) => { S = Object.assign(S, o || {}); render(); },
            // Dispose only. The Close BUTTON returns to the home screen; a programmatic
            // caller tearing the editor down is not necessarily asking to navigate.
            close: () => { try { panel.parentNode.removeChild(panel); } catch (e) { } }
        };
    })();
}
