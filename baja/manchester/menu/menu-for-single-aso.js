function (graph, oligo, genegraph_panel_layout) {
    hide_menu = false;

    console.log('debubg');

    return new Promise(async (resolve, reject) => {
        let registered = false;
        // CurrentLayout.clearComponent('labelPanel')
        // CurrentLayout.setComponent('labelPanel', {
        //     wid: 'html',
        //     data: `${oligo.sequence} loading...`
        // });

        const dbhost = window["env"]["db"];
        if (dbhost) {
            if (oligo.synthesisSequence != null && oligo.structure != null && oligo.synthesisSequence.length > 0 && oligo.structure.length > 0) {
                let r = await POSTJSON([oligo], `${dbhost}/verify`);
                if (oligo.synthesisSequence && oligo.structure && r[`${oligo.synthesisSequence}-${oligo.structure}`] && r[`${oligo.synthesisSequence}-${oligo.structure}`].id) {
                    oligo.id = r[`${oligo.synthesisSequence}-${oligo.structure}`].id
                }
            }
        }
        if (oligo.type === 'amplicon') {
            let labelPan = {
                wid: 'html',
                data: 'Primer-amp  ' + oligo.id
            }
            const models = [
                {
                    label: ' View properties',
                    click: async (xwc, ywc) => {
                        showModal({
                            wid: 'json',
                            data: JSON.stringify(oligo)
                        }, 1000, 500);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Remove all other primers on this track',
                    click: async (xwc, ywc) => {
                        let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                            for (let t of graph.track) {
                                for (let o of t.oligos) {
                                    if (o.id === oligo.id) {
                                        let count = t.countOligosOfType('amplicon');
                                        t.removeOligosOfType('amplicon');
                                        graph.setMessage(" Removed " + (count - 1) + " amplicons. ");
                                        t.addOligo(oligo);
                                    }
                                }
                            }
                        }, " Are you sure you want to remove all amplicons except this one?");
                        showModal(confirm);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Set probe',
                    click: async (xwc, ywc) => {
                        let attr_window = 20;
                        let va;

                        do {
                            va = await prompt("Length", ["Length"], { "Length": attr_window }, 300, 300);
                            if (va === null || va['Length'] === null) {
                                attr_window = 20;
                                break;
                            }
                        } while (!Number.isInteger(Number(va['Length'])));

                        if (va && va['Length'] !== null) {
                            attr_window = parseInt(va['Length'], 10);
                        }

                        graph.rungraph(async () => {
                            await exec('baja/manchester/menu/probe-action.js', graph, genegraph_panel_layout, attr_window);
                        });

                        CurrentLayout.setComponent('labelPanel', {
                            wid: 'html',
                            data: ' Click on a track to see menu options... '
                        });
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Move (Y)',
                    click: async (xwc, ywc) => {
                        exec('baja/manchester/menu/move-oligos-vertical.js', graph);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: `Off-target / Run off-target on ppset ${oligo.id}`,
                    click: async (xwc, ywc) => {
                        let l = oligo.left;
                        let r = oligo.right;
                        let m = oligo.mid;

                        if (l && r && m) {
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l, r, m]);
                        } else if (l && r) {
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l, r]);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Run off-target on left primer only',
                    click: async (xwc, ywc) => {
                        let l = oligo.left;
                        if (l) {
                            l.offtargetsymbols = null;
                            l.offtarget = null;
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l]);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Run off-target on right primer only',
                    click: async (xwc, ywc) => {
                        let l = oligo.right;
                        if (l) {
                            l.offtargetsymbols = null;
                            l.offtarget = null;
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l]);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Run off-target on probe only',
                    click: async (xwc, ywc) => {
                        let l = oligo.mid;
                        if (l) {
                            l.offtargetsymbols = null;
                            l.offtarget = null;
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l]);
                        } else {
                            infoPrompt(" No probe defined for this amplicon ");
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Analysis',
                    click: async (xwc, ywc) => {
                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

                        if (oligo.type === 'amplicon') {
                            let left = oligo.left;
                            let right = oligo.right;
                            let mid = oligo.mid;
                            let cards = [];

                            if (left && left.offtarget) {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(left.offtarget));
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Left:  " + left.synthesisSequence);
                                cards.push(component);
                            }

                            if (right && right.offtarget) {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(right.offtarget));
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Right:  " + right.synthesisSequence);
                                cards.push(component);
                            }

                            if (mid && mid.offtarget) {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(mid.offtarget));
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Probe:  " + mid.synthesisSequence);
                                cards.push(component);
                            }

                            if (cards && cards.length > 0) {
                                let returnButton = {
                                    title: ' ',
                                    body: ``,
                                    width: '100%',
                                    component: {
                                        wid: 'mt-button',
                                        data: {
                                            buttons: [
                                                {
                                                    label: 'Return to design',
                                                    ionFunction: createIonFunction(async () => {
                                                        let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                        CurrentLayout.clearComponent('mainPanel');
                                                        CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                };

                                cards.push(returnButton);

                                let backtog = {
                                    wid: 'card',
                                    data: {
                                        cards: [cards]
                                    }
                                };

                                CurrentLayout.clearComponent('mainPanel');
                                CurrentLayout.setComponent('mainPanel', backtog);
                            } else {
                                infoPrompt("Run off-targets calculation first.");
                                return;
                            }
                        } else {
                            let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', oligo);
                            let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs);
                            let cards = [component];

                            let backtog = {
                                wid: 'card',
                                data: {
                                    cards: [cards]
                                }
                            };

                            CurrentLayout.clearComponent('mainPanel');
                            CurrentLayout.setComponent('mainPanel', backtog);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Raw report',
                    click: async (xwc, ywc) => {
                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            title: ' ',
                                            body: ``,
                                            width: '100%',
                                            component: {
                                                wid: 'mt-button',
                                                data: {
                                                    buttons: [
                                                        {
                                                            label: 'Return to design',
                                                            ionFunction: createIonFunction(async () => {
                                                                let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                                CurrentLayout.clearComponent('mainPanel');
                                                                CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            title: ' ',
                                            body: ``,
                                            width: '100%',
                                            component: {
                                                wid: 'json',
                                                data: JSON.stringify(oligo.offtarget)
                                            }
                                        }
                                    ]
                                ]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Export / Download sequences',
                    click: async (xwc, ywc) => {
                        let o = oligo;

                        let csvContent = '';
                        let blob = null;

                        if (o.right && o.left && o.mid) {
                            let header = 'ID,left, probe, right\n';
                            csvContent = o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.mid.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';
                            blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });
                        } else {
                            let header = 'ID,left,  right\n';
                            csvContent = o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';
                            blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });
                        }

                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = o.name + 'ppset.csv';
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    },
                    move: () => {
                        log('');
                    }
                }
            ];

            models.push(
                {
                    label: 'Export / Download sequences',
                    click: async (xwc, ywc) => {
                        let o = oligo;

                        let csvContent = '';
                        let blob = null;

                        if (o.right && o.left && o.mid) {
                            let header = 'ID,left, probe, right\n';
                            csvContent =
                                o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.mid.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';

                            blob = new Blob([header, csvContent], {
                                type: 'text/csv;charset=utf-8;'
                            });
                        } else {
                            let header = 'ID,left,  right\n';
                            csvContent =
                                o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';

                            blob = new Blob([header, csvContent], {
                                type: 'text/csv;charset=utf-8;'
                            });
                        }

                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = o.name + 'ppset.csv';
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        console.log("The input string is 'ASO sequences'.");
                    },
                    move: () => {
                        log('');
                    }
                })

            // let butPan = {
            //     wid: 'menu',
            //     width: 300,
            //     data: {
            //         title: '  ',
            //         style: 'sub-container',
            //         menus: me

            //     }
            // }

            // CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            // CurrentLayout.setComponent('buttonMenuPanel', butPan);
            // CurrentLayout.clearComponent('labelPanel')
            // CurrentLayout.setComponent('labelPanel', labelPan);

            graph.showSideMenu(models);

        } else {

            const models = [
                {
                    label: ' Sequence',
                    click: async (xwc, ywc) => {
                        showModal({
                            wid: 'json',
                            data: JSON.stringify({
                                sequence: oligo.sequence,
                                synthesisSequence: oligo.synthesisSequence
                            })
                        });
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Move (Y)',
                    click: async (xwc, ywc) => {
                        console.log('debubg');
                        exec('baja/manchester/menu/move-oligos-vertical.js', graph);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Export IDT...',
                    click: async (xwc, ywc) => {
                        let helm = await exec('baja/chem/helm.js');
                        if (oligo.type === 'siRNA') {
                            let chains = helm.convertHELMtoIDT(oligo.structure);

                            showModal({
                                wid: 'json',
                                data: JSON.stringify(chains)
                            }, 600, 500);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Oligo Editor',
                    click: async (xwc, ywc) => {
                        // Monomer library for the HELM editor. baja/chem/monomers.js
                        // resolves a Monomers instance; dig out the plain array
                        // (handles .monomers and the default .monomers.monomers shape)
                        // since the editor's setMonomers expects an array.
                        let __monlib = await exec('baja/chem/monomers.js');
                        let monomers = Array.isArray(__monlib) ? __monlib
                            : (__monlib && Array.isArray(__monlib.monomers)) ? __monlib.monomers
                                : (__monlib && __monlib.monomers && Array.isArray(__monlib.monomers.monomers)) ? __monlib.monomers.monomers
                                    : [];
                        let fixStructure = (struc) => {
                            if (struc.indexOf('{') > 0) {
                                return struc;
                            }

                            let helmstring = '';
                            let t1 = struc.indexOf('[');
                            let t2 = struc.indexOf('(');

                            if (t1 < 0 && t2 > 0) {
                                let spt = struc.split('.');
                                let nh = 'RNA1{';
                                let previouslinker = '';

                                for (let s of spt) {
                                    let iparen = s.indexOf('(');
                                    let eparen = s.indexOf(')');
                                    let sug = s.substring(0, iparen);
                                    let base = s.substring(iparen + 1, eparen);
                                    let linker = s.substring(eparen + 1);

                                    if (sug.length > 1) sug = '[' + sug + ']';
                                    if (base.length > 1) base = '[' + base + ']';
                                    if (linker.length > 1) linker = '[' + linker + ']';

                                    nh += previouslinker + sug + '(' + base + ')';
                                    previouslinker = linker + '.';
                                }

                                nh += '}$$$$';
                                helmstring = nh;
                            } else if (struc.indexOf('[') === 0) {
                                let spt = struc.split('.');
                                let nh = 'RNA1{';

                                for (let s of spt) {
                                    s = s.trim();
                                    let li = s.indexOf(']');
                                    if (li > 0) {
                                        let si = s.indexOf('[');
                                        if (si === 0) {
                                            let base = s.substring(si + 1, li);
                                            let sug = s.substring(li + 1);
                                            base = base.trim();
                                            sug = sug.trim();

                                            if (sug.length > 1) sug = '[' + sug + ']';
                                            if (base.length > 1) base = '[' + base + ']';

                                            nh += sug + '(' + base + ')';
                                        } else {
                                            let linker = s.substring(0, si);
                                            let base = s.substring(si + 1, li);
                                            let sug = s.substring(li + 1);
                                            linker = linker.trim();
                                            sug = sug.trim();
                                            base = base.trim();

                                            if (sug.length > 1) sug = '[' + sug + ']';
                                            if (base.length > 1) base = '[' + base + ']';
                                            if (linker.length > 1) linker = '[' + linker + ']';

                                            nh += linker + '.' + sug + '(' + base + ')';
                                        }
                                    } else {
                                        s = s.trim();
                                        if (s.length > 0) {
                                            s = '[' + s + ']';
                                        }
                                        nh += s + '.';
                                    }
                                }

                                nh += '}$$$$';
                                helmstring = nh;
                            }

                            return helmstring;
                        };

                        // If the oligo has no stored structure yet, build a HELM
                        // structure in real time from its sequence (using the selected
                        // chemistry's template when available, otherwise a plain
                        // r()/d() backbone), so the editor always opens with something.
                        let __structure = oligo.structure;

                        // Build a correct two-strand siRNA HELM: RNA1 = sense,
                        // RNA2 = antisense, plus base-pair (hydrogen-bond) connections
                        // in the form "RNA1,RNA2,<aaid>:pair-<aaid>:pair". JSDraw numbers
                        // aaids over EVERY backbone atom (sugar, base, linker), so a
                        // nucleotide's base aaid is found by walking the tokens rather
                        // than assuming a fixed stride. Pairs are emitted only where the
                        // two bases are Watson-Crick complementary at the best antiparallel
                        // register, which automatically leaves 3' overhangs unpaired.
                        const buildSiRNAHelm = (o, Biopolymer) => {
                            const basesOf = (struc) => {
                                const out = [];
                                for (const tok of ('' + struc).split('.')) {
                                    const m = tok.match(/\(([^)]+)\)/);
                                    if (m) { let b = m[1].replace(/^\[|\]$/g, '').toUpperCase(); if (b && b !== '?') out.push(b); }
                                }
                                return out;
                            };
                            // Base aaid per nucleotide, mirroring JSDraw's counting.
                            const baseAaids = (struc) => {
                                const ids = []; let aaid = 0;
                                for (let tok of ('' + struc).split('.')) {
                                    tok = tok.trim(); if (!tok) continue;
                                    const ip = tok.indexOf('('), ep = tok.indexOf(')');
                                    if (ip >= 0 && ep > ip) {
                                        aaid++;                 // sugar
                                        aaid++; ids.push(aaid); // base
                                        if (tok.substring(ep + 1).trim()) aaid++;  // trailing linker
                                    } else {
                                        aaid++;                 // standalone linker / atom
                                    }
                                }
                                return ids;
                            };
                            const cleanSeq = (s) => ('' + (s || '')).toUpperCase().replace(/[^ACGTU]/g, '');
                            const seqToStruct = (seq) => {
                                seq = cleanSeq(seq); if (!seq) return '';
                                const sugar = (seq.indexOf('U') >= 0) ? 'r' : 'd';
                                let toks = [];
                                for (let i = 0; i < seq.length; i++) toks.push(sugar + '(' + seq[i] + ')' + (i < seq.length - 1 ? 'p' : ''));
                                return toks.join('.');
                            };
                            // A strand's structure: use the stored template if it already
                            // carries bases, else synthesize a plain backbone from a sequence.
                            const asStruct = (val, fallbackSeq) => {
                                let v = ('' + (val || '')).trim();
                                if (v.indexOf('(') >= 0) return v;
                                return seqToStruct(v || fallbackSeq);
                            };
                            const wc = (x, y) => { const n = (c) => (c === 'U' ? 'T' : c); const p = { A: 'T', T: 'A', G: 'C', C: 'G' }; return p[n(x)] === n(y); };
                            // Reverse a strand's nucleotide order, keeping the inter-
                            // nucleotide linkers between the same neighbours and leaving
                            // the (new) 3' terminal without a trailing linker.
                            const reverseStrand = (struc) => {
                                const nts = [], linkers = [];
                                for (let t of ('' + struc).split('.')) {
                                    t = t.trim(); if (!t) continue;
                                    const ip = t.indexOf('('), ep = t.indexOf(')');
                                    if (ip >= 0 && ep > ip) {
                                        nts.push(t.substring(0, ep + 1));            // "sugar(base)"
                                        linkers.push(t.substring(ep + 1).trim());   // trailing linker or ''
                                    } else if (linkers.length) {
                                        linkers[linkers.length - 1] = t;             // standalone linker token
                                    }
                                }
                                const n = nts.length;
                                if (!n) return struc;
                                const out = [];
                                for (let p = 0; p < n; p++) {
                                    let tok = nts[n - 1 - p];
                                    if (p < n - 1) tok += (linkers[n - 2 - p] || 'p');
                                    out.push(tok);
                                }
                                return out.join('.');
                            };

                            // Append a 3' overhang (e.g. dTdT) to a strand's 3' end as
                            // deoxy nucleotides, unless the strand already ends with it.
                            const appendOverhang = (struct, overhang, linker) => {
                                let oh = ('' + (overhang || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
                                if (!oh) return struct;
                                const cur = basesOf(struct).map((b) => (b === 'U' ? 'T' : b)).join('');
                                if (cur.length >= oh.length && cur.slice(-oh.length) === oh) return struct;  // already present
                                const toks = ('' + struct).split('.').map((t) => t.trim()).filter(Boolean);
                                if (!toks.length) return struct;
                                const link = linker || 'p';
                                const last = toks[toks.length - 1];
                                const ep = last.indexOf(')');
                                if (ep >= 0 && !last.substring(ep + 1).trim()) toks[toks.length - 1] = last + link;  // link core→overhang
                                for (let k = 0; k < oh.length; k++) {
                                    toks.push('d(' + oh[k] + ')' + (k < oh.length - 1 ? link : ''));
                                }
                                return toks.join('.');
                            };

                            let senseStruct = asStruct(o.sense, o.sequence);
                            let antiStruct = asStruct(o.antisense, o.synthesisSequence);
                            // Derive a missing strand as the reverse complement of the other.
                            if (!senseStruct && antiStruct) senseStruct = seqToStruct(Biopolymer.reverseComp(basesOf(antiStruct).join('')));
                            if (!antiStruct && senseStruct) antiStruct = seqToStruct(Biopolymer.reverseComp(basesOf(senseStruct).join('')));
                            if (!senseStruct || !antiStruct) return '';
                            // siRNA is RNA: change every T base to U in the core strands.
                            // Done BEFORE overhangs are appended, so a dTdT overhang
                            // (added below as deoxy d(T)) stays as specified.
                            const toRNA = (s) => ('' + s).replace(/\(([Tt])\)/g, '(U)');
                            senseStruct = toRNA(senseStruct);
                            antiStruct = toRNA(antiStruct);
                            // Include 3' overhangs from the chemistry, if any.
                            senseStruct = appendOverhang(senseStruct, o.senseOverhang);
                            antiStruct = appendOverhang(antiStruct, o.antisenseOverhang);
                            // The editor draws RNA1 (sense) on top; reverse it so the duplex
                            // reads antiparallel against the antisense strand below.
                            senseStruct = reverseStrand(senseStruct);

                            const sB = basesOf(senseStruct), aB = basesOf(antiStruct);
                            const sIds = baseAaids(senseStruct), aIds = baseAaids(antiStruct);
                            const S = sB.length, A = aB.length;
                            // Pick the register with the most Watson-Crick pairs, trying
                            // BOTH orientations — antiparallel (RNA1[i]↔RNA2[A-1-i-off])
                            // and parallel/index-aligned (RNA1[i]↔RNA2[i+off]) — because
                            // stored antisense strands may already be reversed to align
                            // index-to-index with the sense strand. Only complementary
                            // bases are paired, so 3' overhangs stay unpaired either way.
                            let best = { score: -1, pairs: [] };
                            for (let off = -6; off <= 6; off++) {
                                for (const anti of [true, false]) {
                                    let pairs = [];
                                    for (let i = 0; i < S; i++) {
                                        let j = anti ? ((A - 1) - i - off) : (i + off);
                                        if (j < 0 || j >= A) continue;
                                        if (wc(sB[i], aB[j]) && sIds[i] != null && aIds[j] != null) pairs.push([i, j]);
                                    }
                                    if (pairs.length > best.score) best = { score: pairs.length, pairs };
                                }
                            }
                            const conns = best.pairs.map(([i, j]) => `RNA1,RNA2,${sIds[i]}:pair-${aIds[j]}:pair`).join('|');
                            const senseHelm = Biopolymer.normalizeStructure(senseStruct);
                            const antiHelm = Biopolymer.normalizeStructure(antiStruct);
                            return `RNA1{${senseHelm}}|RNA2{${antiHelm}}$${conns}$$$V2.0`;
                        };

                        const __isSiRNA = !!(oligo && (oligo.type === 'siRNA' || (oligo.sense && oligo.antisense)));
                        // A correct siRNA structure must contain BOTH strands + pairs.
                        const __duplexOK = typeof __structure === 'string' && /\|\s*RNA2\s*\{/.test(__structure) && /pair/.test(__structure);
                        if (__isSiRNA && !__duplexOK) {
                            try {
                                const Biopolymer = await exec('baja/chem/biopolymer.js');
                                const built = buildSiRNAHelm(oligo, Biopolymer);
                                if (built) { __structure = built; oligo.structure = built; }   // fix in real time
                            } catch (e) {
                                console.log('Oligo Editor: siRNA duplex build failed', e);
                            }
                        } else if (!__isSiRNA && (typeof __structure !== 'string' || __structure.trim().length === 0)) {
                            try {
                                const Biopolymer = await exec('baja/chem/biopolymer.js');
                                // Synthesized strand: use what's stored, else derive it
                                // from the target sequence given the strand direction.
                                let synth = oligo.synthesisSequence;
                                if (!synth || !synth.length) {
                                    const seq = oligo.sequence || '';
                                    synth = (oligo.strand < 0) ? Biopolymer.comp(seq) : Biopolymer.reverseComp(seq);
                                }
                                synth = ('' + (synth || '')).toUpperCase().replace(/[^ACGTU]/g, '');
                                if (synth) {
                                    let built = '';
                                    // Prefer the selected chemistry's template if present.
                                    const chem = (graph && graph.props) ? graph.props.selected_chemistry : null;
                                    const tmpl = chem && (chem.template || chem.antisense);
                                    if (tmpl) {
                                        try { built = Biopolymer.applySequenceToTemplate(tmpl, synth); } catch (e) { built = ''; }
                                    }
                                    if (!built) {
                                        // Plain backbone: RNA (r) if it contains U, else DNA (d).
                                        const sugar = (synth.indexOf('U') >= 0) ? 'r' : 'd';
                                        let toks = [];
                                        for (let i = 0; i < synth.length; i++) {
                                            toks.push(sugar + '(' + synth[i] + ')' + (i < synth.length - 1 ? 'p' : ''));
                                        }
                                        built = 'RNA1{' + toks.join('.') + '}$$$$V2.0';
                                    }
                                    // Guarantee every monomer symbol is in the library.
                                    try { built = Biopolymer.normalizeStructure(built); } catch (e) { }
                                    if (built) {
                                        __structure = built;
                                        oligo.structure = built;   // persist so verify/edit reuse it
                                    }
                                }
                            } catch (e) {
                                console.log('Oligo Editor: real-time structure build failed', e);
                            }
                        }

                        let strs = '';
                        strs += fixStructure(__structure || '');
                        strs = strs.trim();

                        let medchemEditor = null;
                        let js = {
                            wid: 'medchem',
                            data: {
                                helm: strs,
                                monomers: monomers,
                                listener: createIonFunction((_medchemEditor) => {
                                    medchemEditor = _medchemEditor;
                                })
                            },
                            title: 'medchemeditor'
                        };

                        let meditor = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [[
                                    {
                                        title: '',
                                        width: '100%',
                                        component: js
                                    },
                                    {
                                        title: '',
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Apply',
                                                        ionFunction: createIonFunction(() => {
                                                            if (medchemEditor != null) {
                                                                let helm = medchemEditor.getHELM();
                                                                oligo.structure = helm;
                                                            }

                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel',
                                                        ionFunction: createIonFunction(() => {
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', meditor);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Properties',
                    click: async (xwc, ywc) => {
                        let jpanel = null;
                        let jsonBench = createIonFunction((panel) => {
                            jpanel = panel;
                        });

                        let structure_view = {
                            wid: 'card',
                            data: {
                                height: '800px',
                                cards: [[
                                    {
                                        width: '100%',
                                        height: '800px',
                                        component: {
                                            wid: 'json',
                                            refCallback: jsonBench,
                                            data: JSON.stringify(oligo)
                                        }
                                    },
                                    {
                                        title: '',
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Close',
                                                        ionFunction: createIonFunction(() => {
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    },
                                                    {
                                                        label: 'Apply',
                                                        ionFunction: createIonFunction(async () => {
                                                            let Oligo = await exec('flexigraph/oligo.js');
                                                            let SIRNA = await exec('flexigraph/sirna.js');
                                                            let Amplicon = await exec('flexigraph/amplicon.js');

                                                            let a = jpanel.getData();
                                                            if (a.type === 'siRNA') {
                                                                oligo = Object.assign(new SIRNA(), a);
                                                            } else {
                                                                oligo = Object.assign(new Oligo(), a);
                                                            }

                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', structure_view);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Run...',
                    click: async (xwc, ywc) => {
                        await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [oligo]);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Seed sequence report',
                    click: async (xwc, ywc) => {
                        function summarizeAndSortMatches(mi_targets_transient_) {
                            const countMap = new Map();

                            mi_targets_transient_.forEach(target => {
                                const key = `${target.chr}|${target.genome}|${target.editdistance}`;
                                countMap.set(key, (countMap.get(key) || 0) + 1);
                            });

                            const sortedMatches = Array.from(countMap, ([key, count]) => ({
                                key,
                                count
                            }));

                            sortedMatches.sort((a, b) => b.count - a.count);

                            return sortedMatches.map(entry => ({
                                description: `Combination: ${entry.key}, Occurrences: ${entry.count}`
                            }));
                        }

                        let hits = summarizeAndSortMatches(oligo.mi_targets_transient_);

                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [[
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Return to design',
                                                        ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'json',
                                            data: JSON.stringify(hits)
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Off-target Analysis',
                    click: async (xwc, ywc) => {
                        graph.clearMouseListeners();

                        let tpanel = null;
                        let innerComponentCallback = (panel) => {
                            tpanel = panel;
                        };

                        console.log('debubg');

                        let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(oligo.offtarget));

                        if (rs && rs['tsv']) {
                            let tsvText = rs['tsv'];
                            const lines = tsvText.split('\n');
                            const geneSymbols = [];
                            for (let line of lines) {
                                const columns = line.split('\t');
                                if (columns.length > 1 && columns[1]) {
                                    geneSymbols.push(columns[1]);
                                }
                            }
                            oligo.offtargetsymbols = [geneSymbols.toString()];
                        }

                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [[
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Return to design',
                                                        ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        height: '800px',
                                        component: {
                                            wid: 'html',
                                            data: rs['html']
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        height: '800px',
                                        component: {
                                            wid: 'tsv',
                                            refCallback: innerComponentCallback,
                                            height: '100px',
                                            data: JSON.stringify(rs['tsv'])
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Raw report',
                    click: async (xwc, ywc) => {
                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [[
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Return to design',
                                                        ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'json',
                                            data: JSON.stringify(oligo.offtarget)
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Register / Register',
                    click: async (xwc, ywc) => {
                        if (registered) {
                            infoPrompt(" Compound is already registered ");
                        }

                        if (!registered) {
                            const dbhost = window["env"]["db"];
                            if (dbhost) {
                                let r = await POSTJSON(oligo, `${dbhost}/register`);
                                if (r.status === 404) {
                                    registered = true;
                                } else {
                                    registered = false;
                                }
                            }
                        }
                    },
                    move: () => {
                        log('');
                    }
                }
            ];
            graph.showSideMenu ( models )

            resolve()
        }
        resolve();
    })

}
