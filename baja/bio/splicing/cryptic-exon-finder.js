function (graph, track, region, opts) {

    // THE PHYLON CRYPTIC EXON FINDER, in one place.
    //   await exec('baja/bio/splicing/cryptic-exon-finder.js', graph, track,
    //              { xi: <world>, xf: <world> }, { species: 'mouse' });
    //
    // Candidate exons are cut from canonical motifs in the window (AG|exon|GT on the plus
    // strand, AC|exon|CT on the minus, with no reverse complement) and scored by a model
    // over GERP conservation read from a bigWig. Everything at or above the threshold is
    // kept, and overlapping hits collapse to the best one. What it is saying is that this
    // stretch of intron is as conserved as an exon: a pseudo-exon that evolution appears
    // to be holding onto.
    //
    // It ran from one place, the Exon -> AI Models side menu, where it needs an exon to
    // have been right-clicked. The models catalogue lists every other splicing model and
    // could not list this one, because the catalogue hands over a TRACK. So the work moved
    // here and both callers hand it a window: the menu passes the exon it was opened on,
    // the catalogue passes the selected sequence, and neither has its own copy of what to
    // do with the result.
    //
    // SPECIES PICKS THE SCRIPT, not a submenu. The two scripts differ in which genome's
    // conservation they read (GRCh38 against mm9), so running the human one over a mouse
    // track scores mouse sequence against human conservation and returns confident
    // nonsense. The track knows its species; asking the user to repeat it invites the
    // mismatch.

    return (async () => {
        const t = track;
        const o = opts || {};
        // A REFUSAL HAS TO BE SEEN. Reached from the models library the canvas is behind a
        // full-screen overlay when the decision is made, and a setMessage into that canvas
        // is a button that does nothing. Every way out of this module now raises the panel
        // that sits above everything, and still writes the canvas message for the callers
        // that are looking at it.
        const stop = async (msg) => {
            try { graph.setMessage(' ' + msg + ' '); } catch (e) { }
            try {
                const P = await exec('baja/lib/working.js', 'Cryptic exons', '');
                P.fail(msg);
            } catch (e) { }
            return null;
        };
        if (!t) return await stop('No track selected.');

        const r0 = region || {};
        let xi = Math.round(Math.min(+r0.xi, +r0.xf));
        let xf = Math.round(Math.max(+r0.xi, +r0.xf));
        if (!isFinite(xi) || !isFinite(xf) || xf <= xi) {
            return await stop('Select an exon or a stretch of sequence to scan for cryptic exons.');
        }

        // The bigWig is read window by window and every candidate is scored, so a whole
        // gene is minutes of work for a result nobody asked for. A ceiling, said out loud,
        // beats a scan that looks like a hang.
        const MAX_SPAN = (o.max_span != null) ? +o.max_span : 120000;
        if (xf - xi > MAX_SPAN) {
            return await stop('That stretch is ' + Math.round((xf - xi) / 1000) + ' kb. Select up to '
                + Math.round(MAX_SPAN / 1000) + ' kb to scan for cryptic exons: this reads a '
                + 'conservation track base by base, so a whole gene is minutes of work.');
        }
        if (!t.getSequenceRange) {
            return await stop('That track has no sequence loaded to scan.');
        }

        // THE THRESHOLD IS THE WHOLE ANSWER when nothing comes back. The script defaults to
        // 0.98, a strict posterior: a scan that reports nothing at 0.98 has not said the
        // intron is empty, it has said nothing cleared 0.98. Those read the same on screen
        // and are not the same finding, so the number travels with the result and can be
        // chosen before the run.
        const TH = (o.threshold != null && isFinite(+o.threshold)) ? +o.threshold : 0.98;
        const MIN_EXON = (o.min_exon != null) ? +o.min_exon : 50;
        const MAX_EXON = (o.max_exon != null) ? +o.max_exon : 1000;

        const sp = ('' + (o.species || t.species || '')).toLowerCase();
        const mouse = /mouse|mus|mm9|mm10|mm39/.test(sp);
        const script = mouse ? 'py/splicing/cryptic-exon-finder-mm9.py'
            : 'py/splicing/cryptic-exon-finder.py';

        let W = null;
        try {
            W = await exec('baja/lib/working.js',
                'Cryptic exons in ' + (t.name || 'the track'),
                (mouse ? 'mm9' : 'GRCh38') + ' conservation over ' + (xf - xi) + ' nt.');
        } catch (e) { W = null; }

        try {
            const r = await exec(script, t.getSequenceRange(xi, xf), t.chr, xi, xf, t.strand,
                MIN_EXON, MAX_EXON, 100000, TH);
            // THE ONLY SHAPE THAT MEANS A SCAN HAPPENED is one carrying a results array.
            // Everything else the script can resolve -- a missing pyBigWig, a bigWig still
            // downloading, an error, a payload shape nobody anticipated -- went into
            // generateCrypticExons, which found no `results` in it, returned [], and was
            // reported as "nothing reached 0.98". A tool that answers a broken install
            // with a confident negative result is worse than one that crashes.
            //
            // So the result array is the gate, and anything else is described by what it
            // actually came back with.
            if (r && r.status === 'missing_dependency') {
                try { if (W) W.done(); } catch (e) { }
                await stop('The cryptic exon model needs ' + (r.dependency || 'a package')
                    + ' on the server, which is not installed: '
                    + ('' + (r.message || '')).split('\n')[0]);
                return { missing: r.dependency || 'dependency' };
            }
            // ONE LITERAL WHERE THERE IS A FAMILY. This knew the single string
            // 'file_downloading', but the staging layer resolves 'still_downloading' from
            // three places and 'download_trigger_failed' from a fourth, so the case this
            // was written for fell through to the generic branch: the file has been
            // downloading the whole time, and the first run reported a scan of nothing
            // instead of saying so.
            //
            // The GERP bigWig is a large file. This is not "several minutes" the way a
            // model warm-up is, and saying so stops the same run being tried every minute.
            const st = '' + ((r && r.status) || '');
            if (/download/i.test(st)) {
                try { if (W) W.done(); } catch (e) { }
                const started = (r && r.file && r.file.started) ? (+r.file.started) : 0;
                const mins = started ? Math.max(1, Math.round((Date.now() / 1000 - started) / 60)) : 0;
                await stop(/fail/i.test(st)
                    ? ('The server could not start the download of the '
                        + (mouse ? 'mm9' : 'GRCh38') + ' conservation file this needs. '
                        + 'Nothing was scanned.')
                    : ('The ' + (mouse ? 'mm9' : 'GRCh38') + ' conservation file this reads is '
                        + 'still downloading on the server'
                        + (mins ? (', ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' in') : '')
                        + '. It is a large file and downloads once; nothing was scanned, so try '
                        + 'again later rather than reading this as an empty result.'));
                return { downloading: true, status: st, minutes: mins || null };
            }
            if (r && r.status === 'missing_server_base_url') {
                try { if (W) W.done(); } catch (e) { }
                await stop('The server does not know where to fetch the conservation file from '
                    + '(SERVER_BASE_URL is not set), so nothing was scanned.');
                return { error: 'missing_server_base_url' };
            }
            // An error from the script is an answer too, and it used to be dropped on the
            // floor: generateCrypticExons would find no hits in it and the run would report
            // nothing found, which is a different thing entirely.
            if (r && r.error) {
                try { if (W) W.done(); } catch (e) { }
                await stop('Cryptic exon finder: ' + r.error);
                return { error: '' + r.error };
            }
            if (!r || !Array.isArray(r.results)) {
                try { if (W) W.done(); } catch (e) { }
                const what = r ? ('it came back with ' + (r.status
                    ? ('status "' + r.status + '"')
                    : ('{' + Object.keys(r).slice(0, 6).join(', ') + '}'))) : 'it came back empty';
                await stop('The cryptic exon scan did not return a result list: ' + what
                    + '. That is not the same as finding nothing.');
                return { error: 'no results array' };
            }

            const CE = await exec('baja/bio/splicing/cryptic-exons');
            const found = CE.generateCrypticExons(r, { xiAnchor: xi }) || [];
            for (const cry of found) t.add(cry);
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { if (W) W.done(); } catch (e) { }
            // NONE IS A RESULT. The old path added nothing and said nothing, which reads
            // exactly like the model never ran.
            // HOW MANY WERE LOOKED AT, not just how many survived. The script counts the
            // exon-like candidates it cut from the motifs, and that number separates the
            // reasons for an empty result that otherwise look identical: nothing in the
            // window carries usable splice motifs at all, or thousands did and none was
            // conserved enough to clear the bar.
            const meta = (r && r.meta) || {};
            const nCand = +meta.n_candidates_generated;
            try {
                graph.setResultMessage(' Cryptic exons · ' + (t.name || 'track') + ' · '
                    + (found.length
                        ? (found.length + ' candidate' + (found.length === 1 ? '' : 's')
                            + ' added over ' + (xf - xi) + ' nt at ' + TH)
                        : ('nothing reached ' + TH + ' in those ' + (xf - xi) + ' nt'
                            + (isFinite(nCand)
                                ? (', of ' + nCand.toLocaleString() + ' exon-like candidate'
                                    + (nCand === 1 ? '' : 's') + ' scored')
                                : '')))
                    + ' · ' + (mouse ? 'mm9' : 'GRCh38') + ' conservation ');
            } catch (e) { }
            return { added: found.length, xi: xi, xf: xf, threshold: TH,
                candidates: isFinite(nCand) ? nCand : null,
                species: mouse ? 'mouse' : 'human' };
        } catch (e) {
            try { if (W) W.fail('Cryptic exon finder: ' + ((e && e.message) ? e.message : e)); } catch (e2) { }
            throw e;
        }
    })();
}
