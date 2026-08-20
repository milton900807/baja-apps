function (graph, genegraph_panel_layout, oligos) {
    editDistance = 0;

    return new Promise(async (resolve, reject) => {
        let returnMode = 'editdistance'

        graph.setMessage("Loading indexed genomes from the server... ")
        // The indexed genomes and the off-target search are served by the baja app
        // server itself (apiUrl) — GET {apiUrl}/genomes and POST {apiUrl}/off-targets-file.
        // Do NOT reach out to a separate off-target API.
        const server = window["env"]["apiUrl"] || window["env"]["offtarget"] || '';

        // Fetch the server's indexed genomes. Normalizes an object ({name:...}) or
        // an array response into {name: info}.
        const fetchGenomes = async (base) => {
            if (!base) return {};
            try {
                const r = await GETJSON(`${base}/genomes`);
                const out = {};
                if (Array.isArray(r)) {
                    for (const g of r) { if (g) out['' + g] = { name: '' + g }; }
                } else if (r && typeof r === 'object') {
                    for (const k of Object.keys(r)) out[k] = r[k];
                }
                return out;
            } catch (e) {
                console.warn('off-target: /genomes fetch failed for', base, e);
                return {};
            }
        };

        let available_genomes = await fetchGenomes(server);
        if (Object.keys(available_genomes).length === 0) {
            graph.setMessage(" No indexed genomes found on the server. ");
        }
        let splitArray = (array) => {
            const result = [];
            const chunkSize = 5;
            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        }

        let runOffTargets = async (oligos, seqList, __editDistance, genomes) => {
            let rr = []
            for (let o of oligos) {
                o.highlight(1000, "magenta")
            }
            let progressBar;
            let w = {
                wid: 'progress',
                componentRef: 'progressBar',
                data: {
                    'progress': 0,
                    'progressBar': createIonFunction((progessBar) => {
                        progressBar = progessBar;
                    })
                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', w);
            let sp = splitArray(seqList);
            let index = 0;
            for (let s of sp) {
                let obj = {
                    "editDistance": __editDistance,
                    "strand": "+-",
                    "genomes": genomes,
                    "sequences": s,
                    "runMode": returnMode
                }

                // Same baja app server that served /genomes.
                const oep = window["env"]["apiUrl"] || window["env"]["offtarget"] || '';
                let uri = `${oep}/off-targets-file`;
                let r = await POSTJSON(obj, uri)
                rr.push(r)

                if (r != null && r['oligoQuery'] != null) {
                    let oq = r['oligoQuery'];
                    console.log(" setting the asos with offtargets ")
                    for (let o of oligos) {
                        for (let off of oq) {
                            if (String(o.id) == String(off.id)) {
                                if (off.offtarget.length > 1000) {
                                    o.offtarget = off.offtarget.length + ''
                                } else {
                                    o.offtarget = off.offtarget;
                                    if (o.offtarget.length === 0) {
                                        o.offtarget = null;
                                    }
                                }
                                // Gene symbols of the off-target hits come straight from
                                // the search result (each index carries per-transcript
                                // gene_symbol). Distinct list, capped for the on-canvas arc.
                                if (Array.isArray(off.offtargetsymbols) && off.offtargetsymbols.length) {
                                    o.offtargetsymbols = off.offtargetsymbols.slice(0, 30);
                                }
                                o.showOfftargets = true;
                            }
                        }
                    }
                }

                index++;
                progressBar((index / sp.length) * 100)
            }

            graph.setMessage("loading off-targets...")

            await exec('baja/manchester/menu/menu-for-single-aso.js', graph, current, graph.genegraph_panel_layout)

        }

        // Build the sequence list (handles amplicon left/right/mid) and flag repeats.
        const buildSeqList = () => {
            const pattern = /(\w)\1{3,}/g;
            let warn = false;
            const seqList = [];
            for (let o of oligos) {
                if (o.type === 'amplicon') {
                    for (const part of [o.right, o.left, o.mid]) {
                        if (part && part.synthesisSequence && part.synthesisSequence.length > 0) {
                            part.offtarget = null;
                            if (part.synthesisSequence.match(pattern)) { warn = true; graph.setMessage("Found potential high hit pattern."); }
                            seqList.push({ "id": part.id, "synthesisSequence": part.synthesisSequence });
                        }
                    }
                } else {
                    if (!o.synthesisSequence || o.synthesisSequence.length <= 0) o.offtarget = null;
                    if (o.sequence && o.sequence.length > 0) {
                        if (o.sequence.match(pattern)) { warn = true; graph.setMessage("Found potential high hit pattern."); }
                        seqList.push({ "id": o.id, "synthesisSequence": o.synthesisSequence });
                    }
                }
            }
            return { seqList, warn };
        };

        // Run off-targets for a chosen genome + edit distance (confirm on repeats).
        const runWith = async (genome, editDistance) => {
            graph.showSideMenu(null);
            returnMode = 'editdistance';
            graph.setMessage("Checking sequences...");
            const genomes = [genome];
            // Clear ALL off-target attributes on every oligo (and amplicon sub-oligos)
            // before each run so stale results from a previous run are never shown.
            const clearOff = (x) => {
                if (!x) return;
                x.offtarget = null;
                x.offtargetsymbols = null;
                x._offtarget = null;
                x.showOfftargets = false;
            };
            for (const o of oligos) {
                if (o && o.type === 'amplicon') { clearOff(o.left); clearOff(o.right); clearOff(o.mid); clearOff(o); }
                else clearOff(o);
            }
            const { seqList, warn } = buildSeqList();
            const doRun = () => { graph.setMessage(" Edit distance : " + editDistance); runOffTargets(oligos, seqList, editDistance, genomes); };
            if (warn) {
                const confirm = await exec('baja/lib/confirm.js',
                    'Repeat sequences were found.  This could cause a problem with the off-target analysis.  Continue?',
                    async () => { doRun(); });
                showModal(confirm);
            } else {
                doRun();
            }
        };

        // Menu flow: pick a species, then a genome index, then an edit distance, then run.
        const genomeNames = Object.keys(available_genomes);
        const speciesOf = (name) => {
            const s = ('' + name).toLowerCase();
            if (s.includes('human') || s.includes('homo_sapiens') || s.includes('grch38') || /^hg\d/.test(s)) return 'Human';
            if (s.includes('mouse') || s.includes('mus_musculus') || s.includes('grcm') || /^mm\d/.test(s)) return 'Mouse';
            if (s.includes('rat') || s.includes('rattus')) return 'Rat';
            if (s.includes('yeast') || s.includes('cerevisiae')) return 'Yeast';
            if (s.includes('dog') || s.includes('canis')) return 'Dog';
            const pre = ('' + name).split(/[_.]/)[0] || 'Other';
            return pre.charAt(0).toUpperCase() + pre.slice(1);
        };
        const speciesMap = {};
        for (const g of genomeNames) { const sp = speciesOf(g); (speciesMap[sp] = speciesMap[sp] || []).push(g); }
        const speciesList = Object.keys(speciesMap).sort();

        const showEditDistanceMenu = (genome, species) => {
            const m = [0, 1, 2, 3].map((d) => ({
                label: 'Edit distance ' + d, click: () => { runWith(genome, d); }, move: () => { }
            }));
            m.push({ label: '‹ Back to genomes', click: () => { showGenomeMenu(species); }, move: () => { } });
            m.push({ label: 'Cancel', click: () => { graph.showSideMenu(null); }, move: () => { } });
            graph.setMessage(' ' + genome + ' — choose edit distance ');
            graph.showSideMenu(m);
        };
        const showGenomeMenu = (species) => {
            const names = speciesMap[species] || [];
            if (!names.length) { graph.setMessage(' No indexed genomes for ' + species + '. '); return; }
            const m = names.map((g) => ({ label: g, click: () => { showEditDistanceMenu(g, species); }, move: () => { } }));
            m.push({ label: '‹ Back to species', click: () => { showSpeciesMenu(); }, move: () => { } });
            m.push({ label: 'Cancel', click: () => { graph.showSideMenu(null); }, move: () => { } });
            graph.setMessage(' ' + species + ' — select a genome index ');
            graph.showSideMenu(m);
        };
        const showSpeciesMenu = () => {
            if (!speciesList.length) { graph.setMessage(' No indexed genomes found on the server. '); return; }
            if (speciesList.length === 1) { showGenomeMenu(speciesList[0]); return; }   // skip if only one
            const m = speciesList.map((sp) => ({ label: sp + ' (' + speciesMap[sp].length + ')', click: () => { showGenomeMenu(sp); }, move: () => { } }));
            m.push({ label: 'Cancel', click: () => { graph.showSideMenu(null); }, move: () => { } });
            graph.setMessage(' Select a species ');
            graph.showSideMenu(m);
        };
        showSpeciesMenu();
        resolve();

    })

}
