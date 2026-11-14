function (graph, genegraph_panel_layout, presetTrack) {
    // Transposable elements and repeats on a track, as annotations.
    //   exec('baja/data/repeat-track.js', graph, genegraph_panel_layout [, track])
    //
    // The uniqueness gradient already tells you a window is repetitive: an Alu-derived
    // 20-mer has on the order of a million genomic copies, so it stands out by off-target
    // count while its complexity stays perfectly normal. What a count cannot tell you is
    // WHICH element it is and WHICH WAY ROUND it sits, and for splicing the orientation is
    // the entire question. An antisense SINE presents its poly(A) tail as a poly-T tract on
    // the transcribed strand, which reads as a polypyrimidine tract, and a cryptic 3' splice
    // site is selected downstream of it. The same element in sense orientation does not do
    // that. So elements are drawn by class and labelled sense or antisense TO THE GENE, and
    // the antisense exonizing ones are called out on their own.
    //
    // Read this against the gradient's `ppt` track, which scores the upstream pyrimidine
    // tract: an antisense SINE with a strong PPT just inside it is the shape of a cryptic
    // exon waiting to happen, which is what matters when an ASO shifts splicing nearby.
    return new Promise(async (resolve, reject) => {
        if (Array.isArray(presetTrack)) presetTrack = presetTrack.filter(Boolean)[0] || null;
        const PY = window['env']['apiUrl'] + '/py/bio/repeats/ensembl-repeats.py';

        // Class -> colour. One hue family for the retrotransposons that exonize, a plainer
        // one for everything else, because the point of the track is the first group.
        const COLOUR = {
            'SINE/Alu': '#e0703b',
            'SINE/MIR': '#eb9a34',
            'Retroposon/SVA': '#d94f8a',
            'LINE/L1': '#2a78d6',
            'LINE/L2': '#5598e7',
            'LINE/CR1': '#86b6ef',
            'LTR': '#7a5cc4',
            'DNA': '#3f9a8f',
            'Satellite': '#8a8a84',
            'RNA': '#8a8a84',
            'Simple': '#b9b9b2',
            'Low complexity': '#cfcfc8',
            'other': '#9a9a94'
        };
        const NON_TE = ['Simple', 'Low complexity', 'Satellite', 'RNA'];
        const esc = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        async function load(track) {
            const chr = track.chr || track.chromosome || '';
            const xi = Math.min(+track.xi, +track.xf);
            const xf = Math.max(+track.xi, +track.xf);
            if (!chr || !isFinite(xi) || !isFinite(xf)) {
                graph.setMessage(' ' + track.name + ' has no chromosome and range to look up.');
                return null;
            }
            const strand = (+track.strand >= 0) ? 1 : -1;

            const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            graph.setMessage(' Looking up repeats across ' + chr + ':' + Math.round(xi)
                + '-' + Math.round(xf) + '... ');

            let res;
            try {
                res = await exec(PY, em, chr, Math.round(xi), Math.round(xf), strand, 'human');
            } catch (e) {
                graph.setError(' Could not fetch repeats for ' + track.name + ': '
                    + ((e && (e.message || e)) || 'the request failed'));
                return null;
            }
            let reps;
            try { reps = JSON.parse(res.repeats); } catch (e) { reps = []; }
            if (!reps.length) {
                graph.setMessage(' No repeats returned for ' + track.name
                    + ((res.warnings || []).length ? (': ' + res.warnings[0]) : '.'));
                return res;
            }

            // Maskers (dust, trf) are not elements; they would swamp the track by number
            // and say nothing about splicing, so they stay out of the annotations and are
            // still counted in the summary.
            let drawn = 0;
            for (const r of reps) {
                if (NON_TE.indexOf(r.cls) >= 0) continue;
                const a = new Annotation('repeat', r.name + ' (' + r.cls + ', ' + r.relative + ')',
                    r.start, r.end);
                a.color = COLOUR[r.cls] || COLOUR.other;
                // The ones that exonize, facing the wrong way: drawn solid, everything else
                // is background.
                a.repeatClass = r.cls;
                a.repeatRelative = r.relative;
                a.exonizing = !!(r.exonizing && r.relative === 'antisense');
                try { track.add(a); drawn++; } catch (e) { }
            }

            const rows = Object.keys(res.byClass || {}).sort(
                (a, b) => res.byClass[b] - res.byClass[a]).map((c) =>
                    '<tr><td style="padding:3px 8px;"><span style="display:inline-block;width:10px;'
                    + 'height:10px;border-radius:2px;background:' + (COLOUR[c] || COLOUR.other)
                    + ';margin-right:7px;"></span>' + esc(c) + '</td>'
                    + '<td style="padding:3px 8px;text-align:right;">' + res.byClass[c] + '</td></tr>').join('');

            const warn = (res.warnings || []).map((w) =>
                '<div style="margin-bottom:6px;padding:7px 9px;border-radius:6px;'
                + 'background:rgba(224,112,59,0.12);border:1px solid rgba(224,112,59,0.5);'
                + 'font:12.5px Arial;">' + esc(w) + '</div>').join('');

            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
            CurrentLayout.setComponent('buttonMenuPanel', {
                wid: 'html', data: ''
                    + '<div style="padding:10px 12px;">'
                    + '<div style="font-weight:700;margin-bottom:4px;">Repeats &middot; ' + esc(res.region) + '</div>'
                    + '<div style="font-size:0.8rem;color:#5b8a86;margin-bottom:8px;">'
                    + res.count + ' features, ' + res.transposonCount + ' transposable elements, '
                    + drawn + ' drawn. Gene strand ' + (res.geneStrand > 0 ? '+' : '-') + '.'
                    + '</div>'
                    + warn
                    + '<div style="font-size:0.95rem;margin:8px 0;padding:8px 10px;border-radius:6px;'
                    + 'background:rgba(224,112,59,0.14);border:1px solid rgba(224,112,59,0.5);">'
                    + '<b>' + res.antisenseExonizing + '</b> antisense SINE/SVA element'
                    + (res.antisenseExonizing === 1 ? '' : 's') + ' here. These are the exonization '
                    + 'candidates: antisense is the orientation that supplies a polypyrimidine tract '
                    + 'for a cryptic 3\' splice site.</div>'
                    + '<table style="border-collapse:collapse;font-size:0.85rem;margin-top:6px;">'
                    + '<thead><tr style="text-align:left;border-bottom:1px solid #bfe4df;">'
                    + '<th style="padding:4px 8px;">Class</th><th style="padding:4px 8px;text-align:right;">n</th>'
                    + '</tr></thead><tbody>' + rows + '</tbody></table>'
                    + '<div style="font-size:0.75rem;color:#5b8a86;margin-top:10px;">Classes are derived '
                    + 'from the element name, not from RepeatMasker\'s own class column, so an '
                    + 'unrecognised name reads as "other" rather than being guessed at.</div>'
                    + '</div>'
            });

            graph.setMessage(' ' + drawn + ' elements drawn on ' + track.name + ', '
                + res.antisenseExonizing + ' antisense and exonization-capable.');
            resolve({ result: res, repeats: reps, drawn: drawn });
            return res;
        }

        if (presetTrack) {
            try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
            if ((await load(presetTrack)) == null) resolve(null);
            return;
        }

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('select-track');
        graph.selectOff();
        graph.setMessage(' Select a track to load repeats onto... ');

        let selectedTrack = null;
        const menuList = [{
            label: 'Transposons / repeats',
            click: async () => { if ((await load(selectedTrack)) == null) resolve(null); },
            move: () => { try { log(''); } catch (e) { } }
        }];
        graph.addMouseMoveListener((x, y) => {
            const i = graph.getTrack(x, y);
            if (i >= 0) { graph.deselectAllTracks(); if (graph.track[i]) graph.track[i].showResizeBar = true; }
        });
        graph.addMouseDownListener(async (x, y) => {
            const i = graph.getTrack(x, y);
            if (i >= 0) selectedTrack = graph.track[i];
            if (selectedTrack) graph.showMenu(menuList, x, y);
        });
    });
}
