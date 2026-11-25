function (track, opts) {

    // THE SITE MODEL'S SCORES FOR A TRACK, FETCHED ONCE AND THE SAME WAY EVERY TIME.
    //   const P = await exec('baja/bio/splicing/sites-profile.js', track, {});
    //   // { ok: true, acceptor: [[x, score], ...], donor: [[x, score], ...] }
    //   // { ok: false, reason: '<a sentence the caller can show>' }
    //
    // Three callers wanted this and each wrote the call itself, which is three chances to
    // get the argument list wrong. One of them did: the first parameter is an EngineMonitor
    // and the engine consumes it when it finds one, so passing null there shifts every
    // argument by one and the sequence arrives where xi is expected. The backend then
    // reports "no sequence provided" about a track whose sequence is plainly loaded, which
    // is a bug that reads as a data problem.
    //
    // The two refusals that must not read as empty results live here too: a track with no
    // sequence, and a SPLICED sequence in a genomic frame. The model scores intronic bases
    // with a kilobase of context either side, and a cDNA has had exactly that removed at
    // every boundary, so it returns almost nothing and the run looks like a gene with no
    // sites rather than the wrong sequence.

    return (async () => {
        const t = track || {};
        const o = opts || {};
        const who = t.name || 'This track';
        const comma = (n) => (+n || 0).toLocaleString();
        const fail = (reason) => ({ ok: false, reason: reason, acceptor: [], donor: [] });

        if (o.profile && (o.profile.acceptor || o.profile.donor)) {
            return { ok: true, acceptor: o.profile.acceptor || [], donor: o.profile.donor || [] };
        }

        const seq = '' + (t.sequence || '');
        if (!seq) {
            return fail(who + ' has no sequence loaded, so the site model has nothing to '
                + 'score. Load the transcript as pre-mRNA and run again.');
        }
        if (isFinite(+t.xi) && isFinite(+t.xf)) {
            const span = Math.abs(Math.floor(+t.xf) - Math.floor(+t.xi)) + 1;
            if (seq.length < span * 0.99) {
                return fail(who + ' holds a spliced sequence (' + comma(seq.length) + ' nt) in a '
                    + comma(span) + ' nt genomic frame, so it has no intronic sequence to '
                    + 'score. Load the transcript as pre-mRNA (a primary-assembly Ensembl id) '
                    + 'and run again.');
            }
        }

        const xi = (t.xi != null) ? t.xi : 0;
        let orientation = 'plus';
        try { orientation = await exec('baja/bio/splicing/strand-orientation.js', t, seq); }
        catch (e) { orientation = 'plus'; }

        let em = null;
        try { em = new EngineMonitor(() => { }); } catch (e) { em = null; }

        let data = null;
        try {
            data = await exec(window['env']['apiUrl'] + '/py/bio/splice/splicing-profile.py',
                em, '' + seq, '' + xi, '' + (t.strand != null ? t.strand : 1), 'sites',
                '', orientation, '', '', '');
        } catch (e) {
            return fail('The site model could not be reached: ' + ((e && e.message) ? e.message : e));
        }
        if (!data) return fail('The site model returned nothing for ' + who + '.');
        if (data.error) return fail('The site model refused ' + who + ': ' + data.error);

        let acc = [], don = [];
        try { acc = JSON.parse(data.acceptor || '[]'); }
        catch (e) { return fail('The site model returned acceptor scores this tool could not read.'); }
        try { don = JSON.parse(data.donor || '[]'); }
        catch (e) { don = []; }
        if (!acc.length && !don.length) {
            return fail('The site model ran on ' + who + ' but returned no splice site '
                + 'positions at all, which usually means the sequence it was given was not '
                + 'the genomic one.');
        }
        return { ok: true, acceptor: acc, donor: don };
    })();
}
