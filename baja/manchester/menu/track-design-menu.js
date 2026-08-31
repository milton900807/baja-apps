function (graph, selectedTrack, genegraph_panel_layout) {

    // Standalone "Design ▸" menu for a single track — Primer probes ▸ | Therapeutics ▸ |
    // Off-targets | Clinical Library. Extracted verbatim from the track menu in
    // mouse-over-highlight.js so BOTH the on-canvas track menu and the info-panel Tracks
    // child menu (gene.js openTracks) open the identical designer.
    //   exec('baja/manchester/menu/track-design-menu.js', graph, track, genegraph_panel_layout)

    // --- menu helpers (copied from mouse-over-highlight.js so ordering/timing match) ---
    const MENU_OPEN_DELAY_MS = 100;
    const orderMenu = (list) => {
        try {
            if (!Array.isArray(list) || list.length < 2) return list;
            const lab = (it) => ('' + (it && (it.label || it.name || ''))).trim();
            const isHeader = (it) => !!(it && it.header);
            const isNav = (it) => { const l = lab(it); return /^(‹|«|<|←|✓|↩)/.test(l) || /(^|\s)(Back|Cancel|Close|Done)\b/i.test(l) || /Back$/i.test(l) || l === 'more...' || l === 'Refresh menu' || l === 'Close menu'; };
            const isSub = (it) => /[▸►]/.test(lab(it));
            const headers = [], subs = [], leaves = [], navs = [];
            for (const it of list) {
                if (!it) { leaves.push(it); continue; }
                if (isHeader(it)) headers.push(it);
                else if (isNav(it)) navs.push(it);
                else if (isSub(it)) subs.push(it);
                else leaves.push(it);
            }
            return headers.concat(subs, leaves, navs);
        } catch (e) { return list; }
    };
    const showSideMenuDelayed = (menu, x, y) => {
        if (menu == null) { if (graph && graph.showSideMenu) graph.showSideMenu(null); return; }
        setTimeout(() => { if (graph && graph.showSideMenu) graph.showSideMenu(orderMenu(menu), x, y); }, MENU_OPEN_DELAY_MS);
    };
    // Called after a design tiles its oligos onto the track: dismiss EVERY on-canvas menu
    // (side + center) and zoom in to frame the track so the new oligos are visible.
    const __afterTileFocus = () => {
        try { if (graph && graph.showSideMenu) graph.showSideMenu(null); } catch (e) { }
        try { if (graph) { graph.menu = null; if (graph.graph) graph.graph.menu = null; } } catch (e) { }
        try {
            const t = selectedTrack;
            if (t && graph.zoomToTrack) graph.zoomToTrack(t);
            else if (t && graph.goToTrack) graph.goToTrack(t);
        } catch (e) { }
        try { if (graph && graph.wake) graph.wake(); } catch (e) { }
    };

    return (async () => {
        graph.setMessage("Loading chemistry database...");
        // Designing on THIS track: select the whole track and its sequence so the
        // design tools operate on it.
        try { if (selectedTrack) { selectedTrack.selectTrackAndSeq(); } } catch (e) { }
        const selected = async (v) => {
            graph.props.selected_chemistry = v;
            setTimeout(async () => {
                // await exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout);
                // graph.setMessage(" Chemistry selected : " + graph.props.selected_chemistry.name);
            }, 1000);
        };
        // Therapeutic oligo designers — grouped under "Therapeutics ▸" below.
        let therapeutics = [
            {
                label: "siRNA",
                click: async (scx, scy) => {
                    let progress = new EngineMonitor(async (msg) => {
                        graph.setCenterMessage(msg)
                    });
                    const str = `py/sirna/design.py`


                    // Default vs Advanced design dialog (navy demo look-and-feel).
                    // Advanced lets the user tune lengths, overhangs, alphabet and the
                    // per-component scoring weights that drive the ranking algorithm.
                    const showSirnaDesignDialog = () => new Promise((resolve) => {
                        try {
                            const old = document.getElementById('baja-sirna-design'); if (old && old.parentNode) old.parentNode.removeChild(old);
                            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 4px;';
                            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
                            const panel = document.createElement('div');
                            panel.id = 'baja-sirna-design';
                            panel.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:86vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';
                            panel.innerHTML = ''
                                + '<div style="font:700 17px Arial;margin-bottom:2px;">siRNA Design</div>'
                                + '<div style="font:13px Arial;color:#9fb3c8;margin-bottom:12px;">Choose Default, or Advanced to tune the design algorithm.</div>'
                                + '<div style="display:inline-flex;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:3px;">'
                                + '<button id="sd-default" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:#22c55e;color:#04210f;">Default</button>'
                                + '<button id="sd-advanced" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:transparent;color:#fff;">Advanced</button>'
                                + '</div>'
                                + '<label style="' + lbl + '">Maximum candidates</label>'
                                + '<input id="sd-topn" type="number" min="1" max="1000" value="100" style="' + inp + '"/>'
                                + '<label style="' + lbl + '">Template chemistry</label>'
                                + '<select id="sd-chem" style="' + inp + '">'
                                + '<option value="standard">2\'-F / 2\'-OMe (standard)</option>'
                                + '<option value="esc">ESC (Enhanced Stabilization)</option>'
                                + '<option value="esc_plus">Advanced ESC (ESC+)</option>'
                                + '<option value="galnac_esc">GalNAc-conjugated ESC</option>'
                                + '<option value="all_2ome">Fully 2\'-OMe</option>'
                                + '</select>'
                                + '<div id="sd-adv" style="display:none;">'
                                + '<label style="' + lbl + '">siRNA lengths</label>'
                                + '<div style="display:flex;gap:16px;font:13px Arial;"><label><input type="checkbox" id="sd-l21" checked/> 21</label><label><input type="checkbox" id="sd-l22" checked/> 22</label><label><input type="checkbox" id="sd-l23" checked/> 23</label></div>'
                                + '<label style="' + lbl + '">Output alphabet</label>'
                                + '<select id="sd-alpha" style="' + inp + '"><option value="DNA">DNA</option><option value="RNA">RNA</option></select>'
                                + '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Sense 3\' overhang</label><input id="sd-soh" value="dTdT" style="' + inp + '"/></div><div style="flex:1;"><label style="' + lbl + '">Antisense 3\' overhang</label><input id="sd-aoh" value="" style="' + inp + '"/></div></div>'
                                + '<div style="font:700 12px Arial;color:#4fd0e6;margin:16px 0 2px;">Scoring weights (multipliers)</div>'
                                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">'
                                + '<div><label style="' + lbl + '">GC content</label><input id="sd-w-gc" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Seed A/U (2–8)</label><input id="sd-w-seed" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Duplex-end ΔΔG</label><input id="sd-w-end" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Antisense pos 1</label><input id="sd-w-ap1" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Sense pos 1</label><input id="sd-w-sp1" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Repeats/runs</label><input id="sd-w-rep" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '</div></div>'
                                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">'
                                + '<button id="sd-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                                + '<button id="sd-run" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Run design</button>'
                                + '</div>';
                            document.body.appendChild(panel);
                            const q = (id) => panel.querySelector(id);
                            let mode = 'default';
                            const setMode = (m) => {
                                mode = m;
                                q('#sd-adv').style.display = (m === 'advanced') ? 'block' : 'none';
                                q('#sd-default').style.background = (m === 'default') ? '#22c55e' : 'transparent';
                                q('#sd-default').style.color = (m === 'default') ? '#04210f' : '#fff';
                                q('#sd-advanced').style.background = (m === 'advanced') ? '#22c55e' : 'transparent';
                                q('#sd-advanced').style.color = (m === 'advanced') ? '#04210f' : '#fff';
                            };
                            q('#sd-default').onclick = () => setMode('default');
                            q('#sd-advanced').onclick = () => setMode('advanced');
                            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
                            q('#sd-cancel').onclick = () => { close(); resolve(null); };
                            q('#sd-run').onclick = () => {
                                // Clicking Run design dismisses any on-canvas menus (side + center).
                                try { if (graph && graph.showSideMenu) graph.showSideMenu(null); } catch (e) { }
                                try { if (graph) { graph.menu = null; if (graph.graph) graph.graph.menu = null; if (graph.wake) graph.wake(); } } catch (e) { }
                                const topn = Math.max(1, Math.min(1000, parseInt(q('#sd-topn').value, 10) || 100));
                                let params;
                                if (mode === 'advanced') {
                                    const lengths = [];
                                    if (q('#sd-l21').checked) lengths.push(21);
                                    if (q('#sd-l22').checked) lengths.push(22);
                                    if (q('#sd-l23').checked) lengths.push(23);
                                    const num = (id, d) => { const v = parseFloat(q(id).value); return Number.isFinite(v) ? v : d; };
                                    params = {
                                        top_n: topn,
                                        lengths: lengths.length ? lengths : [21, 22, 23],
                                        output_alphabet: q('#sd-alpha').value || 'DNA',
                                        senseOverhang: q('#sd-soh').value || '',
                                        antisenseOverhang: q('#sd-aoh').value || '',
                                        chemistry_template: (q('#sd-chem') ? q('#sd-chem').value : 'standard'),
                                        weights: {
                                            gc: num('#sd-w-gc', 1), seed_au: num('#sd-w-seed', 1),
                                            end_asymmetry_ddg: num('#sd-w-end', 1), antisense_pos1: num('#sd-w-ap1', 1),
                                            sense_pos1: num('#sd-w-sp1', 1), repeats_and_runs: num('#sd-w-rep', 1)
                                        }
                                    };
                                } else {
                                    params = { top_n: topn, lengths: [21, 22, 23], output_alphabet: 'DNA', senseOverhang: 'dTdT', antisenseOverhang: '', chemistry_template: (q('#sd-chem') ? q('#sd-chem').value : 'standard'), weights: {} };
                                }
                                close(); resolve(params);
                            };
                        } catch (e) { resolve(null); }
                    });
                    const __p = await showSirnaDesignDialog();
                    if (!__p) return;   // cancelled
                    let json_input = {
                        sequence: selectedTrack.sequence,
                        // The track sequence is the SENSE mRNA (5'->3'), so the guide is ALWAYS its
                        // reverse-complement — independent of the gene's genomic strand. Passing the
                        // track's (possibly -1) strand made the designer emit complement(target) for
                        // minus-strand genes (e.g. KRAS), which is the wrong guide AND matched nothing
                        // in the off-target index. Design on the sense mRNA => strand 1.
                        strand: 1,
                        top_n: __p.top_n,
                        lengths: __p.lengths,
                        overhangs: { sense: __p.senseOverhang, antisense: __p.antisenseOverhang },
                        output_alphabet: __p.output_alphabet,
                        chemistry_template: __p.chemistry_template,
                        weights: __p.weights
                    }







                    let r = await exec(str, progress, json_input);

                    // siRNA design does NOT touch the buttonMenuPanel — leave it as-is.

                    let SIRNA = await exec('flexigraph/sirna.js')
                    let Amplicon = await exec('flexigraph/amplicon.js')
                    function scoreToColor(score) {
                        if (score >= 40) return "limegreen";
                        if (score >= 25) return "gold";
                        if (score >= 10) return "orange";
                        return "red";
                    }
                    function buildSirnaArray(resultJson, options = {}) {
                        if (!resultJson || !Array.isArray(resultJson.top_candidates)) {
                            console.warn("Invalid siRNA result JSON");
                            return [];
                        }

                        const {
                            strand = selectedTrack.strand,
                            y = 0.3,
                            type = "siRNA",
                            track = selectedTrack
                        } = options;

                        const sirnas = [];

                        resultJson.top_candidates.forEach((c) => {
                            try {
                                const xi = c.start;
                                const xf = c.end;

                                const sequence = c.target_site_input_alphabet || c.sense_strand || "";
                                const sense = c.sense_strand || "";
                                const antisense = c.antisense_strand || "";

                                // These are already constructed by the backend after overhang application.
                                // If one side has no overhang, that duplex should just equal the core strand.
                                const senseDuplex =
                                    c.sense_duplex !== undefined && c.sense_duplex !== null
                                        ? c.sense_duplex
                                        : sense;

                                const antisenseDuplex =
                                    c.antisense_duplex !== undefined && c.antisense_duplex !== null
                                        ? c.antisense_duplex
                                        : antisense;

                                const senseOverhang =
                                    c.sense_overhang !== undefined && c.sense_overhang !== null
                                        ? c.sense_overhang
                                        : "";

                                const antisenseOverhang =
                                    c.antisense_overhang !== undefined && c.antisense_overhang !== null
                                        ? c.antisense_overhang
                                        : "";

                                const structure = `${senseDuplex}|${antisenseDuplex}`;

                                const sirna = new SIRNA(
                                    type,
                                    sequence,
                                    sense,
                                    antisense,
                                    xi,
                                    xf,
                                    y,
                                    strand,
                                    structure
                                );

                                // Core strands
                                sirna.sequence = sequence;
                                sirna.sense = sense;
                                sirna.antisense = antisense;

                                // Duplex/display strands
                                sirna.senseDuplex = senseDuplex;
                                sirna.antisenseDuplex = antisenseDuplex;
                                sirna.senseOverhang = senseOverhang;
                                sirna.antisenseOverhang = antisenseOverhang;

                                // Keep seed logic on the core antisense unless you explicitly want overhangs included
                                sirna.synthesisSequence = antisense;
                                sirna.synthesisSequenceDuplex = antisenseDuplex;

                                sirna.score = c.score;
                                sirna.gc_percent = c.gc_percent;
                                sirna.rank = c.rank;
                                sirna.notes = c.notes || [];
                                // Itemized per-candidate scoring + nearest-neighbor thermodynamics
                                // (ΔG°37, ΔH, ΔS, Tm, duplex-end ΔΔG, internal stability profile).
                                sirna.design_scores = c.design_scores || {};
                                sirna.target_site = c.target_site_input_alphabet || sequence;
                                sirna.targetSiteRna = c.target_site_rna || null;
                                sirna.senseCoreRna = c.sense_core_rna || null;
                                sirna.antisenseCoreRna = c.antisense_core_rna || null;

                                sirna.color = scoreToColor(c.score);

                                if (track && typeof track.addOligo === "function") {
                                    track.addOligo(sirna);
                                    // Magenta glow as each siRNA lands — staggered by add order so you can
                                    // see where they fall on the track (like ASO design).
                                    try {
                                        const __gi = sirnas.length;
                                        setTimeout(() => { try { sirna.highlight(1800, 'magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, __gi * 120);
                                    } catch (e) { }
                                }

                                sirnas.push(sirna);
                            } catch (e) {
                                console.error("Failed to build siRNA:", c, e);
                            }
                        });

                        return sirnas;
                    }
                    const sirnaArray = buildSirnaArray(r, {
                        strand: selectedTrack.strand,
                        y: 0.3
                    });



                    for (let i of sirnaArray) {
                        const length = Math.abs(i.xf - i.xi)
                        i.xi += selectedTrack.xi;
                        i.xf = i.xi + length
                        selectedTrack.addOligo(i)
                    }
                    // Tiled onto the track — clear all menus and zoom into the track.
                    __afterTileFocus();


                    // showModal({
                    //     wid: 'json',
                    //     data: JSON.stringify(selectedTrack.oligos)
                    // })
                }
            },

            {
                label: "Gapmer ASO",
                click: async (scx, scy) => {


                    let progress = new EngineMonitor(async (msg) => {
                        graph.setCenterMessage(msg)
                    });

                    let Oligo = await exec('flexigraph/oligo.js');
                    const str = `py/ssaso/design.py`;
                    // Default / Advanced design dialog — the LAST interface before the design runs.
                    const __p = await exec('baja/manchester/menu/aso-design-dialog.js', 'gapmer');
                    if (!__p) return;   // cancelled
                    let va = parseInt(__p.top_n) || 100;
                    let _sequence = selectedTrack.sequence;

                    let json_input = {
                        "sequence": _sequence,
                        // Sense mRNA — the ASO is the reverse-complement of the target regardless of
                        // the gene's genomic strand (same fix as siRNA; minus-strand genes otherwise
                        // got complement(target), which is wrong and finds no off-targets).
                        "strand": 1,
                        "top_n": va,

                        "lengths": __p.lengths || [16, 17, 18, 19, 20],
                        "gap_sizes": __p.gap_sizes || [8, 9, 10],

                        "wing_modification": __p.wing_modification || "LNA",
                        "default_backbone": __p.default_backbone || "PS",
                        "po_link_positions": [],

                        "output_alphabet": __p.output_alphabet || "DNA",
                        "enforce_non_overlapping": (__p.enforce_non_overlapping != null ? __p.enforce_non_overlapping : false),

                        "helm_symbols": {
                            "DNA": "d",
                            "LNA": "lna",
                            "2'-OMe": "m",
                            "2'-MOE": "moe"
                        },

                        "min_separation": 0,

                        "endonuclease_motifs": [
                            "GAATTC",   // EcoRI
                            "GGATCC",   // BamHI
                            "AAGCTT",   // HindIII
                            "GCGGCCGC", // NotI
                            "CTCGAG"    // XhoI
                        ],

                        "exclude_gap_cleavage_motif_hits": true
                    }

                    let r = await exec(str, progress, json_input);






                    function normalizedScoreToColor(score) {
                        const s = Number(score ?? 0);
                        if (s >= 0.80) return "limegreen";
                        if (s >= 0.55) return "gold";
                        if (s >= 0.30) return "orange";
                        return "red";
                    }

                    function formatScore(score) {
                        const s = Number(score);
                        return Number.isFinite(s) ? s.toFixed(3) : "0.000";
                    }

                    function formatRawScore(score) {
                        const s = Number(score);
                        return Number.isFinite(s) ? s.toFixed(2) : "0.00";
                    }

                    function buildGapmerArray(resultJson, options = {}) {
                        const candidates = Array.isArray(resultJson?.hits)
                            ? resultJson.hits
                            : Array.isArray(resultJson?.top_candidates)
                                ? resultJson.top_candidates
                                : [];

                        if (!candidates.length) {
                            console.warn("Invalid gapmer result JSON");
                            return [];
                        }

                        const {
                            strand = selectedTrack.strand,
                            y = 0.2,
                            type = "gapmer",
                            track = selectedTrack
                        } = options;

                        const oligos = [];

                        candidates.forEach((c) => {
                            try {
                                const xi = c.start;
                                const xf = c.end;

                                const antisense = c.antisense_display || "";
                                const target = c.target_site_input_alphabet || "";
                                const name = antisense || target || `gapmer_${xi}_${xf}`;

                                const structure =
                                    (typeof c.structure === "string" && c.structure.trim().length > 0)
                                        ? c.structure
                                        : "";

                                const oligo = new Oligo(
                                    type,
                                    name,
                                    structure,
                                    xi,
                                    xf,
                                    y
                                );

                                oligo.setStrand(strand);

                                // Core identity
                                oligo.name = name;
                                oligo.sequence = antisense;
                                oligo.synthesisSequence = antisense;
                                oligo.targetSequence = target;
                                oligo.targetSite = target;
                                oligo.targetSiteRna = c.target_site_rna || null;
                                oligo.antisense = antisense;
                                oligo.antisenseCoreRna = c.antisense_core_rna || null;

                                // HELM / chemistry
                                oligo.structure = structure;
                                oligo.helm = structure;
                                oligo.chemistryLayout = Array.isArray(c.chemistry_layout) ? c.chemistry_layout : [];
                                oligo.backbonePattern = Array.isArray(c.backbone_pattern) ? c.backbone_pattern : [];
                                oligo.wingModification = c.wing_modification || null;

                                // Gapmer design metadata
                                oligo.designType = "gapmer";
                                oligo.rank = c.rank ?? null;

                                // Keep both raw and normalized scores
                                oligo.score = Number(c.normalized_score ?? 0);
                                oligo.normalized_score = Number(c.normalized_score ?? 0);
                                oligo.raw_score = Number(c.score ?? 0);

                                oligo.gc_percent = c.gc_percent;
                                oligo.tm = c.tm_c;
                                oligo.tm_c = c.tm_c;
                                oligo.tmModificationBonus = c.tm_modification_bonus_c ?? 0;
                                oligo.tmMethod = c.tm_method || null;

                                oligo.length = c.length;
                                oligo.gapSize = c.gap_size;
                                oligo.gapStart = c.gap_start_1based;
                                oligo.gapEnd = c.gap_end_1based;
                                oligo.leftWingSize = c.left_wing_size;
                                oligo.rightWingSize = c.right_wing_size;
                                oligo.notes = c.notes || [];

                                // Label normalized score (0-1)
                                oligo.setLabelAttribute("normalized_score", {
                                    prefix: "Score: ",
                                    offsetY: -18,
                                    textColor: "maroon",
                                    fillColor: "white",
                                    strokeColor: "black",
                                    font: "10px Arial",
                                    formatter: (v) => formatScore(v)
                                });

                                // Optional second label for raw score if useful
                                oligo.setLabelAttribute("raw_score", {
                                    prefix: "Score ",
                                    offsetY: -32,
                                    textColor: "navy",
                                    fillColor: "white",
                                    strokeColor: "black",
                                    font: "10px Arial",
                                    formatter: (v) => formatRawScore(v)
                                });

                                oligo.color = normalizedScoreToColor(c.normalized_score);

                                oligos.push(oligo);
                            } catch (e) {
                                console.error("Failed to build gapmer:", c, e);
                            }
                        });

                        if (track && typeof track.addOligo === "function") {
                            for (const oligo of oligos) {
                                const length = Math.abs(oligo.xf - oligo.xi)
                                oligo.xi += track.xi;
                                oligo.xf = oligo.xi + length
                                track.addOligo(oligo);
                            }
                        }
                        return oligos;
                    }
                    const gapmerArray = buildGapmerArray(r, {
                        strand: selectedTrack.strand,
                        y: 0.3,
                        track: selectedTrack
                    });
                    // Tiled onto the track — clear all menus and zoom into the track.
                    __afterTileFocus();

                    // // Optional:
                    // showModal({
                    //     wid: 'json',
                    //     data: JSON.stringify(gapmerArray, null, 2)
                    // });
                }
            },
            {
                label: "Steric-blocking ASO",
                click: async (scx, scy) => {
                    let progress = new EngineMonitor(async (msg) => {
                    });

                    let Oligo = await exec('flexigraph/oligo.js');

                    const str = `py/ssaso/design-steric-blocking.py`;

                    // Default / Advanced design dialog — the LAST interface before the design runs.
                    const __p = await exec('baja/manchester/menu/aso-design-dialog.js', 'steric');
                    if (!__p) return;   // cancelled
                    let _sequence = selectedTrack.sequence;

                    let json_input = {
                        sequence: _sequence,
                        // Sense mRNA — ASO is the reverse-complement of the target (same fix as siRNA).
                        strand: 1,
                        top_n: parseInt(__p.top_n) || 100,
                        lengths: __p.lengths || [18, 19, 20],
                        full_modification: __p.wing_modification || "2'-MOE",
                        default_backbone: __p.default_backbone || "PS",
                        po_link_positions: [],
                        output_alphabet: __p.output_alphabet || "DNA",
                        enforce_non_overlapping: (__p.enforce_non_overlapping != null ? __p.enforce_non_overlapping : false),
                        annotations: [] // optional: populate if you have site annotations
                    };

                    let r = await exec(str, progress, json_input);



                    function scoreToColor(score) {
                        if (score >= 40) return "limegreen";
                        if (score >= 25) return "gold";
                        if (score >= 10) return "orange";
                        return "red";
                    }

                    showModal({
                        wid: 'json',
                        data: JSON.stringify(r, null, 2)
                    });

                    function buildStericBlockingArray(resultJson, options = {}) {
                        if (!resultJson || !Array.isArray(resultJson.top_candidates)) {
                            console.warn("Invalid steric-blocking result JSON");
                            return [];
                        }

                        const {
                            strand = selectedTrack.strand,
                            y = 0.2,
                            type = "steric_blocking_aso",
                            track = selectedTrack
                        } = options;

                        const oligos = [];

                        resultJson.top_candidates.forEach((c) => {
                            try {
                                const xi = c.start;
                                const xf = c.end;

                                const antisense = c.antisense_display || "";
                                const target = c.target_site_input_alphabet || "";
                                const name = antisense || target || `steric_${xi}_${xf}`;

                                const structure =
                                    (typeof c.structure === "string" && c.structure.trim().length > 0)
                                        ? c.structure
                                        : "";

                                const oligo = new Oligo(
                                    type,
                                    name,
                                    structure,
                                    xi,
                                    xf,
                                    y
                                );

                                oligo.setStrand(strand);

                                // Core identity
                                oligo.name = name;
                                oligo.sequence = antisense;
                                oligo.synthesisSequence = antisense;
                                oligo.targetSequence = target;
                                oligo.targetSite = target;
                                oligo.targetSiteRna = c.target_site_rna || null;
                                oligo.antisense = antisense;
                                oligo.antisenseCoreRna = c.antisense_core_rna || null;

                                // HELM / chemistry
                                oligo.structure = structure;
                                oligo.helm = structure;
                                oligo.chemistryLayout = Array.isArray(c.chemistry_layout) ? c.chemistry_layout : [];
                                oligo.backbonePattern = Array.isArray(c.backbone_pattern) ? c.backbone_pattern : [];
                                oligo.fullModification = c.full_modification || resultJson.full_modification || null;

                                // Steric-blocking metadata
                                oligo.designType = c.design_type || resultJson.design_type || "steric_blocking_aso";
                                oligo.rank = c.rank;
                                oligo.score = c.score;
                                oligo.gc_percent = c.gc_percent;
                                oligo.tm = c.tm_c;
                                oligo.tm_c = c.tm_c;
                                oligo.length = c.length;
                                oligo.notes = c.notes || [];

                                // Optional annotation metadata from backend
                                oligo.annotationHits = Array.isArray(c.annotation_hits) ? c.annotation_hits : [];
                                oligo.annotationScore = c.annotation_score || 0;

                                oligo.setLabelAttribute("score", {
                                    prefix: "Score: ",
                                    offsetY: -18,
                                    textColor: "maroon",
                                    fillColor: "white",
                                    strokeColor: "black",
                                    font: "10px Arial"
                                });

                                oligo.color = scoreToColor(c.score);

                                oligos.push(oligo);
                            } catch (e) {
                                console.error("Failed to build steric-blocking ASO:", c, e);
                            }
                        });

                        if (track && typeof track.addOligo === "function") {
                            for (const oligo of oligos) {
                                track.addOligo(oligo);
                            }
                        }

                        return oligos;
                    }

                    const stericBlockingArray = buildStericBlockingArray(r, {
                        strand: selectedTrack.strand,
                        y: 0.3,
                        track: selectedTrack
                    });
                    // Tiled onto the track — clear all menus and zoom into the track.
                    __afterTileFocus();

                    // Optional:
                    // showModal({
                    //     wid: 'json',
                    //     data: JSON.stringify(stericBlockingArray, null, 2)
                    // });
                }
            },
        ];

        const offTargetsItem = {
            label: "Off-targets",
            move: () => { },
            click: async (scx, scy) => {
                // Off-target count for an oligo — matches the on-canvas badge:
                // distinct off-target GENES, else offtargetsymbols count, else
                // the raw Levenshtein hit count.
                const otCount = (o) => {
                    if (!o) return 0;
                    let ot = (o.offtarget != null) ? o.offtarget : o._offtarget;
                    if (ot == null) return 0;
                    if (Array.isArray(ot)) {
                        const genes = new Set(ot.map((h) => h && h.symbol).filter(Boolean)).size;
                        if (genes) return genes;
                        if (o.offtargetsymbols && o.offtargetsymbols.length) return o.offtargetsymbols.length;
                        return ot.length;
                    }
                    if (typeof ot === 'number') return ot;
                    if (typeof ot === 'string') {
                        const n = parseInt(ot, 10);
                        if (!isNaN(n)) return n;
                        return (o.offtargetsymbols && o.offtargetsymbols.length) ? o.offtargetsymbols.length : 0;
                    }
                    return 0;
                };
                const otSub = [
                    {
                        label: "Filter by off-target count",
                        move: () => { },
                        click: async () => {
                            const vap = await prompt("Maximum allowable off-targets:", ["Max"], { "Max": 5 }, 520, 300);
                            if (!vap) return;
                            const max = parseInt(vap["Max"], 10);
                            if (!Number.isInteger(max) || max < 0) {
                                infoPrompt("Please enter a non-negative integer.");
                                return;
                            }
                            graph.pushOntoHistory();
                            const removed = [];
                            const kept = [];
                            for (const o of (selectedTrack.oligos || [])) {
                                const isAmp = !!(o && (o.type === 'amplicon' || (o.left && o.right)));
                                const n = otCount(o);
                                // Auto-remove any oligo whose off-target count exceeds the max.
                                if (!isAmp && n > max) {
                                    removed.push({ id: (o.id != null ? o.id : (o.name || '?')), n });
                                } else {
                                    kept.push(o);
                                }
                            }
                            selectedTrack.oligos = kept;
                            try { if (graph.wake) graph.wake(); } catch (e) { }
                            graph.showSideMenu(null);
                            if (removed.length) {
                                const lines = removed.map((r) => 'removed ' + r.id + ' with OT ' + r.n);
                                try { lines.forEach((l) => log(l)); } catch (e) { }
                                graph.setMessage(' ' + removed.length + ' oligo(s) over ' + max + ' off-targets removed:  ' + lines.join('   |   ') + ' ');
                            } else {
                                graph.setMessage(' No oligos exceeded ' + max + ' off-targets. ');
                            }
                        }
                    },
                    {
                        label: "← Back",
                        move: () => { },
                        click: () => { showSideMenuDelayed(submenu); }
                    }
                ];
                showSideMenuDelayed(otSub);
            }
        };









        // Primer-probe assay design (primer3 / djPrimer / exon-exon) on the
        // highlighted region of this track — brought up under "Primer probes ▸".
        const __ppRefresh = () => { graph.setMouseMode('navigate'); try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };
        const __needMark = () => { if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) return true; infoPrompt(' Highlight a region on the track first. '); return false; };
        const runPrimer3 = async () => {
            if (!__needMark()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            const sequence = selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend);
            graph.setMessage(' Generating primers (primer3)... ');
            const em = new EngineMonitor((msg) => { try { graph.setMessage(msg); } catch (e) { } });
            const r = await exec('/py/ppsets/generate-ppsets.py', em, '' + sequence, '', 1);
            await exec('baja/manchester/ppsets/apply-primer3.js', r, selectedTrack.markstart - selectedTrack.xi, selectedTrack, graph);
            if (graph.wake) graph.wake();
            __ppRefresh();
        };
        const runDjprimer = async () => {
            if (!__needMark()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            const sequence = selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend);
            const gene = selectedTrack.geneID || selectedTrack.name || '';
            const opts = JSON.stringify({ scorer: 'djprimer', gene: '' + gene });
            graph.setMessage(' Designing primers (djPrimer)... ');
            const r = await exec('py/ppsets/models/find-primer-amplicons.py', '' + sequence, '', '', opts);
            selectedTrack.ampliconResults = r;
            await exec('baja/manchester/ppsets/apply-djprimer.js', r, selectedTrack.markstart - selectedTrack.xi, selectedTrack, graph);
            if (graph.wake) graph.wake();
            __ppRefresh();
        };
        const runExonExon = async () => {
            if (!__needMark()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            const r = await exec('py/ppsets/models/find-primer-amplicons-exon-exon.py', selectedTrack);
            selectedTrack.ampliconResults = r;
            showModal({ wid: 'json', data: JSON.stringify(r) });
        };

        const backToDesign = { label: '‹ Back', move: () => { }, click: () => { showSideMenuDelayed(submenu); } };
        const primerProbesItem = {
            label: 'Primer probes ▸', move: () => { },
            click: () => {
                showSideMenuDelayed([
                    { label: 'primer3', move: () => { }, click: () => { graph.showSideMenu(null); runPrimer3(); } },
                    { label: 'djPrimer (assay success)', move: () => { }, click: () => { graph.showSideMenu(null); runDjprimer(); } },
                    { label: 'Exon-exon primer-probes', move: () => { }, click: () => { graph.showSideMenu(null); runExonExon(); } },
                    backToDesign
                ]);
            }
        };
        const therapeuticsItem = {
            label: 'Therapeutics ▸', move: () => { },
            click: () => { showSideMenuDelayed(therapeutics.concat([backToDesign])); }
        };
        const clinicalLibraryItem = {
            label: 'Clinical Library', move: () => { },
            click: () => { try { graph.showSideMenu(null); } catch (e) { } try { exec('manchester/clinical-library.js', graph, genegraph_panel_layout); } catch (e) { } }
        };

        // Design ▸  Primer probes ▸ | Therapeutics ▸ | Off-targets | Clinical Library
        const submenu = [primerProbesItem, therapeuticsItem, offTargetsItem, clinicalLibraryItem];

        setTimeout(() => {

            showSideMenuDelayed(submenu)

        }, 1000)

    })();
}
