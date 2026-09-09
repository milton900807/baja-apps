function (path, config) {

    // TOTTENHAM — the mRNA designer.
    //
    // Design a transcript that survives long enough to do its job, and choose whether it
    // should copy itself. Two questions, and they interact: nearly everything that extends a
    // conventional mRNA's life is unavailable to a replicon, and the reason a replicon is
    // worth the trouble is that it does not need those things.
    //
    // Six tabs, in the order the decisions actually get made:
    //
    //   1  Payload      what protein, and which architecture
    //   2  Half-life    the codon and element work, and what it bought
    //   3  Replicon     the amplification machinery and the rules it imposes
    //   4  Models       every number in the editor comes from a registered model, and this
    //                   is where they are listed, run and replaced
    //   5  Assembly     build the molecules and check them
    //   6  Output       sequences, report, exports
    //
    // A sibling of manchester/ and liverpool/ in the same application. Manchester designs
    // oligonucleotides against a transcript; Liverpool designs what a transcript should
    // encode; this designs the transcript itself. It borrows liverpool/lib/genetic-code.js,
    // which is the shared sequence layer and has no immunology or half-life logic in it.
    //
    //   exec('tottenham/editor')                        a new design
    //   exec('tottenham/editor', '/…/design.tottenham') an existing one

    if (Array.isArray(path)) path = path[0];

    return (async () => {

        const ID = 'tottenham-editor';
        const step = (m) => { try { console.log('[tottenham] ' + m); } catch (e) { } };

        const GC = await exec('liverpool/lib/genetic-code.js');
        const EL = await exec('tottenham/lib/elements.js');
        const ST = await exec('tottenham/lib/structure.js');
        const OPT = await exec('tottenham/lib/optimiser.js');
        const REP = await exec('tottenham/lib/replicon.js');
        const MOD = await exec('tottenham/lib/models.js');
        const PARTS = await exec('tottenham/lib/parts.js');
        const STORE = await exec('tottenham/io/store.js');

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const num = (v, d) => (v == null || isNaN(v)) ? '—' : (+v).toFixed(d == null ? 2 : d);
        const pctOf = (v, d) => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%';
        const commas = (n) => (n == null) ? '—' : (+n).toLocaleString();

        // ---- state -----------------------------------------------------------------------------
        let S = {
            name: '', label: '',
            architecture: 'conventional', backbone: 'none',
            protein: '', cdsInput: '', optimisedCds: '',
            capType: 'cap1', nucleoside: 'm1psi',
            utr5: 'hbb', utr3: 'hba', utr5Custom: '', utr3Custom: '',
            polyA: 120, polyAStyle: 'segmented', kozak: true, stops: true,
            optimisePreset: 'stability', gcTarget: null, sgpOverlap: REP.DEFAULT_SGP_OVERLAP,
            cse5: '', sgp: '', replicase: '', cse3: '',
            detargeting: [], detargetCopies: 3,
            acknowledgedVerify: false, notes: '',
            // computed
            opt: null, scan: null, structure: null, assembly: null, qc: null, models: null
        };
        let tab = 'payload';

        // ---- panel -------------------------------------------------------------------------------
        try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        if (!document.getElementById('tottenham-style')) {
            const st = document.createElement('style');
            st.id = 'tottenham-style';
            st.textContent = [
                '#' + ID + ' *{box-sizing:border-box;}',
                '#' + ID + ' button{font-family:Arial,Helvetica,sans-serif;cursor:pointer;}',
                '#' + ID + ' .tt-btn{border-radius:8px;padding:8px 14px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;}',
                '#' + ID + ' .tt-btn:hover{background:rgba(255,255,255,0.10);}',
                '#' + ID + ' .tt-btn.go{border-color:#22c55e;background:#22c55e;color:#04210f;}',
                '#' + ID + ' .tt-btn.go:hover{filter:brightness(1.1);}',
                '#' + ID + ' .tt-btn[disabled]{opacity:0.4;cursor:not-allowed;}',
                '#' + ID + ' .tt-tab{padding:10px 15px;font:600 13px Arial;color:#9fb3c8;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;}',
                '#' + ID + ' .tt-tab.on{color:#fff;border-bottom-color:#22c55e;}',
                '#' + ID + ' .tt-tab .n{display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:rgba(255,255,255,0.12);font:700 11px Arial;margin-right:7px;}',
                '#' + ID + ' .tt-card{background:#0a1e3a;border:1px solid rgba(255,255,255,0.10);border-radius:10px;padding:16px 18px;margin:0 0 16px;}',
                '#' + ID + ' .tt-card h3{margin:0 0 4px;font:700 15px Arial;color:#fff;}',
                '#' + ID + ' .tt-card p.sub{margin:0 0 14px;font:12.5px/1.55 Arial;color:#9fb3c8;}',
                '#' + ID + ' label.f{display:block;font:600 11.5px Arial;color:#9fb3c8;margin:0 0 5px;}',
                '#' + ID + ' input[type=text],#' + ID + ' input[type=number],#' + ID + ' textarea,#' + ID + ' select{width:100%;background:#071a30;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:7px;padding:8px 10px;font:13px Arial;}',
                '#' + ID + ' textarea{font:12px/1.5 "SF Mono",Menlo,Consolas,monospace;resize:vertical;}',
                '#' + ID + ' .chip{display:inline-block;margin:0 6px 6px 0;padding:6px 11px;border-radius:16px;font:600 12px Arial;cursor:pointer;border:1px solid rgba(255,255,255,0.18);color:#c8d6e6;user-select:none;}',
                '#' + ID + ' .chip.on{background:#1d4ed8;border-color:#3b82f6;color:#fff;}',
                '#' + ID + ' table.tt{width:100%;border-collapse:collapse;font:12px Arial;}',
                '#' + ID + ' table.tt th{position:sticky;top:0;background:#0b2545;color:#9fb3c8;font:600 11px Arial;text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,0.14);z-index:2;}',
                '#' + ID + ' table.tt td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#dbe6f3;vertical-align:top;}',
                '#' + ID + ' .tag{display:inline-block;padding:2px 7px;border-radius:5px;font:700 10.5px Arial;}',
                '#' + ID + ' .tag.good{background:#14532d;color:#86efac;}',
                '#' + ID + ' .tag.mid{background:#3f3f16;color:#fde68a;}',
                '#' + ID + ' .tag.bad{background:#4c1d24;color:#fca5a5;}',
                '#' + ID + ' .tag.info{background:#12324f;color:#9ecbff;}',
                '#' + ID + ' .note{border-left:3px solid #3b82f6;background:rgba(59,130,246,0.08);padding:11px 14px;border-radius:0 8px 8px 0;font:12.5px/1.6 Arial;color:#c8d9ec;margin:0 0 12px;}',
                '#' + ID + ' .warn{border-left:3px solid #f59e0b;background:rgba(245,158,11,0.09);padding:11px 14px;border-radius:0 8px 8px 0;font:12.5px/1.6 Arial;color:#fbd38d;margin:0 0 12px;}',
                '#' + ID + ' .stop{border-left:3px solid #ef4444;background:rgba(239,68,68,0.10);padding:11px 14px;border-radius:0 8px 8px 0;font:12.5px/1.6 Arial;color:#fca5a5;margin:0 0 12px;}',
                '#' + ID + ' .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}',
                '#' + ID + ' .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}',
                '#' + ID + ' .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}',
                '@media (max-width:980px){#' + ID + ' .grid2,#' + ID + ' .grid3,#' + ID + ' .grid4{grid-template-columns:1fr;}}',
                '#' + ID + ' .scroll{overflow:auto;max-height:46vh;border:1px solid rgba(255,255,255,0.10);border-radius:9px;}',
                '#' + ID + ' .seq{word-break:break-all;font:12px/1.7 "SF Mono",Menlo,Consolas,monospace;color:#cfe0f2;background:#071a30;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 14px;}',
                '#' + ID + ' .kv{display:flex;gap:8px;font:12px Arial;color:#9fb3c8;padding:3px 0;}',
                '#' + ID + ' .kv b{color:#e8f0fb;}',
                '#' + ID + ' .metric{background:#071a30;border:1px solid rgba(255,255,255,0.12);border-radius:9px;padding:12px 14px;}',
                '#' + ID + ' .metric .big{font:700 22px Arial;color:#fff;}',
                '#' + ID + ' .metric .lbl{font:600 11px Arial;color:#9fb3c8;margin-bottom:5px;}',
                '#' + ID + ' .metric .delta{font:12px Arial;}',
                '#' + ID + ' .bar{height:7px;border-radius:4px;background:rgba(255,255,255,0.10);overflow:hidden;margin-top:8px;}',
                '#' + ID + ' .bar > i{display:block;height:100%;background:#22c55e;}',
                '#' + ID + ' .mini{border-radius:6px;padding:4px 9px;font:700 11px Arial;border:1px solid rgba(255,255,255,0.20);background:transparent;color:#dbe6f3;}',
                '#' + ID + ' .seg-cds{color:#86efac;}#' + ID + ' .seg-utr{color:#93c5fd;}',
                '#' + ID + ' .seg-rep{color:#fbbf24;}#' + ID + ' .seg-cse{color:#c4b5fd;}',
                '#' + ID + ' .seg-pa{color:#94a3b8;}#' + ID + ' .seg-sgp{color:#f9a8d4;}'
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
            + '    <div style="font:700 19px Arial;">Tottenham <span style="color:#9fb3c8;font-weight:400;">· mRNA designer</span></div>'
            + '    <div id="tt-sub" style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Half-life, and whether the transcript should copy itself.</div>'
            + '  </div>'
            + '  <div style="margin-left:auto;display:flex;gap:9px;">'
            + '    <button class="tt-btn" data-act="open">Open</button>'
            + '    <button class="tt-btn" data-act="save">Save</button>'
            + '    <button class="tt-btn" data-act="close">Close</button>'
            + '  </div>'
            + '</div>'
            + '<div id="tt-tabs" style="flex:0 0 auto;display:flex;gap:2px;padding:0 16px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.10);overflow-x:auto;"></div>'
            + '<div id="tt-msg" style="flex:0 0 auto;"></div>'
            + '<div id="tt-body" style="flex:1 1 auto;overflow:auto;padding:20px 22px 40px;"></div>';
        document.body.appendChild(panel);

        const $ = (s) => panel.querySelector(s);
        const body = $('#tt-body');
        const msgBar = $('#tt-msg');
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

        const TABS = [
            { id: 'payload', n: 1, label: 'Payload' },
            { id: 'halflife', n: 2, label: 'Half-life' },
            { id: 'replicon', n: 3, label: 'Replicon' },
            { id: 'models', n: 4, label: 'Models' },
            { id: 'assembly', n: 5, label: 'Assembly' },
            { id: 'output', n: 6, label: 'Output' }
        ];
        const drawTabs = () => {
            $('#tt-tabs').innerHTML = TABS.map((t) =>
                '<div class="tt-tab' + (tab === t.id ? ' on' : '') + '" data-tab="' + t.id + '">'
                + '<span class="n">' + t.n + '</span>' + esc(t.label) + '</div>').join('');
        };
        $('#tt-tabs').addEventListener('click', (e) => {
            const el = e.target.closest ? e.target.closest('[data-tab]') : null;
            if (!el) return;
            tab = el.getAttribute('data-tab'); drawTabs(); render();
        });

        // =====================================================================================
        //  derived values
        // =====================================================================================
        // The coding sequence in play: the optimised one if there is one, otherwise whatever
        // was pasted. A design entered as a protein has no CDS until it is optimised, and the
        // editor says so rather than inventing one.
        const workingCds = () => GC.cleanNt(S.optimisedCds || S.cdsInput || '');
        const utr5Seq = () => (S.utr5 === 'custom') ? GC.toDna(GC.cleanNt(S.utr5Custom)) : GC.toDna(GC.cleanNt(PARTS.byId(PARTS.UTR5, S.utr5).rna || ''));
        const utr3Base = () => (S.utr3 === 'custom') ? GC.toDna(GC.cleanNt(S.utr3Custom)) : GC.toDna(GC.cleanNt(PARTS.byId(PARTS.UTR3, S.utr3).rna || ''));

        // Detargeting sites are appended to the 3ʹ UTR, in tandem copies with a short spacer,
        // which is how they are used in practice: one site is leaky, three or four are not.
        const DETARGET_SPACER = 'TTTAA';
        const detargetBlock = () => {
            if (!S.detargeting.length) return '';
            let out = '';
            for (const id of S.detargeting) {
                const mi = EL.MIRNA.filter((m) => m.id === id)[0];
                if (!mi) continue;
                for (let i = 0; i < Math.max(1, S.detargetCopies | 0); i++) out += DETARGET_SPACER + mi.site7 + 'A';
            }
            return out;
        };
        const utr3Seq = () => utr3Base() + detargetBlock();

        const isRep = () => REP.isReplicon(S.architecture);

        // The context every model is handed.
        const buildContext = () => {
            const cds = workingCds();
            const u5 = isRep() ? '' : utr5Seq();
            const u3 = isRep() ? '' : utr3Seq();
            const ctx = {
                utr5: u5, cds: cds, utr3: u3,
                protein: S.protein || (cds ? GC.translate(cds).replace(/\*+$/, '') : ''),
                polyA: S.polyA | 0, capType: S.capType, nucleoside: S.nucleoside,
                architecture: S.architecture
            };
            ctx.scan = EL.scanConstruct({ utr5: u5, cds: cds, utr3: u3 });
            return ctx;
        };

        // =====================================================================================
        //  TAB 1 — payload
        // =====================================================================================
        const renderPayload = () => {
            const cds = workingCds();
            const prot = S.protein || (cds ? GC.translate(cds).replace(/\*+$/, '') : '');
            body.innerHTML = ''
                + '<div class="tt-card"><h3>What is being expressed</h3>'
                + '<p class="sub">Give a protein sequence and the editor writes the coding sequence, or paste a coding sequence you already have and it is checked and re-optimised in place. '
                + 'Either way the protein is never changed by anything downstream.</p>'
                + '<div class="grid2">'
                + '<div><label class="f">Design name</label><input type="text" data-bind="name" value="' + esc(S.name) + '" placeholder="e.g. hEPO conventional v2"></div>'
                + '<div><label class="f">Label for the record</label><input type="text" data-bind="label" value="' + esc(S.label) + '" placeholder="programme, batch, whatever you need to find it by"></div>'
                + '</div>'
                + '<div style="margin-top:14px;"><label class="f">Protein sequence</label>'
                + '<textarea data-bind="protein" rows="4" placeholder="MAKGL… — paste the protein, or fetch it below">' + esc(S.protein) + '</textarea>'
                + '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">'
                + '<input type="text" id="tt-fetch" placeholder="EPO, ENST00000252723 or P01588" style="max-width:320px;">'
                + '<button class="mini" data-act="fetch">Fetch</button>'
                + '<span style="color:#9fb3c8;font:11.5px Arial;">Ensembl for a symbol or ID, UniProt for an accession.</span>'
                + '</div></div>'
                + '<div style="margin-top:14px;"><label class="f">…or an existing coding sequence</label>'
                + '<textarea data-bind="cdsInput" rows="3" placeholder="ATGGCC… — must be in frame and free of internal stops">' + esc(S.cdsInput) + '</textarea></div>'
                + (prot ? '<div class="kv" style="margin-top:10px;"><b>' + commas(prot.length) + '</b> residues'
                    + (cds ? ' · coding sequence <b>' + commas(cds.length) + '</b> nt' + (S.optimisedCds ? ' (optimised)' : ' (as pasted)') : ' · no coding sequence yet — optimise on the Half-life tab')
                    + '</div>' : '')
                + (cds && GC.translate(cds).replace(/\*+$/, '').indexOf('*') >= 0
                    ? '<div class="stop" style="margin-top:12px;">The pasted coding sequence has an internal stop codon. Everything after it would not be translated.</div>' : '')
                + '</div>'

                + '<div class="tt-card"><h3>Architecture</h3>'
                + '<p class="sub">This is the decision everything else follows from. A conventional mRNA gives one transcript’s worth of protein and can use every stability trick available. '
                + 'A replicon copies itself, which cuts the dose by one to two orders of magnitude and takes most of those tricks away.</p>'
                + REP.ARCHITECTURES.map((a) => ''
                    + '<label style="display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid ' + (S.architecture === a.id ? '#3b82f6' : 'rgba(255,255,255,0.12)') + ';border-radius:9px;margin-bottom:10px;cursor:pointer;background:' + (S.architecture === a.id ? 'rgba(59,130,246,0.08)' : 'transparent') + ';">'
                    + '<input type="radio" name="tt-arch" data-arch="' + a.id + '"' + (S.architecture === a.id ? ' checked' : '') + ' style="margin-top:3px;">'
                    + '<div><div style="font:700 13.5px Arial;color:#fff;">' + esc(a.name) + ' <span class="tag info">' + a.molecules + ' molecule' + (a.molecules > 1 ? 's' : '') + '</span></div>'
                    + '<div style="font:12.5px/1.55 Arial;color:#9fb3c8;margin-top:4px;">' + esc(a.blurb) + '</div></div></label>').join('')
                + '</div>'

                + '<div class="tt-card"><h3>Chemistry</h3>'
                + '<div class="grid2">'
                + '<div><label class="f">5ʹ cap</label><select data-bind="capType">'
                + PARTS.CAPS.map((c) => '<option value="' + c.id + '"' + (S.capType === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.recommended ? ' — recommended' : '') + '</option>').join('')
                + '</select><div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc(PARTS.byId(PARTS.CAPS, S.capType).blurb) + '</div></div>'
                + '<div><label class="f">Uridine chemistry</label><select data-bind="nucleoside">'
                + PARTS.NUCLEOSIDES.map((c) => '<option value="' + c.id + '"' + (S.nucleoside === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.recommended ? ' — recommended' : '') + '</option>').join('')
                + '</select><div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc(PARTS.byId(PARTS.NUCLEOSIDES, S.nucleoside).blurb) + '</div></div>'
                + '</div>'
                + (isRep() && !PARTS.byId(PARTS.NUCLEOSIDES, S.nucleoside).repliconSafe
                    ? '<div class="stop" style="margin-top:14px;"><b>This combination cannot work.</b> A replicase has to read this molecule as a template and copy it, and '
                    + esc(PARTS.byId(PARTS.NUCLEOSIDES, S.nucleoside).name) + ' interferes with that. Choose unmodified uridine, or a conventional mRNA. The Replicon tab explains it in full.</div>' : '')
                + '</div>';
        };

        // =====================================================================================
        //  TAB 2 — half-life
        // =====================================================================================
        const metricCard = (label, value, sub, frac) => ''
            + '<div class="metric"><div class="lbl">' + esc(label) + '</div><div class="big">' + value + '</div>'
            + (sub ? '<div class="delta" style="color:#9fb3c8;margin-top:3px;">' + sub + '</div>' : '')
            + (frac != null ? '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, frac * 100)) + '%"></i></div>' : '')
            + '</div>';

        const renderHalflife = () => {
            const cds = workingCds();
            const preset = OPT.presetById(S.optimisePreset);
            const frozen = REP.frozenRanges({ architecture: S.architecture, sgpOverlap: S.sgpOverlap });
            const scan = cds ? EL.scanConstruct({ utr5: isRep() ? '' : utr5Seq(), cds: cds, utr3: isRep() ? '' : utr3Seq() }) : null;

            let optBlock = '';
            if (S.opt && S.opt.ok) {
                const m = S.opt.metrics, b = S.opt.before;
                const d = (now, before, better) => {
                    if (before == null) return '';
                    const diff = now - before;
                    if (Math.abs(diff) < 1e-9) return '<span style="color:#9fb3c8;">unchanged</span>';
                    const good = better === 'down' ? diff < 0 : diff > 0;
                    return '<span style="color:' + (good ? '#86efac' : '#fca5a5') + ';">'
                        + (diff > 0 ? '+' : '') + (Math.abs(diff) < 1 ? diff.toFixed(3) : diff.toFixed(1)) + '</span>';
                };
                optBlock = ''
                    + '<div class="tt-card"><h3>What the optimisation did</h3>'
                    + '<div class="grid4">'
                    + metricCard('CpG per kb', num(m.cpgPerKb, 1), b ? d(m.cpgPerKb, b.cpgPerKb, 'down') + ' vs before' : 'ZAP substrate')
                    + metricCard('Codon adaptation', num(m.cai, 3), b ? d(m.cai, b.cai, 'up') + ' vs before' : 'CAI', m.cai)
                    + metricCard('Uridine', pctOf(m.u), b ? d(m.u * 100, b.u * 100, 'down') + ' pts' : 'less modified base to buy')
                    + metricCard('m6A consensus', commas(m.drach), b ? d(m.drach, b.drach, 'down') + ' sites' : 'DRACH pentamers')
                    + '</div>'
                    + '<div class="kv" style="margin-top:12px;"><b>GC</b> ' + pctOf(m.gc) + ' &nbsp; <b>length</b> ' + commas(m.length) + ' nt &nbsp; '
                    + '<b>protein preserved</b> ' + (S.opt.translatesBack ? 'yes' : '<span style="color:#fca5a5;">NO — do not use this sequence</span>')
                    + (S.opt.frozenCodons ? ' &nbsp; <b>frozen codons</b> ' + S.opt.frozenCodons + ' (' + (S.opt.frozenIntact ? 'intact' : '<span style="color:#fca5a5;">CHANGED</span>') + ')' : '')
                    + (S.opt.identity != null ? ' &nbsp; <b>identity to input</b> ' + pctOf(S.opt.identity) : '')
                    + '</div>'
                    + (S.opt.unresolved.length
                        ? '<div class="warn" style="margin-top:12px;"><b>Could not be removed:</b><ul style="margin:6px 0 0 18px;padding:0;">'
                        + S.opt.unresolved.map((u) => '<li>' + esc(u.what) + ' at ' + u.at + ' — ' + esc(u.why) + '</li>').join('') + '</ul></div>'
                        : '')
                    + '</div>';
            }

            let scanBlock = '';
            if (scan) {
                const groups = EL.summarise(scan.findings);
                const rows = groups.map((g) => '<tr>'
                    + '<td><b>' + esc(g.name) + '</b><div style="color:#9fb3c8;font-size:11px;margin-top:3px;">' + esc(g.why) + '</div></td>'
                    + '<td>' + esc(g.region === 'utr5' ? '5ʹ UTR' : (g.region === 'utr3' ? '3ʹ UTR' : 'CDS')) + '</td>'
                    + '<td>' + g.count + '</td>'
                    + '<td><span class="tag ' + (g.effect === 'stabilising' ? 'good' : (g.strength === 'strong' ? 'bad' : 'mid')) + '">' + esc(g.effect) + '</span></td>'
                    + '<td>' + esc(g.strength) + ' / ' + esc(g.confidence) + '</td>'
                    + '<td style="color:#9fb3c8;">' + esc(g.binds || '') + '</td></tr>').join('');
                const r3 = scan.regions.utr3, rc = scan.regions.cds;
                scanBlock = ''
                    + '<div class="tt-card"><h3>Elements found</h3>'
                    + '<p class="sub">Each element is only reported in the region it is real in — an AUUUA in a 3ʹ UTR is an AU-rich element, the same five bases inside a coding sequence are part of two codons and mean nothing.</p>'
                    + '<div class="grid4" style="margin-bottom:14px;">'
                    + metricCard('CDS CpG o/e', rc && rc.cpg.oe != null ? num(rc.cpg.oe, 2) : '—', 'human transcripts sit near 0.25–0.40')
                    + metricCard('CDS m6A / kb', rc ? num(rc.drachPerKb, 1) : '—', 'about 16 per kb by chance')
                    + metricCard('3ʹ UTR ARE clusters', r3 ? commas((r3.areClusters || []).length) : '—', 'the destabilising class that matters')
                    + metricCard('miRNA sites', commas((scan.mirnas || []).length), 'deliberate or accidental')
                    + '</div>'
                    + (rows ? '<div class="scroll"><table class="tt"><thead><tr><th>Element</th><th>Region</th><th>Count</th><th>Effect</th><th>Strength / evidence</th><th>Bound by</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                        : '<div class="note">No catalogued element found in any region.</div>')
                    + ((scan.mirnas || []).length
                        ? '<div style="margin-top:12px;"><b style="font:600 12.5px Arial;color:#c8d6e6;">miRNA target sites present:</b> '
                        + scan.mirnas.map((m) => '<span class="tag ' + (S.detargeting.indexOf(m.id) >= 0 ? 'info' : 'mid') + '">' + esc(m.name) + ' ' + esc(m.kind) + ' @' + m.at + ' (' + esc(m.region) + ')</span>').join(' ')
                        + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:6px;">A site you added deliberately is doing its job. A site you did not add is silencing this construct wherever that miRNA is expressed.</div></div>' : '')
                    + '</div>';
            }

            body.innerHTML = ''
                + '<div class="tt-card"><h3>Codon strategy</h3>'
                + '<p class="sub">Codon choice is solved here as a shortest path rather than one codon at a time, because the things worth avoiding — CpG, the m6A consensus, poly(A) signals — mostly straddle codon boundaries. '
                + 'Choosing each codon independently creates them and then cannot see them.</p>'
                + '<div class="grid2">'
                + '<div><label class="f">Objective</label><select data-bind="optimisePreset">'
                + OPT.PRESETS.map((p) => '<option value="' + p.id + '"' + (S.optimisePreset === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('')
                + '</select><div style="color:#9fb3c8;font:11.5px/1.55 Arial;margin-top:7px;">' + esc(preset.blurb) + '</div></div>'
                + '<div><label class="f">GC target (optional)</label><input type="number" step="0.01" min="0.3" max="0.75" data-bind="gcTarget" value="' + (S.gcTarget == null ? '' : S.gcTarget) + '" placeholder="leave empty to let the objective decide">'
                + (frozen.length ? '<div class="note" style="margin-top:10px;">Frozen: bases 0–' + frozen[0].to + ' of the payload, because ' + esc(frozen[0].why) + '. The optimiser will route around them and the result is checked afterwards.</div>' : '')
                + '</div></div>'
                + '<div style="margin-top:14px;"><button class="tt-btn go" data-act="optimise"' + ((S.protein || S.cdsInput) ? '' : ' disabled') + '>Optimise the coding sequence</button>'
                + ((S.protein || S.cdsInput) ? '' : ' <span style="color:#9fb3c8;font:12px Arial;">Give a protein or a coding sequence on the Payload tab first.</span>')
                + '</div></div>'
                + optBlock

                + '<div class="tt-card"><h3>Untranslated regions and tail</h3>'
                + (isRep() ? '<div class="warn">This is a replicon. Its untranslated regions are the conserved elements and the subgenomic promoter, set on the Replicon tab — these choices are not used.</div>' : '')
                + '<div class="grid3">'
                + '<div><label class="f">5ʹ UTR</label><select data-bind="utr5">'
                + PARTS.UTR5.map((u) => '<option value="' + u.id + '"' + (S.utr5 === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('')
                + '<option value="custom"' + (S.utr5 === 'custom' ? ' selected' : '') + '>Custom…</option></select>'
                + (S.utr5 === 'custom' ? '<textarea data-bind="utr5Custom" rows="2" style="margin-top:8px;" placeholder="paste the 5ʹ UTR">' + esc(S.utr5Custom) + '</textarea>' : '')
                + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc((PARTS.byId(PARTS.UTR5, S.utr5) || {}).blurb || '') + '</div></div>'
                + '<div><label class="f">3ʹ UTR</label><select data-bind="utr3">'
                + PARTS.UTR3.map((u) => '<option value="' + u.id + '"' + (S.utr3 === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('')
                + '<option value="custom"' + (S.utr3 === 'custom' ? ' selected' : '') + '>Custom…</option></select>'
                + (S.utr3 === 'custom' ? '<textarea data-bind="utr3Custom" rows="2" style="margin-top:8px;" placeholder="paste the 3ʹ UTR">' + esc(S.utr3Custom) + '</textarea>' : '')
                + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc((PARTS.byId(PARTS.UTR3, S.utr3) || {}).blurb || '') + '</div></div>'
                + '<div><label class="f">Poly(A) tail</label>'
                + '<input type="number" min="0" max="400" data-bind="polyA" value="' + (S.polyA | 0) + '">'
                + '<select data-bind="polyAStyle" style="margin-top:8px;">'
                + PARTS.POLYA_STYLES.map((p) => '<option value="' + p.id + '"' + (S.polyAStyle === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('')
                + '</select><div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc(PARTS.byId(PARTS.POLYA_STYLES, S.polyAStyle).blurb) + '</div></div>'
                + '</div></div>'

                + '<div class="tt-card"><h3>Tissue de-targeting <span class="tag info">optional</span></h3>'
                + '<p class="sub">A miRNA site in the 3ʹ UTR silences the construct wherever that miRNA is expressed. This is the standard way to keep a transcript from working in a tissue you do not want it in — '
                + 'miR-122 sites switch it off in hepatocytes, miR-142-3p sites switch it off in immune cells. Sites are added in tandem because one is leaky.</p>'
                + '<div>' + EL.MIRNA.map((m) => '<span class="chip' + (S.detargeting.indexOf(m.id) >= 0 ? ' on' : '') + '" data-mirna="' + m.id + '" title="' + esc(m.use) + '">' + esc(m.name) + ' · ' + esc(m.tissue) + '</span>').join('') + '</div>'
                + '<div class="grid2" style="margin-top:12px;"><div><label class="f">Tandem copies of each site</label><input type="number" min="1" max="8" data-bind="detargetCopies" value="' + (S.detargetCopies | 0) + '"></div>'
                + '<div>' + (S.detargeting.length ? '<label class="f">Added to the 3ʹ UTR</label><div class="seq" style="font-size:11px;">' + esc(GC.toRna(detargetBlock())) + '</div>' : '') + '</div></div>'
                + (S.detargeting.length ? '<div class="warn" style="margin-top:12px;">These seed sequences were written from the mature miRNAs and must be confirmed against miRBase before use. A seed one base out targets nothing, or something else.</div>' : '')
                + (S.detargeting.length && isRep() ? '<div class="stop" style="margin-top:12px;">In a replicon nothing may sit between the 3ʹ conserved element and the poly(A). These sites are placed before the conserved element instead; check that is what you want.</div>' : '')
                + '</div>'
                + scanBlock;
        };

        // =====================================================================================
        //  TAB 3 — replicon
        // =====================================================================================
        const repliconSpec = () => ({
            architecture: S.architecture, backbone: S.backbone, cds: workingCds(),
            nucleoside: S.nucleoside, capType: S.capType, polyA: S.polyA | 0,
            utr3: isRep() ? '' : utr3Seq(), utr5: isRep() ? '' : utr5Seq(),
            cse5: S.cse5, sgp: S.sgp, replicase: S.replicase, cse3: S.cse3,
            optimisePreset: S.optimisePreset, sgpOverlap: S.sgpOverlap,
            kozak: S.kozak ? PARTS.OTHER.kozak.dna : '', stops: S.stops ? PARTS.OTHER.stops.dna : ''
        });

        const renderReplicon = () => {
            const arch = REP.byId(S.architecture);
            const checks = REP.check(repliconSpec());
            const stops = checks.filter((c) => c.severity === 'stop');
            const warns = checks.filter((c) => c.severity === 'warn');
            const notes = checks.filter((c) => c.severity === 'note');

            if (!isRep()) {
                body.innerHTML = ''
                    + '<div class="tt-card"><h3>This is a conventional mRNA</h3>'
                    + '<p class="sub">There is no replicase and nothing to amplify. Every stability tool is available, including modified nucleosides, and the whole molecule is the length of the payload plus its untranslated regions.</p>'
                    + '<p class="sub">Choose a self-amplifying or trans-amplifying architecture on the Payload tab to design a replicon. Before you do, the trade is worth stating plainly: '
                    + 'amplification cuts the dose by one to two orders of magnitude, and it costs you modified nucleosides, adds several kilobases of virus-derived sequence to make and to regulate, '
                    + 'and brings an interferon response that comes from the act of copying and cannot be designed away.</p>'
                    + '</div>'
                    + notes.map((c) => '<div class="note"><b>' + esc(c.what) + '</b><br>' + esc(c.detail) + '</div>').join('');
                return;
            }

            const slotFields = arch.slots.filter((s) => s.provide === 'user').map((s) => ''
                + '<div style="margin-bottom:14px;"><label class="f">' + esc(s.name) + (s.required ? ' <span style="color:#fca5a5;">required</span>' : '') + '</label>'
                + '<textarea data-bind="' + s.id + '" rows="2" placeholder="paste from your backbone">' + esc(S[s.id] || '') + '</textarea>'
                + '<div style="color:#9fb3c8;font:11.5px/1.55 Arial;margin-top:6px;">' + esc(s.about || '') + (S[s.id] ? ' <b style="color:#c8d6e6;">' + commas(GC.cleanNt(S[s.id]).length) + ' nt pasted.</b>' : '') + '</div></div>').join('');

            body.innerHTML = ''
                + '<div class="tt-card"><h3>' + esc(arch.name) + '</h3><p class="sub">' + esc(arch.blurb) + '</p>'
                + (arch.molecules_detail ? '<div class="grid2">' + arch.molecules_detail.map((m) =>
                    '<div class="metric"><div class="lbl">' + esc(m.name) + '</div><div style="font:12px Arial;color:#c8d6e6;">' + m.slots.join(' › ') + '</div></div>').join('') + '</div>' : '')
                + '<div class="grid2" style="margin-top:14px;">'
                + '<div><label class="f">Backbone</label><select data-bind="backbone">'
                + REP.BACKBONES.map((b) => '<option value="' + b.id + '"' + (S.backbone === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('')
                + '</select><div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">' + esc((REP.BACKBONES.filter((b) => b.id === S.backbone)[0] || {}).note || '') + '</div></div>'
                + '<div><label class="f">Subgenomic promoter overlap into the payload (nt)</label>'
                + '<input type="number" min="0" max="30" data-bind="sgpOverlap" value="' + (S.sgpOverlap | 0) + '">'
                + '<div style="color:#9fb3c8;font:11.5px/1.5 Arial;margin-top:7px;">The promoter spans the transcription start, so its last bases are the payload’s first. These are frozen during optimisation. Five is the usual figure; some constructs need more.</div></div>'
                + '</div></div>'

                + '<div class="tt-card"><h3>Parts you supply</h3>'
                + '<p class="sub">This editor does not ship replicase or conserved-element sequences. They are thousands of bases of virus-derived sequence that you either have validated in-house or take from a specific record, '
                + 'and a plausible-looking approximation of one would be the most dangerous thing here. Paste them and everything around them is checked.</p>'
                + slotFields + '</div>'

                + '<div class="tt-card"><h3>Compatibility</h3>'
                + (stops.length + warns.length + notes.length === 0 ? '<div class="note">Nothing to report.</div>' : '')
                + stops.map((c) => '<div class="stop"><b>' + esc(c.what) + '</b><br>' + esc(c.detail) + '</div>').join('')
                + warns.map((c) => '<div class="warn"><b>' + esc(c.what) + '</b><br>' + esc(c.detail) + '</div>').join('')
                + notes.map((c) => '<div class="note"><b>' + esc(c.what) + '</b><br>' + esc(c.detail) + '</div>').join('')
                + '</div>';
        };

        // =====================================================================================
        //  TAB 4 — models
        // =====================================================================================
        const renderModels = () => {
            const superseded = MOD.supersededIds();
            const list = MOD.list();
            const results = S.models || [];
            const byId = {};
            for (const r of results) byId[r.id] = r;

            const card = (m) => {
                const r = byId[m.id];
                const dem = superseded.has(m.id);
                return '<div class="tt-card" style="' + (dem ? 'opacity:0.72;' : '') + '">'
                    + '<div style="display:flex;gap:12px;align-items:flex-start;">'
                    + '<div style="flex:1 1 auto;">'
                    + '<h3>' + esc(m.name) + ' '
                    + (m.trained ? '<span class="tag good">trained</span>' : '<span class="tag mid">not trained</span>')
                    + ' <span class="tag info">' + esc(m.kind) + '</span>'
                    + (dem ? ' <span class="tag bad">superseded</span>' : '') + '</h3>'
                    + '<p class="sub">' + esc(m.blurb || '') + '</p>'
                    + '<div class="kv"><b>Provenance</b> ' + esc(m.provenance || 'not stated') + '</div>'
                    + (m.scale ? '<div class="kv"><b>Scale</b> ' + esc(m.scale) + '</div>' : '')
                    + (m.needs.length ? '<div class="kv"><b>Needs</b> ' + esc(m.needs.join(', ')) + '</div>' : '')
                    + '</div>'
                    + '<div style="flex:0 0 150px;text-align:right;">'
                    + (r && r.ok
                        ? '<div class="big" style="font:700 30px Arial;color:#fff;">' + esc('' + r.value) + '</div>'
                        + '<div style="font:11.5px Arial;color:#9fb3c8;">' + esc(r.unit) + ' · confidence ' + esc(r.confidence) + '</div>'
                        : (r ? '<div class="tag ' + (r.notApplicable ? 'mid' : 'bad') + '">' + esc(r.notApplicable ? 'not applicable' : 'error') + '</div>'
                            + '<div style="font:11px Arial;color:#9fb3c8;margin-top:6px;">' + esc(r.error || '') + '</div>'
                            : '<div style="font:11.5px Arial;color:#9fb3c8;">not run yet</div>'))
                    + '</div></div>'
                    + (r && r.ok && r.contributions.length
                        ? '<div class="scroll" style="max-height:none;margin-top:12px;"><table class="tt"><thead><tr><th>Feature</th><th style="width:80px;">Effect</th><th>Why</th></tr></thead><tbody>'
                        + r.contributions.slice().sort((a, b) => a.delta - b.delta).map((c) => '<tr>'
                            + '<td>' + esc(c.feature) + '</td>'
                            + '<td style="color:' + (c.delta > 0 ? '#86efac' : '#fca5a5') + ';">' + (c.delta > 0 ? '+' : '') + num(c.delta, 2) + '</td>'
                            + '<td style="color:#9fb3c8;">' + esc(c.why) + '</td></tr>').join('')
                        + '</tbody></table></div>' : '')
                    + (r && r.ok && r.explanation ? '<div class="note" style="margin-top:12px;">' + esc(r.explanation) + '</div>' : '')
                    + '</div>';
            };

            body.innerHTML = ''
                + '<div class="tt-card"><h3>Every number in this editor comes from a model listed here</h3>'
                + '<p class="sub">Half-life, expression and innate sensing are all things people are building trained predictors for, and the three shipped with this editor are not among them. '
                + 'They are transparent additive scores over features that are individually well supported, decomposed below so you can see what moved them and disagree with the weights. '
                + 'They report a relative index and none of them reports hours, because none of them knows hours.</p>'
                + '<div class="row-act" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">'
                + '<button class="tt-btn go" data-act="run-models"' + (workingCds() ? '' : ' disabled') + '>Run every model</button>'
                + (workingCds() ? '' : '<span style="color:#9fb3c8;font:12px Arial;">Needs a coding sequence.</span>')
                + '<span style="color:#9fb3c8;font:12px Arial;">' + list.length + ' registered · ' + list.filter((m) => m.trained).length + ' trained</span>'
                + '</div></div>'
                + '<div class="note"><b>Adding one.</b> A model is registered with a single call and the editor picks it up with no other change. '
                + 'A model that declares <b>supersedes</b> demotes the one it replaces, so a baseline stops being the headline the moment something better is present.'
                + '<div class="seq" style="margin-top:10px;white-space:pre;">' + esc(
                    "const M = await exec('tottenham/lib/models.js');\n"
                    + "M.register({\n"
                    + "    id: 'halflife-xgb-2026',\n"
                    + "    name: 'Half-life, gradient boosted (internal v3)',\n"
                    + "    kind: 'half-life',          // half-life | expression | innate-sensing | structure\n"
                    + "    unit: 'hours',\n"
                    + "    trained: true,\n"
                    + "    provenance: 'SLAM-seq, HEK293, n=8412, held-out r=0.71',\n"
                    + "    needs: ['cds', 'utr3'],\n"
                    + "    supersedes: 'halflife-composite',\n"
                    + "    predict: async (ctx) => ({ value: 14.2, confidence: 'medium',\n"
                    + "        contributions: [{ feature: 'ARE load', delta: -2.1, why: '…' }] })\n"
                    + "});\n\n"
                    + "// or a service:\n"
                    + "M.registerRemote({ id: 'hl-api', name: 'Half-life API', kind: 'half-life',\n"
                    + "    trained: true, url: 'https://…/predict' });") + '</div>'
                + 'The context handed to <b>predict</b> carries utr5, cds, utr3, protein, polyA, capType, nucleoside, architecture and a pre-computed element scan.</div>'
                + list.map(card).join('');
        };

        // =====================================================================================
        //  TAB 5 — assembly
        // =====================================================================================
        const runQc = () => {
            const cds = workingCds();
            const f = [];
            const add = (sev, what, detail) => f.push({ severity: sev, what: what, detail: detail });
            if (!cds) { add('stop', 'No coding sequence', 'Give a protein and optimise, or paste a coding sequence.'); return f; }

            // The protein must survive everything done to it.
            const prot = GC.translate(cds).replace(/\*+$/, '');
            if (S.protein && prot !== GC.cleanAa(S.protein).replace(/\*/g, '')) {
                add('stop', 'The coding sequence does not encode the protein that was entered',
                    'This is a fault, not a design choice. Do not use this sequence.');
            }
            if (prot.indexOf('*') >= 0) add('stop', 'In-frame stop inside the coding sequence at residue ' + (prot.indexOf('*') + 1), 'Everything after it is not translated.');
            if (cds.length % 3 !== 0) add('stop', 'Coding sequence is not a multiple of three', commas(cds.length) + ' nt.');

            for (const c of REP.check(repliconSpec())) add(c.severity, c.what, c.detail);

            const asm = S.assembly;
            if (asm) {
                for (const mol of asm.molecules) {
                    const s = mol.sequence;
                    if (mol.length > 11000) add('warn', mol.name + ' is ' + commas(mol.length) + ' nt', 'Full-length yield from an in-vitro transcription run falls off above about 11 kb.');
                    // Homopolymers outside the tail.
                    const paSeg = mol.segments.filter((x) => x.id === 'polya')[0];
                    const bodyEnd = paSeg ? paSeg.from : s.length;
                    for (const b of ['A', 'C', 'G', 'T']) {
                        const runs = GC.runsOf(s.slice(0, bodyEnd), b, 9);
                        if (runs.length) add('warn', 'Run of ' + runs[0].len + ' ' + GC.toRna(b) + ' in ' + mol.name + ' at ' + runs[0].at, 'Long homopolymers slip during transcription and during synthesis of the template.');
                    }
                }
            }

            if (S.structure) {
                const cw = S.structure.capWindow, sw = S.structure.startWindow;
                if (cw && cw.verdict === 'blocking') add('warn', 'Stable hairpin at the cap (' + num(cw.dg, 1) + ' kcal/mol)', 'This impedes 43S loading. Open the 5ʹ end or choose a less structured UTR.');
                else if (cw && cw.verdict === 'marginal') add('note', 'Some cap-proximal structure (' + num(cw.dg, 1) + ' kcal/mol)', 'Borderline. Worth opening if expression is short of target.');
                if (sw && sw.verdict === 'blocking') add('warn', 'Stable hairpin over the start codon (' + num(sw.dg, 1) + ' kcal/mol)', 'Recode the first few codons to open it.');
            }

            const u5 = isRep() ? '' : utr5Seq();
            if (!isRep()) {
                const uaug = (u5.match(/ATG/g) || []).length;
                if (uaug) add('warn', uaug + ' upstream AUG(s) in the 5ʹ UTR', 'A scanning ribosome initiates at the first AUG it reaches; most will never get to the real start codon.');
                if (!S.kozak) add('note', 'No Kozak sequence', 'Initiation will be less efficient.');
                if (!S.polyA) add('warn', 'No poly(A) tail', 'The transcript will be degraded rapidly.');
            }
            for (const sig of ['AATAAA', 'ATTAAA']) {
                for (const at of GC.findMotif(cds, sig)) add('warn', GC.toRna(sig) + ' inside the coding sequence at ' + at, 'A cryptic polyadenylation signal truncates the transcript.');
            }
            if (S.opt && S.opt.ok) {
                for (const u of S.opt.unresolved) add('warn', 'Could not remove ' + u.what + ' at ' + u.at, u.why + '.');
                if (S.opt.frozenCodons && S.opt.frozenIntact === false) add('stop', 'A frozen region changed during optimisation', 'The subgenomic promoter overlap is not what it was. Do not use this sequence.');
            }
            const gcv = GC.gc(cds);
            if (gcv > 0.70) add('warn', 'Coding sequence GC ' + pctOf(gcv), 'Above about 70% it becomes hard to synthesise and structured enough to impede the ribosome.');
            if (gcv < 0.35) add('warn', 'Coding sequence GC ' + pctOf(gcv), 'AU-rich transcripts are less stable and translate less well.');
            add('note', 'Composition', 'CDS ' + commas(cds.length) + ' nt · GC ' + pctOf(gcv) + ' · U ' + pctOf(GC.uFraction(cds)) + ' · CAI ' + num(GC.cai(cds), 3)
                + ' · CpG ' + commas((cds.match(/CG/g) || []).length));
            return f;
        };

        const doBuild = async () => {
            const cds = workingCds();
            if (!cds) { say('Give a protein and optimise it, or paste a coding sequence.', 'warn'); return; }
            const spin = await exec('baja/lib/work-spinner.js', 'Building…');
            try {
                const spec = repliconSpec();
                spec.cds = cds;
                if (!isRep()) {
                    spec.utr5 = utr5Seq();
                    spec.utr3 = utr3Seq();
                    spec.kozak = S.kozak ? PARTS.OTHER.kozak.dna : '';
                    spec.stops = S.stops ? PARTS.OTHER.stops.dna : '';
                } else if (S.detargeting.length) {
                    // In a replicon the sites cannot go after the conserved element, so they
                    // ride at the end of the payload instead. Stated on screen, not silent.
                    spec.cds = cds + detargetBlock();
                }
                spec.polyA = S.polyA | 0;
                const asmSpec = Object.assign({}, spec);
                asmSpec.polyA = 0;
                S.assembly = REP.assemble(Object.assign({}, spec, { polyA: S.polyA | 0 }));
                // Replace the plain tail with the chosen style.
                const tail = PARTS.buildPolyA(S.polyAStyle, S.polyA | 0);
                for (const mol of S.assembly.molecules) {
                    const seg = mol.segments.filter((x) => x.id === 'polya')[0];
                    if (!seg) continue;
                    mol.sequence = mol.sequence.slice(0, seg.from) + tail;
                    seg.to = seg.from + tail.length;
                    mol.rna = GC.toRna(mol.sequence);
                    mol.length = mol.sequence.length;
                }
                // Structure, on the molecule that carries the payload.
                const carrier = S.assembly.molecules.filter((m) => m.segments.some((x) => x.id === 'cds'))[0] || S.assembly.molecules[0];
                const cdsSeg = carrier.segments.filter((x) => x.id === 'cds')[0];
                S.structure = ST.analyse({ sequence: carrier.sequence, cdsFrom: cdsSeg ? cdsSeg.from : null });
                S.scan = EL.scanConstruct({ utr5: isRep() ? '' : utr5Seq(), cds: cds, utr3: isRep() ? '' : utr3Seq() });
                S.qc = runQc();
                try { spin.text('Running models…'); } catch (e) { }
                S.models = await MOD.runAll(null, buildContext());
                const stops = S.qc.filter((x) => x.severity === 'stop').length;
                say('Built ' + S.assembly.molecules.length + ' molecule(s), ' + commas(S.assembly.molecules.reduce((a, m) => a + m.length, 0)) + ' nt total. '
                    + (stops ? stops + ' blocking problem(s) — see the checks.' : 'No blocking problems.'), stops ? 'stop' : 'note');
            } catch (e) {
                say('The build failed: ' + (e && e.message ? e.message : e), 'stop');
                step('build failed: ' + e);
            } finally { try { spin.stop(); } catch (e) { } }
            render();
        };

        const colouredMolecule = (mol) => {
            const cls = { cds: 'seg-cds', utr5: 'seg-utr', utr3: 'seg-utr', replicase: 'seg-rep', cse5: 'seg-cse', cse3: 'seg-cse', polya: 'seg-pa', sgp: 'seg-sgp', kozak: 'seg-utr', stops: 'seg-utr' };
            return mol.segments.map((s) => '<span class="' + (cls[s.id] || '') + '" title="' + esc(s.name) + ' · ' + s.from + '–' + s.to + '">'
                + esc(GC.toRna(mol.sequence.slice(s.from, s.to))) + '</span>').join('');
        };

        const renderAssembly = () => {
            if (!S.assembly) {
                body.innerHTML = '<div class="tt-card"><h3>Nothing built yet</h3>'
                    + '<p class="sub">Building assembles the molecules, folds the cap and start windows, scans every region for elements, runs the checks and then runs every registered model.</p>'
                    + '<button class="tt-btn go" data-act="build"' + (workingCds() ? '' : ' disabled') + '>Build and check</button>'
                    + (workingCds() ? '' : ' <span style="color:#9fb3c8;font:12px Arial;">Needs a coding sequence.</span>')
                    + '</div>';
                return;
            }
            const stops = (S.qc || []).filter((f) => f.severity === 'stop');
            const warns = (S.qc || []).filter((f) => f.severity === 'warn');
            const notes = (S.qc || []).filter((f) => f.severity === 'note');
            const mods = (S.models || []).filter((m) => m.ok);

            body.innerHTML = ''
                + '<div class="tt-card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
                + '<button class="tt-btn" data-act="build">Build again</button>'
                + '<span style="color:#9fb3c8;font:12px Arial;">' + S.assembly.molecules.map((m) => m.name + ' ' + commas(m.length) + ' nt').join(' · ') + '</span>'
                + '</div></div>'
                + (mods.length ? '<div class="grid3" style="margin-bottom:16px;">' + mods.map((m) =>
                    metricCard(m.name, esc('' + m.value), esc(m.unit) + (m.trained ? ' · trained' : ' · not trained'),
                        (typeof m.value === 'number' && m.unit === 'index') ? m.value / 100 : null)).join('') + '</div>' : '')
                + S.assembly.molecules.map((mol) => ''
                    + '<div class="tt-card"><h3>' + esc(mol.name) + ' <span class="tag info">' + commas(mol.length) + ' nt</span></h3>'
                    + '<p class="sub">' + mol.segments.map((s) => esc(s.name) + ' (' + commas(s.to - s.from) + ')').join(' · ') + '</p>'
                    + '<div class="seq" style="max-height:220px;overflow:auto;">' + colouredMolecule(mol) + '</div></div>').join('')
                + (S.structure ? '<div class="tt-card"><h3>Structure where it matters</h3>'
                    + '<p class="sub">A local hairpin search, not a fold. It answers one question: is there a stable hairpin sitting where it will get in the way.</p>'
                    + '<div class="grid2">'
                    + metricCard('Cap-proximal hairpin', S.structure.capWindow && S.structure.capWindow.dg != null ? num(S.structure.capWindow.dg, 1) + ' kcal/mol' : '—',
                        S.structure.capWindow ? esc(S.structure.capWindow.verdict) : '')
                    + metricCard('Across the start codon', S.structure.startWindow && S.structure.startWindow.dg != null ? num(S.structure.startWindow.dg, 1) + ' kcal/mol' : '—',
                        S.structure.startWindow ? esc(S.structure.startWindow.verdict) : '')
                    + '</div>'
                    + S.structure.notes.map((n) => '<div class="note" style="margin-top:12px;">' + esc(n) + '</div>').join('')
                    + '</div>' : '')
                + '<div class="tt-card"><h3>Checks</h3>'
                + stops.map((f) => '<div class="stop"><b>' + esc(f.what) + '</b><br>' + esc(f.detail) + '</div>').join('')
                + warns.map((f) => '<div class="warn"><b>' + esc(f.what) + '</b><br>' + esc(f.detail) + '</div>').join('')
                + notes.map((f) => '<div class="note"><b>' + esc(f.what) + '</b><br>' + esc(f.detail) + '</div>').join('')
                + '<div style="margin-top:14px;"><button class="tt-btn go" data-act="goto" data-tab="output">See the sequences</button></div>'
                + '</div>';
        };

        // =====================================================================================
        //  TAB 6 — output
        // =====================================================================================
        const verifyItems = () => {
            const out = [];
            if (!isRep()) {
                for (const x of [PARTS.byId(PARTS.UTR5, S.utr5), PARTS.byId(PARTS.UTR3, S.utr3)]) {
                    if (x && x.verify && x.id !== 'none' && S.utr5 !== 'custom' && x.rna) out.push(x);
                }
            }
            if (S.detargeting.length) out.push({ name: 'miRNA seed sequences (' + S.detargeting.length + ')', source: 'written from the mature miRNAs; confirm each against miRBase' });
            return out;
        };

        const reportText = () => {
            if (!S.assembly) return '';
            const L = [];
            const p = (s) => L.push(s == null ? '' : s);
            p('TOTTENHAM mRNA DESIGN');
            p('=====================');
            p('Design       : ' + (S.name || '(unnamed)'));
            p('Label        : ' + (S.label || '(none)'));
            p('Written      : ' + new Date().toISOString());
            p('Architecture : ' + REP.byId(S.architecture).name);
            if (isRep()) p('Backbone     : ' + (REP.BACKBONES.filter((b) => b.id === S.backbone)[0] || {}).name);
            p('Cap          : ' + PARTS.byId(PARTS.CAPS, S.capType).name);
            p('Uridine      : ' + PARTS.byId(PARTS.NUCLEOSIDES, S.nucleoside).name);
            p('');
            p('PAYLOAD');
            const cds = workingCds();
            p('  Protein     : ' + (GC.translate(cds).replace(/\*+$/, '').length) + ' residues');
            p('  CDS         : ' + cds.length + ' nt, CAI ' + GC.cai(cds).toFixed(3)
                + ', GC ' + (GC.gc(cds) * 100).toFixed(1) + '%, U ' + (GC.uFraction(cds) * 100).toFixed(1) + '%'
                + ', CpG ' + (cds.match(/CG/g) || []).length);
            p('  Objective   : ' + OPT.presetById(S.optimisePreset).name);
            if (S.opt && S.opt.before) {
                p('  Before      : CAI ' + S.opt.before.cai.toFixed(3) + ', CpG/kb ' + S.opt.before.cpgPerKb.toFixed(1) + ', DRACH ' + S.opt.before.drach);
                p('  After       : CAI ' + S.opt.metrics.cai.toFixed(3) + ', CpG/kb ' + S.opt.metrics.cpgPerKb.toFixed(1) + ', DRACH ' + S.opt.metrics.drach);
            }
            if (S.opt && S.opt.frozenCodons) p('  Frozen      : ' + S.opt.frozenCodons + ' codons (' + (S.opt.frozenIntact ? 'verified intact' : 'CHANGED — DO NOT USE') + ')');
            p('');
            p('MODELS');
            p('  Every number below comes from a model registered in tottenham/lib/models.js.');
            for (const m of (S.models || [])) {
                if (!m.ok) { p('  ' + (m.name || m.id) + ': ' + (m.notApplicable ? 'not applicable' : 'error — ' + m.error)); continue; }
                p('  ' + (m.name + ' ').padEnd(46, '.') + ' ' + String(m.value).padStart(6) + ' ' + m.unit
                    + '   [' + (m.trained ? 'trained' : 'NOT TRAINED') + ', confidence ' + m.confidence + ']');
                if (m.provenance) p('      provenance: ' + m.provenance);
                for (const c of (m.contributions || []).slice().sort((a, b) => a.delta - b.delta)) {
                    p('      ' + ((c.delta > 0 ? '+' : '') + c.delta.toFixed(2)).padStart(7) + '  ' + c.feature);
                }
            }
            p('');
            const vi = verifyItems();
            if (vi.length) {
                p('UNVERIFIED REFERENCE PARTS — confirm before ordering:');
                for (const x of vi) p('  - ' + x.name + ': ' + (x.source || 'source not recorded'));
                p('  Acknowledged by the designer: ' + (S.acknowledgedVerify ? 'yes' : 'NO'));
                p('');
            }
            p('CHECKS');
            for (const f of (S.qc || [])) p('  [' + f.severity.toUpperCase() + '] ' + f.what + ' — ' + f.detail);
            p('');
            for (const mol of S.assembly.molecules) {
                p('MOLECULE: ' + mol.name + '  (' + mol.length + ' nt)');
                for (const s of mol.segments) p('  ' + (s.name + ' ').padEnd(34, '.') + ' ' + String(s.from).padStart(6) + ' – ' + String(s.to).padStart(6) + '  (' + (s.to - s.from) + ' nt)');
                p('');
                const rna = mol.rna;
                for (let i = 0; i < rna.length; i += 60) p('  ' + String(i + 1).padStart(7) + '  ' + rna.substr(i, 60));
                p('');
            }
            if (S.notes) { p('NOTES'); p('  ' + S.notes.replace(/\n/g, '\n  ')); }
            return L.join('\n');
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
            } catch (e) { say('This browser would not start the download: ' + (e && e.message ? e.message : e), 'warn'); }
        };

        const fasta = (name, seq) => {
            let out = '>' + name + '\n';
            for (let i = 0; i < seq.length; i += 60) out += seq.substr(i, 60) + '\n';
            return out;
        };

        const renderOutput = () => {
            if (!S.assembly) { body.innerHTML = '<div class="tt-card"><h3>Nothing built yet</h3><p class="sub">Build the construct on the Assembly tab.</p></div>'; return; }
            const vi = verifyItems();
            const blocked = vi.length && !S.acknowledgedVerify;
            const hasStop = (S.qc || []).some((f) => f.severity === 'stop');
            body.innerHTML = ''
                + (hasStop ? '<div class="stop"><b>This design has blocking problems.</b> The checks on the Assembly tab list them. The sequences below are still shown, because seeing them is often how the problem gets understood, but they should not be ordered.</div>' : '')
                + (blocked ? '<div class="warn"><b>Export is held.</b> These parts have not been confirmed against their sources: ' + esc(vi.map((x) => x.name).join(', ')) + '.'
                    + '<label style="display:block;margin-top:9px;"><input type="checkbox" data-toggle="acknowledgedVerify"' + (S.acknowledgedVerify ? ' checked' : '') + '> I have checked them.</label></div>' : '')
                + S.assembly.molecules.map((mol) => ''
                    + '<div class="tt-card"><h3>' + esc(mol.name) + ' <span class="tag info">' + commas(mol.length) + ' nt</span></h3>'
                    + '<div class="seq" style="max-height:260px;overflow:auto;">' + esc(mol.rna) + '</div></div>').join('')
                + '<div class="tt-card"><h3>Take it away</h3><div style="display:flex;gap:9px;flex-wrap:wrap;">'
                + '<button class="tt-btn go" data-act="dl-report"' + (blocked ? ' disabled' : '') + '>Design report (.txt)</button>'
                + '<button class="tt-btn" data-act="dl-fasta"' + (blocked ? ' disabled' : '') + '>Sequences (.fasta)</button>'
                + '<button class="tt-btn" data-act="copy-rna"' + (blocked ? ' disabled' : '') + '>Copy the first molecule</button>'
                + '<button class="tt-btn" data-act="save">Save the design</button>'
                + '</div>'
                + '<div style="margin-top:16px;"><label class="f">Notes for the record</label>'
                + '<textarea data-bind="notes" rows="3" placeholder="Anything the next person reading this file needs to know.">' + esc(S.notes) + '</textarea></div></div>'
                + '<div class="tt-card"><h3>The report as it will be written</h3>'
                + '<div class="seq" style="max-height:46vh;overflow:auto;white-space:pre;">' + esc(reportText()) + '</div></div>';
        };

        // =====================================================================================
        //  actions
        // =====================================================================================
        const render = () => {
            if (tab === 'payload') renderPayload();
            else if (tab === 'halflife') renderHalflife();
            else if (tab === 'replicon') renderReplicon();
            else if (tab === 'models') renderModels();
            else if (tab === 'assembly') renderAssembly();
            else renderOutput();
            const sub = $('#tt-sub');
            if (sub) {
                const cds = workingCds();
                sub.textContent = (S.name || 'Untitled design') + ' · ' + REP.byId(S.architecture).name
                    + ' · ' + (cds ? commas(cds.length) + ' nt payload' : 'no payload yet')
                    + ' · ' + PARTS.byId(PARTS.NUCLEOSIDES, S.nucleoside).name;
            }
        };

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
            } catch (e) { return { ok: false, message: (e && e.message) ? e.message : ('' + e) }; }
        };

        const doOptimise = async () => {
            const spin = await exec('baja/lib/work-spinner.js', 'Optimising…');
            try {
                const frozen = REP.frozenRanges({ architecture: S.architecture, sgpOverlap: S.sgpOverlap });
                const opts = { preset: S.optimisePreset };
                if (S.gcTarget != null) opts.gcTarget = S.gcTarget;
                // A frozen range needs a source coding sequence to freeze. With only a protein
                // in hand there is nothing to preserve yet, so the first pass runs unfrozen and
                // the frozen pass follows once there is a sequence.
                if (S.cdsInput) { opts.cds = GC.cleanNt(S.cdsInput); if (frozen.length) opts.frozen = frozen; }
                else if (S.optimisedCds && frozen.length) { opts.cds = S.optimisedCds; opts.frozen = frozen; }
                else opts.protein = S.protein;
                const r = OPT.optimise(opts);
                if (!r.ok) { say('Could not optimise: ' + r.message, 'warn'); return; }
                if (!r.translatesBack) { say('The optimiser produced a sequence that does not translate back to the protein. This is a fault; the result has been discarded.', 'stop'); return; }
                S.opt = r;
                S.optimisedCds = r.dna;
                if (!S.protein) S.protein = r.protein;
                S.assembly = null; S.qc = null; S.models = null;
                say('Optimised ' + commas(r.dna.length) + ' nt with the "' + OPT.presetById(S.optimisePreset).name + '" objective.'
                    + (r.before ? ' CpG per kb ' + r.before.cpgPerKb.toFixed(1) + ' → ' + r.metrics.cpgPerKb.toFixed(1) + '.' : '')
                    + (r.frozenCodons ? ' ' + r.frozenCodons + ' codons frozen and verified intact.' : ''));
            } catch (e) {
                say('The optimisation failed: ' + (e && e.message ? e.message : e), 'stop');
            } finally { try { spin.stop(); } catch (e) { } }
            render();
        };

        const saveDesign = async () => {
            const name = prompt('Save the design as:', S.name || 'design');
            if (name == null) return;
            const spin = await exec('baja/lib/work-spinner.js', 'Saving…');
            try {
                S.name = ('' + name).replace(/\.tottenham$/i, '');
                const r = await STORE.save(S, '', name);
                if (r.ok) say('Saved ' + r.name + ' to My Files.');
                else say('Not saved: ' + r.message, 'warn');
            } catch (e) { say('Not saved: ' + (e && e.message ? e.message : e), 'warn'); }
            finally { try { spin.stop(); } catch (e) { } render(); }
        };

        const applyDoc = (doc) => {
            S = Object.assign(S, STORE.toState(doc), { opt: null, scan: null, structure: null, assembly: null, qc: null, models: null });
            tab = 'payload'; drawTabs();
            say('Opened ' + (doc.name || 'the design') + '. Every score is recomputed rather than read from the file, because the models it was written against may have changed — build again.');
            render();
        };

        const openDesign = async () => {
            const over = document.createElement('div');
            over.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(3,12,24,0.86);display:flex;align-items:center;justify-content:center;padding:40px;';
            over.innerHTML = '<div style="background:#0a1e3a;border:1px solid rgba(255,255,255,0.14);border-radius:12px;width:min(820px,96vw);overflow:hidden;">'
                + '<div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;gap:12px;">'
                + '<b style="font:700 15px Arial;color:#fff;">Open a design</b><span style="font:12px Arial;color:#9fb3c8;">Files ending in .tottenham</span>'
                + '<button id="tt-open-cancel" class="tt-btn" style="margin-left:auto;">Cancel</button></div>'
                + '<div style="padding:20px;"><div style="display:flex;gap:8px;">'
                + '<input type="text" id="tt-open-path" placeholder="/…/design.tottenham" style="flex:1 1 auto;background:#071a30;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:7px;padding:9px 11px;font:13px Arial;">'
                + '<button id="tt-open-go" class="tt-btn go">Open</button></div>'
                + '<div style="color:#9fb3c8;font:12.5px/1.6 Arial;margin-top:12px;">Or <button id="tt-open-browse" class="tt-btn" style="padding:6px 12px;">browse My Files</button> — that leaves this design, so save it first.</div>'
                + '</div></div>';
            document.body.appendChild(over);
            const close = () => { try { over.parentNode.removeChild(over); } catch (e) { } };
            over.querySelector('#tt-open-cancel').onclick = close;
            over.querySelector('#tt-open-go').onclick = async () => {
                const p = ('' + over.querySelector('#tt-open-path').value).trim();
                if (!p) return;
                close();
                const spin = await exec('baja/lib/work-spinner.js', 'Opening…');
                try { const r = await STORE.open(p); if (r.ok) applyDoc(r.doc); else say('Could not open it: ' + r.message, 'warn'); }
                catch (e) { say('Could not open it: ' + (e && e.message ? e.message : e), 'warn'); }
                finally { try { spin.stop(); } catch (e) { } }
            };
            over.querySelector('#tt-open-browse').onclick = () => {
                if ((S.protein || S.cdsInput) && !confirm('Browsing My Files leaves this design. Anything unsaved is lost. Continue?')) return;
                close();
                try { panel.parentNode.removeChild(panel); } catch (e) { }
                try { clear(); } catch (e) { }
                showWidget({
                    wid: 'card', height: '100%', width: '100%',
                    data: {
                        cards: [[
                            { 'width': '100%', 'component': { wid: 'html', data: '<div style="padding:14px 16px;font:14px Arial;"><b>Open an mRNA design</b><div style="color:#5b6b7a;margin-top:4px;">Files ending in .tottenham.</div></div>' } },
                            {
                                'width': '100%', 'component': {
                                    wid: 'simple-file-browser', width: '100%', height: '100%',
                                    data: {
                                        width: '100%', columns: 3, showSearch: true, drive: 'user',
                                        user: getUser(), root: '/' + getUser(), filetype: '.tottenham',
                                        'ionfunction.cmd': createIonFunction(() => { }),
                                        'ionfunction.path': createIonFunction(() => { }),
                                        'ionfunction.openfile': createIonFunction(() => { }),
                                        'ionfunction.fileClick': createIonFunction(async (element) => {
                                            try { clear(); } catch (e) { }
                                            window.history.pushState({ 'tottenham': element.path }, 'tottenham', `/app/tottenham/editor?path=${element.path}`);
                                            exec('tottenham/editor', element.path);
                                        })
                                    }
                                }
                            }
                        ]]
                    }
                });
            };
        };

        panel.addEventListener('click', async (e) => {
            const t = e.target;
            const chip = t.closest ? t.closest('[data-mirna]') : null;
            if (chip) {
                const id = chip.getAttribute('data-mirna');
                const i = S.detargeting.indexOf(id);
                if (i >= 0) S.detargeting.splice(i, 1); else S.detargeting.push(id);
                S.assembly = null; S.qc = null; S.models = null;
                render(); return;
            }
            const arch = t.closest ? t.closest('[data-arch]') : null;
            if (arch) {
                S.architecture = arch.getAttribute('data-arch');
                S.assembly = null; S.qc = null; S.models = null;
                render(); return;
            }
            const el = t.closest ? t.closest('[data-act]') : null;
            if (!el) return;
            const act = el.getAttribute('data-act');

            if (act === 'close') {
                // Confirm before leaving. This editor holds work that lives only in the page until
                // it is saved, so closing is destructive and is treated as such. The dialog stacks
                // above the editor and defaults to staying.
                let __leave = true;
                try {
                    __leave = await exec('baja/lib/confirm-leave.js', {
                        title: 'Close the mRNA designer?',
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
            if (act === 'optimise') { await doOptimise(); return; }
            if (act === 'build') { await doBuild(); return; }
            if (act === 'run-models') {
                const spin = await exec('baja/lib/work-spinner.js', 'Running models…');
                try { S.models = await MOD.runAll(null, buildContext()); say('Ran ' + S.models.length + ' model(s).'); }
                catch (e2) { say('A model failed: ' + (e2 && e2.message ? e2.message : e2), 'warn'); }
                finally { try { spin.stop(); } catch (e2) { } render(); }
                return;
            }
            if (act === 'fetch') {
                const q = $('#tt-fetch') ? $('#tt-fetch').value : '';
                el.textContent = '…';
                const r = await fetchProtein(q);
                if (r.ok) { S.protein = r.seq; S.optimisedCds = ''; S.opt = null; S.assembly = null; say('Loaded ' + r.seq.length + ' residues from ' + r.from + '.'); }
                else say('Could not fetch it: ' + r.message, 'warn');
                render(); return;
            }
            if (act === 'dl-report') { download((S.name || 'design') + '.tottenham-report.txt', reportText()); return; }
            if (act === 'dl-fasta') {
                const n = (S.name || 'design').replace(/\s+/g, '_');
                let out = '';
                for (const mol of S.assembly.molecules) {
                    out += fasta(n + '_' + mol.id + '_RNA', mol.rna);
                    out += fasta(n + '_' + mol.id + '_DNA', mol.sequence);
                }
                out += fasta(n + '_CDS_DNA', workingCds());
                download(n + '.fasta', out); return;
            }
            if (act === 'copy-rna') {
                try { await navigator.clipboard.writeText(S.assembly.molecules[0].rna); say('The sequence is on the clipboard.'); }
                catch (e2) { say('The browser would not give access to the clipboard. Use the FASTA download.', 'warn'); }
                return;
            }
        });

        panel.addEventListener('change', (e) => {
            const t = e.target;
            const bind = t.getAttribute && t.getAttribute('data-bind');
            if (bind) {
                let v = t.value;
                if (t.type === 'number') v = (v === '') ? null : +v;
                S[bind] = v;
                // Anything that changes the sequence invalidates what was computed from it.
                if (['protein', 'cdsInput'].indexOf(bind) >= 0) { S.optimisedCds = ''; S.opt = null; }
                S.assembly = null; S.qc = null; S.models = null;
                render(); return;
            }
            const tog = t.getAttribute && t.getAttribute('data-toggle');
            if (tog) { S[tog] = !!t.checked; render(); return; }
        });

        drawTabs();
        render();
        step('open');

        if (path && /\.tottenham$/i.test('' + path)) {
            const spin = await exec('baja/lib/work-spinner.js', 'Opening…');
            try { const r = await STORE.open('' + path); if (r.ok) applyDoc(r.doc); else say('Could not open that file: ' + r.message, 'warn'); }
            catch (e) { say('Could not open that file: ' + (e && e.message ? e.message : e), 'warn'); }
            finally { try { spin.stop(); } catch (e) { } }
        }

        // Subscriber-only. A non-subscriber gets everything above -- laid out, populated,
        // and inert -- behind a notice. Mounted LAST so the interface it covers is the real
        // one rather than an empty shell. Fails open; see baja/lib/subscription-gate.js.
        try {
            await exec('baja/lib/subscription-gate.js', {
                panel: panel,
                name: 'mRNA designer',
                what: 'Designing mRNA constructs, their half-life elements and replicon strategies,'
            });
        } catch (e) { step('subscription gate did not run: ' + (e && e.message ? e.message : e)); }

        // close() is dispose only. The Close BUTTON returns to the home screen; a
        // programmatic caller tearing the editor down is not necessarily navigating.
        return {
            state: () => S,
            setState: (o) => { S = Object.assign(S, o || {}); render(); },
            close: () => { try { panel.parentNode.removeChild(panel); } catch (e) { } }
        };
    })();
}
