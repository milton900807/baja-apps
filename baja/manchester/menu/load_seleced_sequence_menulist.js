function (graph, genegraph_panel_layout, run) {

    async function tailJobLog(
        logUrl,
        {
            pollMs = 3000,
            maxIdleMs = 10 * 60 * 1000,
            jobTag = "",
            onLine = (line) => console.log(`${jobTag}${line}`),
            onStatus = ({ status, percent, elapsedText }) =>
                console.log(`${jobTag}[status=${status} ${percent ?? "?"}% elapsed=${elapsedText ?? "?"}]`),
        } = {}
    ) {
        let lastConsumedLen = 0;
        let lastStatusKey = "";
        let lastActivity = Date.now();

        const statusRe = /^(SUBMIT|PENDING|RUNNING|COMPLETE):\s+(\d+)%\|.*?\|\s+(\d+)\/(\d+)\s+\[elapsed:\s+([0-9:]+)\s+remaining:\s+([^\]]+)\]/m;

        const looseStatusRe = /^(SUBMIT|PENDING|RUNNING|COMPLETE):\s+(\d+)%.*?\[elapsed:\s+([0-9:?\-]+).*?\]/m;

        const parseHMS = (txt) => {

            const parts = (txt || "").split(":").map((x) => parseInt(x, 10));
            if (parts.some((n) => Number.isNaN(n))) return null;
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            return null;
        };

        const parseStatusFromChunk = (chunk) => {
            let m = statusRe.exec(chunk) || looseStatusRe.exec(chunk);
            if (!m) return null;

            const status = m[1];
            const percent = m[2] ? Number(m[2]) : undefined;
            const step = m[3] ? Number(m[3]) : undefined;
            const total = m[4] ? Number(m[4]) : undefined;
            const elapsedText = m[5] || undefined;
            const elapsedSeconds = elapsedText ? parseHMS(elapsedText) ?? undefined : undefined;

            return { status, percent, step, total, elapsedText, elapsedSeconds };
        };

        const emitNewLines = (fullLog, fromIdx) => {

            const newText = fullLog.slice(fromIdx);

            const lines = newText.replace(/\r\n/g, "\n").split("\n");
            for (const line of lines) {
                if (line.trim().length) onLine(line);
            }
        };

        let done = false;
        while (!done) {
            let json, fullLog;
            try {
                const resp = await fetch(logUrl, { headers: { "Accept": "application/json" } });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                json = await resp.json();
                fullLog = String(json.log ?? "");
            } catch (err) {
                console.warn(`${jobTag}log fetch error: ${err.message}`);

                await new Promise((r) => setTimeout(r, pollMs));
                continue;
            }

            if (fullLog.length > lastConsumedLen) {
                emitNewLines(fullLog, lastConsumedLen);
                lastConsumedLen = fullLog.length;
                lastActivity = Date.now();

                const newChunk = fullLog.slice(Math.max(0, fullLog.length - 2000));
                const parsed = parseStatusFromChunk(newChunk) || parseStatusFromChunk(fullLog);
                if (parsed) {
                    const key = `${parsed.status}|${parsed.percent}|${parsed.step}`;
                    if (key !== lastStatusKey) {
                        lastStatusKey = key;
                        onStatus(parsed);
                    }
                }
            } else if (Date.now() - lastActivity >= maxIdleMs) {
                console.warn(`${jobTag}No new log within ${maxIdleMs}ms — stopping tail.`);
                break;
            }

            if (!done) await new Promise((r) => setTimeout(r, pollMs));
        }
    }

    const AA2CODE = {
        A: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, I: 7, K: 8, L: 9,
        M: 10, N: 11, P: 12, Q: 13, R: 14, S: 15, T: 16, V: 17, W: 18, Y: 19,
        X: 20, B: 21, Z: 22, J: 23, U: 24, O: 25
    };
    const CODE2AA = Object.fromEntries(Object.entries(AA2CODE).map(([k, v]) => [v, k]));

    function crc8(bytes, poly = 0x07, init = 0x00) {
        let c = init >>> 0;
        for (let b of bytes) {
            c ^= b;
            for (let i = 0; i < 8; i++) {
                c = (c & 0x80) ? ((c << 1) ^ poly) & 0xFF : (c << 1) & 0xFF;
            }
        }
        return c;
    }

    class BitPacker {
        constructor() { this.buf = []; this.bitbuf = 0; this.bits = 0; }
        put(value, nbits) {
            this.bitbuf = (this.bitbuf << nbits) | (value & ((1 << nbits) - 1));
            this.bits += nbits;
            while (this.bits >= 8) {
                const shift = this.bits - 8;
                this.buf.push((this.bitbuf >> shift) & 0xFF);
                this.bits -= 8;
                this.bitbuf &= (1 << this.bits) - 1;
            }
        }
        finish() {
            if (this.bits) this.buf.push((this.bitbuf << (8 - this.bits)) & 0xFF);
            return u8(this.buf);
        }
    }
    class BitUnpacker {
        constructor(data) { this.data = data; this.i = 0; this.bitbuf = 0; this.bits = 0; }
        get(nbits) {
            while (this.bits < nbits) {
                if (this.i >= this.data.length) throw new Error("Unexpected end of data");
                this.bitbuf = (this.bitbuf << 8) | this.data[this.i++];
                this.bits += 8;
            }
            const shift = this.bits - nbits;
            const val = (this.bitbuf >> shift) & ((1 << nbits) - 1);
            this.bits -= nbits;
            this.bitbuf &= (1 << this.bits) - 1;
            return val;
        }
    }

    function u8(x) { return x instanceof Uint8Array ? x : new Uint8Array(x); }
    function concatU8(...arrs) {
        const len = arrs.reduce((a, b) => a + b.length, 0);
        const out = new Uint8Array(len);
        let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
        return out;
    }
    function b64urlEncode(bytes) {
        let b64;
        if (typeof btoa === "function") {
            let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            b64 = btoa(bin);
        } else if (typeof Buffer !== "undefined") {
            b64 = Buffer.from(bytes).toString("base64");
        } else {
            throw new Error("No base64 encoder available");
        }
        return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function b64urlDecode(s) {
        s = s.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) s += "=";
        if (typeof atob === "function") {
            const bin = atob(s);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        } else if (typeof Buffer !== "undefined") {
            return new Uint8Array(Buffer.from(s, "base64"));
        }
        throw new Error("No base64 decoder available");
    }
    function base32encode(bytes) {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let out = "", bits = 0, val = 0;
        for (const b of bytes) {
            val = (val << 8) | b; bits += 8;
            while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; }
        }
        if (bits > 0) out += A[(val << (5 - bits)) & 31];
        return out;
    }

    function pepzip_encode(seq) {
        const s = seq.replace(/\s+/g, "").toUpperCase();
        if (!s || [...s].some(ch => !(ch in AA2CODE))) {
            const bad = [...new Set([...s].filter(ch => !(ch in AA2CODE)))];
            throw new Error("Invalid residues: " + (bad.length ? bad.join(",") : "empty sequence"));
        }
        const n = s.length;
        if (n > 1023) throw new Error("Sequence too long (max 1023 aa)");

        const bp = new BitPacker();
        bp.put(1, 3);
        bp.put(n, 10);
        for (const ch of s) bp.put(AA2CODE[ch], 5);
        const body = bp.finish();
        const chk = crc8(body);
        const payload = concatU8(body, u8([chk]));
        const token = b64urlEncode(payload);
        const groups = token.match(/.{1,5}/g) || [];
        return "pep1-" + groups.join("-");
    }

    function pepzip_decode(pepid) {
        if (!pepid.startsWith("pep1-")) throw new Error("Unsupported ID prefix");
        const token = pepid.slice(5).replace(/-/g, "");
        const raw = b64urlDecode(token);
        if (raw.length < 2) throw new Error("Truncated payload");
        const body = raw.subarray(0, raw.length - 1);
        const chk = raw[raw.length - 1];
        if (crc8(body) !== chk) throw new Error("Checksum mismatch");

        const bu = new BitUnpacker(body);
        const ver = bu.get(3);
        if (ver !== 1) throw new Error("Unsupported version " + ver);
        const n = bu.get(10);
        const out = [];
        for (let i = 0; i < n; i++) {
            const code = bu.get(5);
            const aa = CODE2AA[code];
            if (!aa) throw new Error("Unknown code " + code);
            out.push(aa);
        }
        return out.join("");
    }

    function pephash(seq, { salt = "" } = {}) {
        const s = (seq || "").replace(/\s+/g, "").toUpperCase() + "|" + salt;
        const bytes = strToU8(s);
        const h1 = murmur3_32(bytes, 0x9747b28c) >>> 0;
        const h2 = murmur3_32(bytes, 0x85ebca6b) >>> 0;
        const h3 = murmur3_32(bytes, 0xc2b2ae35) >>> 0;

        const out = new Uint8Array(10);
        writeU32BE(out, h1, 0);
        writeU32BE(out, h2, 4);
        out[8] = (h3 >>> 24) & 0xFF;
        out[9] = (h3 >>> 16) & 0xFF;
        const b32 = base32encode(out);
        const groups = b32.match(/.{1,4}/g) || [];
        return "peph-" + groups.join("-");
    }

    function strToU8(str) {
        const out = [];
        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i);
            if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
                const next = str.charCodeAt(++i);
                code = 0x10000 + ((code & 0x3FF) << 10) + (next & 0x3FF);
            }
            if (code <= 0x7F) out.push(code);
            else if (code <= 0x7FF) { out.push(0xC0 | (code >> 6), 0x80 | (code & 63)); }
            else if (code <= 0xFFFF) { out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)); }
            else { out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)); }
        }
        return new Uint8Array(out);
    }
    function writeU32BE(arr, val, off) {
        arr[off] = (val >>> 24) & 0xFF;
        arr[off + 1] = (val >>> 16) & 0xFF;
        arr[off + 2] = (val >>> 8) & 0xFF;
        arr[off + 3] = (val >>> 0) & 0xFF;
    }
    function murmur3_32(key, seed) {
        let h = seed >>> 0, k = 0, i = 0;
        const c1 = 0xcc9e2d51, c2 = 0x1b873593;
        const len = key.length;
        while (i + 4 <= len) {
            k = (key[i] | (key[i + 1] << 8) | (key[i + 2] << 16) | (key[i + 3] << 24)) >>> 0; i += 4;
            k = Math.imul(k, c1);
            k = (k << 15) | (k >>> 17);
            k = Math.imul(k, c2);
            h ^= k;
            h = (h << 13) | (h >>> 19);
            h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
        }
        k = 0;
        switch (len & 3) {
            case 3: k ^= key[i + 2] << 16;
            case 2: k ^= key[i + 1] << 8;
            case 1: k ^= key[i];
                k = Math.imul(k, c1);
                k = (k << 15) | (k >>> 17);
                k = Math.imul(k, c2);
                h ^= k;
        }
        h ^= len;
        h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
        h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
        h ^= h >>> 16;
        return h >>> 0;
    }

    function promptAlphaFold(peptide, selectedTrack) {
        return new Promise(function (resolve) {
            var export_sequence = {
                wid: 'card',
                componentRef: 'bottomPanel',
                data: {
                    cards: [[
                        {
                            title: '',
                            width: '100%',
                            height: '300px',
                            component: {
                                wid: 'text-editor',
                                height: '300px',
                                data: {
                                    height: '300px',
                                    showButton: false,
                                    title: 'Sequence',
                                    text: String(peptide)
                                }
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
                                            ionFunction: createIonFunction(function () {
                                                hideAllModal();
                                                resolve('close');
                                            })
                                        },
                                        {
                                            label: 'Run Alphafold',
                                            ionFunction: createIonFunction(function () {
                                                hideAllModal();
                                                resolve('run');

                                                setTimeout(() => {
                                                    graph.showMenu([{
                                                        label: 'Cancel',
                                                        click: () => {
                                                            setTimeout(() => {
                                                                graph.___folder_calculation_status = null;
                                                                graph.___folder_calculation = false;

                                                            }, 1000)

                                                        }
                                                    }], 100, 100)
                                                }, 2000)

                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
                }
            };

            showModal(export_sequence);
        });
    }

    function runAlphaFoldJobAsync(primary_url, submit_job, primary_msg) {
        return new Promise(function (resolve, reject) {
            try {

                var maybe = runAlphaFoldJob(primary_url, submit_job, primary_msg, function (err, result) {
                    if (typeof err !== 'undefined' && err !== null) reject(err);
                    else resolve(result);
                });

                if (maybe && typeof maybe.then === 'function') {
                    maybe.then(resolve).catch(reject);
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    let allResults = {}
    let track_to_res = {}

    function compressPeptide(seq) {
        if (typeof seq !== "string") throw new TypeError("seq must be a string");
        if (!/^[A-Z]+$/.test(seq)) throw new Error("seq must contain only A–Z");

        return seq.replace(/([A-Z])\1*/g, (run) => {
            const count = run.length;
            const aa = run[0];
            return (count > 1 ? String(count) : "") + aa;
        });
    }
    function decompressPeptide(comp) {
        if (typeof comp !== "string") throw new TypeError("comp must be a string");
        if (!/^(\d*[A-Z])+$/.test(comp)) throw new Error("invalid compressed format");

        return comp.replace(/(\d+)?([A-Z])/g, (_, n, aa) =>
            aa.repeat(n ? parseInt(n, 10) : 1)
        );
    }
    async function runAlphaFoldSequential(graph, primary_url, primary_msg) {
        var uniqueUrlSet = new Set();

        for (var i = 0; i < graph.track.length; i++) {
            var selectedTrack = graph.track[i];
            if (!selectedTrack || !(selectedTrack.markend > selectedTrack.markstart)) continue;

            var peptide = selectedTrack.getPeptideFromORF(selectedTrack.markstart, selectedTrack.markend);
            if (!peptide || peptide.length === 0) {
                infoPrompt("No peptide sequences found. You may not have selected a coding transcript or selected outside the open reading frame.");
                continue;
            }
            if (peptide.length > 2254) {
                infoPrompt("At the moment peptide length is limited; this is too big.");
                continue;
            }
            graph.setMessage("This can take from a few seconds to 7 minutes depending on the server load")
            graph.setMessageCenter("Alphafold on Nvidia in Azure");
            var decision = await promptAlphaFold(peptide, selectedTrack);
            if (decision !== 'run') {
                graph.setMessageCenter('Canceled by user.');
                continue;
            }
            let name = String(getUser()) + pephash(peptide);
            var submit_job = {
                job_name: name,
                sequence: peptide
            };
            try {
                if (submit_job.job_name && !(submit_job.job_name in allResults)) {
                    const result = await runAlphaFoldJobAsync(primary_url, submit_job, primary_msg);
                    allResults[peptide] = result;
                    track_to_res[peptide] = selectedTrack.name;
                }
                graph.setMessageCenter('Completed Alphafold: ');
            } catch (err) {
                console.error('Alphafold job failed:', err);
                graph.setMessageCenter('Failed Alphafold: ');
                return allResults
            }
        }

        var totalUrls = uniqueUrlSet.size;
        graph.setMessageCenter('Alphafold queue finished. PDB URLs: ' + totalUrls);

        return allResults;
    }

    function parseAlphafoldParams(input) {
        const num = s => Number(String(s).replace(/[_,\s]/g, ""));
        const msMatch = input.match(/max_seq\s*=\s*([0-9][0-9_,\s]*)/i);
        const meMatch = input.match(/max_extra_seq\s*=\s*([0-9][0-9_,\s]*)/i);

        if (!msMatch || !meMatch) {
            throw new Error("Could not find both max_seq and max_extra_seq in input.");
        }
        return {
            max_seq: num(msMatch[1]),
            max_extra_seq: num(meMatch[1]),
        };
    }
    function buildMemoryEquation(params) {
        const { max_seq, max_extra_seq } = params;
        const N = max_seq + max_extra_seq;

        const ascii = `RAM ≈ alpha · (${max_seq} + ${max_extra_seq}) · L^2 = alpha · ${N} · L^2`;
        const latex = String.raw`RAM \approx \alpha \cdot (${max_seq} + ${max_extra_seq}) \cdot L^2 \;=\; \alpha \cdot ${N} \cdot L^2`;
        return { N, ascii, latex };
    }
    function estimateRamGB(params, L, alpha) {
        if (!Number.isFinite(L) || L <= 0) throw new Error("L must be a positive number.");
        if (!Number.isFinite(alpha) || alpha <= 0) throw new Error("alpha must be a positive number.");
        const { max_seq, max_extra_seq } = params;
        const N = max_seq + max_extra_seq;
        return alpha * N * (L ** 2);
    }
    function calibrateAlpha(params, L0, RAM0_GB) {
        if (!Number.isFinite(L0) || L0 <= 0) throw new Error("L0 must be positive.");
        if (!Number.isFinite(RAM0_GB) || RAM0_GB <= 0) throw new Error("RAM0_GB must be positive.");
        const { max_seq, max_extra_seq } = params;
        const N0 = max_seq + max_extra_seq;
        return RAM0_GB / (N0 * (L0 ** 2));
    }

    function hasAlphafoldParams(input) {
        const hasMaxSeq = /max_seq\s*=\s*\d+/i.test(input);
        const hasMaxExtra = /max_extra_seq\s*=\s*\d+/i.test(input);
        return hasMaxSeq && hasMaxExtra;
    }

    let tries = 0;

    async function runAlphaFoldJob(baseurl, submit_job, msg) {
        const pollMs = 1000, maxTries = 500, fileExt = ".pdb"
        const joinUrl = (base, path) => new URL(path, String(base).endsWith("/") ? base : base + "/").toString();
        const predictUrl = joinUrl(baseurl, "predict");

        try {

            const res = await POSTJSON(submit_job, predictUrl);

            if (res && res.error) {
                if (tries < 1) {
                    tries++;
                    runAlphaFoldJob('https://gpu.hts.bio/alphafoldcpu/', submit_job, 'Alphafold/CPU-only/Azure')
                }
                else {
                    infoPrompt(" Service is currently unavailable")
                    return;
                }
            }

            graph.___folder_calculation = true;

            if (!res || !res.log_url || !res.results_url) {
                console.warn(`Bad response for job ${submit_job?.job_name}:`, res);
                graph.setMessage("No log found");
                graph.___folder_calculation_status = "GPU host is occupied.";
                graph.___folder_calculation = false;

                if (!baseurl.endsWith('cpu'))
                    runAlphaFoldJob('https://gpu.hts.bio/alphafoldcpu/', submit_job, 'Alphafold/CPU-only/Azure')
                else {
                    return { logUrl: "", filesUrl: "", pdbUrl: null, job: res ?? {} };
                }
            }
            const logUrl = (baseurl + res.log_url);
            const filesUrl = (baseurl + res.results_url);

            let latestEt = null;

            try {
                tailJobLog(logUrl, {
                    jobTag: `[${submit_job.job_name}] `,
                    pollMs: 3000,
                    maxIdleMs: 10 * 60 * 1000,
                    onLine: (line) => {
                        console.log(`[${submit_job.job_name}] ${line}`);
                        graph.___folder_calculation_status = line;
                    },
                    onStatus: ({ status, percent, elapsedText }) => {
                        if (typeof hasAlphafoldParams === "function" && hasAlphafoldParams(status)) {
                            const params = parseAlphafoldParams(status);
                            const eq = buildMemoryEquation(params);
                            const alpha = calibrateAlpha(params, 900, 30);
                            const ramGB = estimateRamGB(params, 1000, alpha);
                            graph.___folder_calculation_status = eq + " ~ " + ramGB;
                            graph.setMessage(eq + " ~ " + ramGB);
                        } else {
                            latestEt = elapsedText ?? latestEt;
                            const msg = `${percent != null ? ` ${percent}%` : ""}`;
                            console.log(msg);
                            graph.setMessage(msg);
                        }
                    },
                }).catch((e) => console.warn("tailJobLog error:", e?.message || e));
            } catch (e) {
                console.warn("tailJobLog start failed:", e?.message || e);
                if (tries < 1) {
                    tries++;
                    runAlphaFoldJob('https://gpu.hts.bio/alphafoldcpu/', submit_job, 'Alphafold/CPU-only/Azure')
                } else {
                    console.error(exception);

                    if (exception && exception.stack) {
                        console.error(exception.stack);
                    } else {

                        console.error(exception);
                    }
                    return;
                }

            }

            function formatElapsed(secs) {
                const m = Math.floor(secs / 60).toString().padStart(2, "0");
                const s = (secs % 60).toString().padStart(2, "0");
                return `${m}:${s}`;
            }

            async function waitForOutput(ext = fileExt) {
                const want = String(ext).toLowerCase();
                for (let i = 0; i < maxTries; i++) {
                    try {
                        const secs = Math.floor((i * pollMs) / 1000);
                        const human = formatElapsed(secs);
                        const baseMsg = (typeof msg === "string" && msg) ? msg : "Polling outputs";
                        graph.___folder_calculation_status = `${baseMsg} (${human})`;
                        const resp = await fetch(filesUrl);
                        if (!resp.ok) throw new Error(`Bad response: ${resp.status}`);
                        const files = await resp.json();
                        const hit = files.find((f) => f.toLowerCase().endsWith(want));
                        if (hit) {
                            const pdbUrl = joinUrl(filesUrl + "/", hit);
                            console.log(`PDB URL: ${pdbUrl}`);
                            graph.___folder_calculation_status = "Complete.";

                            graph.___folder_calculation = false;
                            graph.___folder_calculation_status = "Complete.";
                            return pdbUrl;
                        }
                    } catch (err) {
                        console.warn(`Error polling files: ${err.message}`);
                        return;
                    }
                    await new Promise((r) => setTimeout(r, pollMs));
                }
                console.warn(`No ${want} file found within polling window`);
                return null;
            }

            const pdbUrl = await waitForOutput(fileExt);
            return { logUrl, filesUrl, pdbUrl, job: res };
        } catch (exception) {
            console.error(exception);

            if (exception && exception.stack) {
                console.error(exception.stack);
            } else {

                console.error(exception);
            }

            return;

        }
    }
    const primary_url = 'https://gpu.hts.bio/alphafold/'
    const primary_msg = 'Alphafold/GPU/Azure'

    if (run) {

        if (graph.getMarkSelectedTracks()) {

            if (graph.getMarkSelectedTracks().length > 2) {
                infoPrompt("You can select up to two at sequences.")
                return;
            }
            if (graph.getMarkSelectedTracks().length <= 2) {
                runAlphaFoldSequential(graph, primary_url, primary_msg).then(allResults => {
                    hideAllModal();
                    if (allResults && Object.keys(allResults).length == 2) {
                        let keys = Object.keys(allResults)
                        let pdb1 = allResults[keys[0]].pdbUrl;
                        let pdb2 = allResults[keys[1]].pdbUrl;

                        if (pdb1 == pdb2) {
                            alert(' problem ')
                            showModal({
                                wid: 'json',
                                data: JSON.stringify(allResults)
                            })
                        }

                        let main_layout = {
                            wid: 'card-column',
                            height: '100%',
                            data: {
                                cards: [
                                    [
                                        {
                                            'width': '500px',
                                            'height': '500px',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            "title": track_to_res[keys[0]],
                                            'component': { wid: "molstar", data: { url: pdb1 }, label: '' + track_to_res[keys[0]] }
                                        },
                                        {
                                            'width': '500px',
                                            'height': '500px',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            "title": track_to_res[keys[1]],
                                            'component': { wid: "molstar", data: { url: pdb2 }, label: track_to_res[keys[1]] }
                                        },
                                    ],
                                    [
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Superimpose', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                setTimeout(() => {

                                                                    let main_layout = {
                                                                        wid: 'card-column',
                                                                        height: '100%',
                                                                        data: {
                                                                            cards: [
                                                                                [
                                                                                    {
                                                                                        'width': '500px',
                                                                                        'height': '500px',
                                                                                        "style.padding-top": '4px',
                                                                                        "style.border": '1px',
                                                                                        "title": "",
                                                                                        'component': { wid: "molstar", data: { urls: [pdb1, pdb2], labels: ['1', '2'] } }
                                                                                    },
                                                                                ],
                                                                                [
                                                                                    {
                                                                                        'title': '',
                                                                                        'width': '100%',
                                                                                        'component': {
                                                                                            wid: 'mt-button', data: {
                                                                                                buttons: [
                                                                                                    {
                                                                                                        label: 'Close', ionFunction: createIonFunction(async () => {
                                                                                                            hideAllModal();
                                                                                                            setTimeout(() => {
                                                                                                                CurrentLayout.clearComponent('mainPanel')
                                                                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                                                            }, 300)
                                                                                                        })
                                                                                                    }
                                                                                                ]
                                                                                            }
                                                                                        }
                                                                                    }

                                                                                ]
                                                                            ]
                                                                        }
                                                                    }
                                                                    CurrentLayout.setComponent('mainPanel', main_layout);

                                                                }, 300)

                                                            })
                                                        },
                                                        {
                                                            label: 'Close', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                setTimeout(() => {

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                }, 300)

                                                            })
                                                        },
                                                    ]
                                                }
                                            }
                                        }

                                    ]]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', main_layout);
                    } else {
                        for (let a of Object.keys(allResults)) {
                            let pdburl = allResults[a].pdbUrl;
                            if (pdburl)
                                showModal({ wid: "molstar", data: { url: pdburl } }, 600, 800);

                        }

                    }

                })
                return;
            }
        }
        graph.setMessage(" GPU slots are limited in the demo... you may get booted out.")

    } else {

        const runAlphaFold = async (primary_url, primary_msg) => {
            if (graph.getMarkSelectedTracks()) {
                if (graph.getMarkSelectedTracks().length > 2) {
                    infoPrompt("You can select up to two at sequences.")
                    return;
                }

                if (graph.getMarkSelectedTracks().length <= 2) {
                    runAlphaFoldSequential(graph, primary_url, primary_msg)
                    return;
                }
            }
            graph.setMessage(" GPU slots are limited in the demo... you may get booted out.")
        }

        let tools_menu = [
            {
                'label': 'Protein structure (CPU)', click: (async () => {
                    graph.setMessage(" Peptide sequence to 3D structure.")

                    runAlphaFold('https://gpu.hts.bio/alphafoldcpu/', 'Alphafold/CPU-only/Azure');
                })
            },
            {
                'label': 'Protein structure (GPU)', click: (async () => {
                    graph.setMessage(" GPU slots are limited in the demo... you may get booted out.")
                    runAlphaFold('https://gpu.hts.bio/alphafold/', 'Alphafold/GPU/Azure');
                })
            },

        ]
        return tools_menu;
    }

}
