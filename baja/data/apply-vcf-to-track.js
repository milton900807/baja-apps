function (track, vcfPath, chr, start, end, strand) {

    // Apply a (phased) VCF's variant calls, within [start, end) on `chr`, onto `track` as
    // SnpIndel annotations. The SnpIndel-building logic here is lifted verbatim from
    // baja/data/my-data.js's 'Phased Seq (VCF)' track-first flow (click a track, then pick
    // a file) -- pulled out so manchester/fb.js's file-first flow (click a .vcf.gz directly
    // in the general file browser, no canvas there to click a track on) gets the exact same
    // conversion, not a second copy of it that could drift.
    //   const count = await exec('baja/data/apply-vcf-to-track.js', track, path, chr, start, end, strand);
    // Resolves the number of variants added (0 on any failure -- logged, not thrown, so a
    // caller looping over several tracks/files isn't stopped by one bad one).

    return new Promise(async (resolve) => {
        try {
            const em = new EngineMonitor((msg) => { log(msg); });
            const r = await exec('py/bio/lj-phased-vcf.py', em, vcfPath, chr, start, end, strand);
            const SnpIndel = await exec('flexigraph/snpindel.js');

            const safeString = (v, fallback = "") => {
                if (v === null || v === undefined) return fallback;
                const s = String(v);
                return s.length ? s : fallback;
            };

            const safeOneWordQuality = (v) => {
                const q = safeString(v, "unknown").trim().toLowerCase();
                if (q === "high" || q === "medium" || q === "low" || q === "unknown") return q;
                return "unknown";
            };

            const safeOptionalInt = (v) => {
                if (v === null || v === undefined) return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            };

            const safeOptionalBool = (v) => {
                if (v === null || v === undefined) return null;
                if (typeof v === "boolean") return v;
                if (v === 1 || v === "1" || v === "true") return true;
                if (v === 0 || v === "0" || v === "false") return false;
                return null;
            };

            const extractPhaseAndPhasing = (sid) => {
                const phasingObj =
                    sid && typeof sid.phasing === "object" && sid.phasing
                        ? sid.phasing
                        : sid && typeof sid.phase === "object" && sid.phase
                            ? sid.phase
                            : null;

                const phasedFlag = phasingObj
                    ? Boolean(safeOptionalBool(phasingObj.phased))
                    : false;

                let phaseNum = 0;
                if (Number.isFinite(Number(sid?.phase))) {
                    phaseNum = Number(sid.phase);
                } else if (phasingObj && Number.isFinite(Number(phasingObj.phase01))) {
                    phaseNum = Number(phasingObj.phase01);
                } else if (phasingObj && typeof phasingObj.phase_label === "string") {
                    phaseNum = phasingObj.phase_label === "H1" ? 1 : 0;
                } else {
                    phaseNum = 0;
                }

                if (!phasedFlag) {
                    return { phaseNum: 0, phaseset: null, phasing: null, phased: false };
                }

                const phaseset =
                    sid?.phaseset ??
                    sid?.phaseSet ??
                    sid?.PS ??
                    phasingObj?.phaseset ??
                    phasingObj?.ps ??
                    null;

                return { phaseNum, phaseset, phasing: phasingObj, phased: true };
            };

            let count = 0;

            if (r != null && Array.isArray(r.results)) {
                for (let sid of r.results) {
                    if (!sid) continue;

                    const xi = Number(sid.xi ?? sid.POS ?? sid.pos ?? sid.position);
                    if (!Number.isFinite(xi)) continue;

                    const type = safeString(sid.type, "snp");
                    const reference = safeString(sid.reference, "");
                    const alternate = safeString(sid.alternate, "");

                    const snpStrand = safeString(sid.strand, strand ?? "1");

                    const id = safeString(sid.id, null);

                    const { phaseNum, phaseset, phasing, phased } = extractPhaseAndPhasing(sid);

                    let snp = new SnpIndel(
                        type,
                        xi,
                        reference,
                        alternate,
                        phaseNum,
                        snpStrand,
                        id,
                        phaseset,
                    );

                    snp.name = safeString(sid.name, snp.name);

                    const annStr = safeString(sid.annotations, "");
                    const ant = annStr ? annStr.split(";").filter(Boolean) : [];
                    snp.setAnnotation(ant);

                    snp.quality = safeOneWordQuality(sid.quality);

                    snp.phasing = phased ? phasing : null;
                    snp.isPhased = phased;

                    const gtFromAnywhere =
                        safeString(sid?.phasing?.gt, "") ||
                        safeString(typeof sid?.phase === "object" ? sid?.phase?.gt : "", "") ||
                        safeString(sid?.gt, "");
                    if (gtFromAnywhere) snp.gt = gtFromAnywhere;

                    snp.haplotype = safeOptionalInt(
                        sid.haplotype ?? (snp.phasing ? snp.phasing.haplotype : null) ?? null,
                    );

                    if (
                        (snp.phaseset === null || snp.phaseset === undefined) &&
                        snp.phasing &&
                        snp.phasing.phaseset != null
                    ) {
                        snp.phaseset = snp.phasing.phaseset;
                    }

                    snp.phaseLabel = snp.phasing ? safeString(snp.phasing.phase_label, "") : "";
                    snp.phaseNorm = phased ? phaseNum : null;

                    track.addsnpindel(snp);
                    count++;
                }
            }

            resolve(count);
        } catch (e) {
            console.error('apply-vcf-to-track failed:', e);
            resolve(0);
        }
    });
}
