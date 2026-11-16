function (track, added, options) {

    // A BATCH OF NEWLY ADDED VARIANTS, TOLD APART FROM THE ONES ALREADY THERE.
    //   const b = await exec('baja/data/variant-batch.js', track, addedSnpIndels,
    //                        { label: 'ClinVar pathogenic' });
    //   b.hide(); b.show(); b.remove();
    //
    // Loading more variants onto a track that already carries some produces one
    // undifferentiated field of markers: nothing on screen says which of the 130 arrived
    // just now and which were there before, and the only way back is to reload the track.
    // This tags each new set as a batch, gives it the two visual axes below, and leaves a
    // handle so the batch can be hidden or dropped on its own.
    //
    // NOT A TrackLayer. track_layers holds intervals and is drawn, hit-tested and
    // menued as intervals; a variant is none of those things. Everything here stays in
    // track.snpindels, where every existing menu, hover, design step and exporter already
    // finds it, and hiding a batch splices it out of that array rather than asking the
    // renderer to learn a new flag. The cost is that hide() changes the array; the gain is
    // that no other file has to know this feature exists.
    //
    // TWO AXES, AND THEY MEAN DIFFERENT THINGS.
    //
    //   SHAPE is the KIND of change: a substitution, an insertion, a deletion. It is a fact
    //   about the record, it never changes, and until now it was invisible -- both a SNP and
    //   an indel drew the same round head, with only the indel's cylinder below to tell them
    //   apart, which is not readable at the zoom a whole gene is viewed at.
    //
    //   COLOUR is the predicted LOSS OF FUNCTION, read off the record's own consequence
    //   field and nothing else. No model is run and no translation is redone here: if the
    //   file does not say, this says it does not know rather than guessing, because a
    //   guessed LOF call drawn in the same colour as a real one is worse than a grey dot.
    //
    // THE COLOURS ARE DELIBERATELY NOT THE CLINICAL ONES. clinsigStyle() paints a ClinVar
    // pathogenic call red and a benign call blue, and those are classifications somebody
    // made. What this paints is an inference from a consequence term. Drawing it in the
    // same red would quietly promote "frameshift" to "known pathogenic", so the LOF tiers
    // run through orange, which the rest of this codebase already uses for severity read
    // off the transcript rather than claimed by a database.

    const o = options || {};
    const list = (Array.isArray(added) ? added : (added ? [added] : [])).filter(Boolean);

    return (async () => {
        const SnpIndel = await exec('flexigraph/snpindel.js');

        // SHAPE PER KIND. The keys are the type strings every loader in this tree
        // constructs a SnpIndel with; anything else keeps the default round head rather
        // than being forced into a shape that would imply a kind it has not got.
        const SHAPE = { snp: 'circle', ins: 'triangle', del: 'triangle-down', AA: 'diamond' };

        // THE LOF LADDER. The top rung is the truncating set the SnpIndel class already
        // keeps -- nonsense, frameshift, both splice-site breaks, a lost start -- so the two
        // cannot drift apart. The middle rung is named here because "changes the protein but
        // does not truncate it" is not a distinction that table draws.
        const MODERATE = {
            missense_variant: 1, inframe_deletion: 1, inframe_insertion: 1,
            inframe_indel: 1, stop_lost: 1
        };
        const TIER = {
            lof: { color: '#c2410c', rank: 3, text: 'predicted loss of function' },
            moderate: { color: '#d97706', rank: 2, text: 'changes the protein' },
            low: { color: '#64748b', rank: 1, text: 'no protein change predicted' },
            unknown: { color: '#9aa0a6', rank: 0, text: 'the record does not say' }
        };

        const tierOf = (v) => {
            let c = null;
            try { c = v._consequence ? v._consequence() : null; } catch (e) { c = null; }
            if (!c || !c.term) return 'unknown';
            if (c.truncating) return 'lof';
            return MODERATE[c.term] ? 'moderate' : 'low';
        };

        const batches = (track.variantBatches = track.variantBatches || []);
        const id = 'vb' + (Date.now().toString(36)) + '-' + (batches.length + 1);
        const counts = { lof: 0, moderate: 0, low: 0, unknown: 0 };

        for (const v of list) {
            if (!v) continue;
            try {
                const t = tierOf(v);
                counts[t]++;
                v.batchId = id;
                v.batchLabel = '' + (o.label || 'Added variants');
                v.lofTier = t;
                // markerShape is the per-variant override the drawing code already reads;
                // null leaves the default circle, which is what a kind we do not know gets.
                v.markerShape = SHAPE[v.type] || null;
                // sampleColor is the existing hook for "a colour chosen by a view", and it
                // sits BELOW a colour the user set by hand and ABOVE the clinical one, which
                // is the precedence this wants: the batch's own reading of the record, not
                // overriding a human.
                v.sampleColor = TIER[t].color;
            } catch (e) { }
        }

        const inTrack = () => (track.snpindels = track.snpindels || []);
        const batch = {
            id: id,
            label: '' + (o.label || 'Added variants'),
            n: list.length,
            counts: counts,
            variants: list,
            hidden: false,
            tierColors: { lof: TIER.lof.color, moderate: TIER.moderate.color, low: TIER.low.color, unknown: TIER.unknown.color },
            // Out of the drawn array, not out of existence: the batch keeps its own list, so
            // show() puts back the same objects with their colours and shapes intact.
            hide() {
                if (this.hidden) return this;
                const mine = new Set(this.variants);
                track.snpindels = inTrack().filter((s) => !mine.has(s));
                this.hidden = true;
                return this;
            },
            show() {
                if (!this.hidden) return this;
                const have = new Set(inTrack());
                for (const v of this.variants) if (!have.has(v)) track.snpindels.push(v);
                this.hidden = false;
                return this;
            },
            // Gone for good: off the track and off the batch list.
            remove() {
                this.hide();
                track.variantBatches = (track.variantBatches || []).filter((b) => b !== this);
                this.variants = [];
                this.n = 0;
                return this;
            },
            // One line a menu or a message can print without doing this arithmetic again.
            summary() {
                const bits = [];
                if (counts.lof) bits.push(counts.lof + ' LOF');
                if (counts.moderate) bits.push(counts.moderate + ' protein-changing');
                if (counts.low) bits.push(counts.low + ' silent');
                if (counts.unknown) bits.push(counts.unknown + ' unclassified');
                return this.label + ': ' + this.n + ' variant' + (this.n === 1 ? '' : 's')
                    + (bits.length ? ' (' + bits.join(', ') + ')' : '');
            }
        };
        batches.push(batch);
        return batch;
    })();
}
