function () {

    // WHAT THE CANVAS IS, AS JSON, IN ONE PLACE.
    //   const toJson = await exec('manchester/io/graph-to-json.js');
    //   const text = await toJson(graph, (pct) => { ... });
    //
    // This is the serializer the save has always used, lifted out of save-obj.js unchanged
    // so that downloading the canvas and saving it are the same answer to the same
    // question. A second walk written for the download would have agreed with this one
    // until the day one of them learned a rule the other did not -- and the rules here are
    // not obvious: keys ending in _transient_ are derived state and are left out, the DOM
    // and canvas contexts are not data, a getter that throws is skipped rather than fatal,
    // and the object graph has cycles in it, so the same object is written once and
    // thereafter not at all.
    //
    // It yields to the event loop as it goes: a design with a few hundred thousand nodes
    // in it would otherwise lock the tab for the length of the write.
    //
    // progressBarPercent is called with 20..50 while it walks and 50..70 while it joins.

    return async function stringifyGraphAsync(graph, progressBarPercent) {
        const __pct = (typeof progressBarPercent === 'function') ? progressBarPercent : (() => { });
        progressBarPercent = __pct;

                        const transientRE = /_transient_$/i;

                        function shouldSkipObject(o) {
                            if (!o || typeof o !== "object") return false;

                            if (typeof window !== "undefined") {
                                if (o === window || o === document) return true;
                                if (typeof Node !== "undefined" && o instanceof Node) return true;
                                if (typeof Window !== "undefined" && o instanceof Window) return true;
                                if (typeof Document !== "undefined" && o instanceof Document) return true;
                            }
                            if (typeof CSSStyleSheet !== "undefined" && o instanceof CSSStyleSheet) return true;
                            if (typeof StyleSheet !== "undefined" && o instanceof StyleSheet) return true;
                            if (typeof CanvasRenderingContext2D !== "undefined" && o instanceof CanvasRenderingContext2D) return true;

                            return false;
                        }

                        function safeGet(obj, key) {
                            try {
                                return obj[key];
                            } catch {

                                return undefined;
                            }
                        }

                        function isOmittableObjectValue(v) {
                            const t = typeof v;
                            return v === undefined || t === "function" || t === "symbol";
                        }

                        function normalizeNumber(n) {

                            return Number.isFinite(n) ? n : null;
                        }

                        let total = 0;
                        const seenCount = new WeakSet();

                        (function count(v) {
                            if (!v || typeof v !== "object") return;
                            if (shouldSkipObject(v)) return;
                            if (seenCount.has(v)) return;
                            seenCount.add(v);
                            total++;

                            if (Array.isArray(v)) {
                                for (let i = 0; i < v.length; i++) count(v[i]);
                            } else {
                                for (const k in v) {
                                    if (transientRE.test(k)) continue;
                                    const child = safeGet(v, k);
                                    if (child !== undefined) count(child);
                                }
                            }
                        })(graph);

                        const seen = new WeakSet();
                        const out = [];
                        let visited = 0;
                        let lastPct = -1;

                        function write(s) { out.push(s); }

                        function emitPct(frac01) {

                            const pct = 20 + Math.floor(Math.min(1, Math.max(0, frac01)) * 30);
                            if (pct !== lastPct) {
                                lastPct = pct;
                                progressBarPercent(pct);
                            }
                        }

                        async function walk(value, ctx) {

                            if (isOmittableObjectValue(value)) {

                                if (ctx === "array" || ctx === "root") {
                                    write("null");
                                }
                                return;
                            }

                            if (typeof value === "number") {
                                write(JSON.stringify(normalizeNumber(value)));
                                return;
                            }

                            if (value && typeof value === "object") {
                                if (shouldSkipObject(value)) {
                                    write("null");
                                    return;
                                }
                                if (seen.has(value)) {
                                    write('"[d_c]"');
                                    return;
                                }
                                seen.add(value);
                                visited++;

                                if ((visited & 1023) === 0) {
                                    emitPct(total ? visited / total : 0);
                                    await new Promise(r => setTimeout(r, 0));
                                }

                                if (Array.isArray(value)) {
                                    write("[");
                                    for (let i = 0; i < value.length; i++) {
                                        if (i) write(",");
                                        const elem = value[i];

                                        if (isOmittableObjectValue(elem)) {
                                            write("null");
                                        } else {
                                            await walk(elem, "array");
                                        }
                                    }
                                    write("]");
                                    return;
                                }

                                write("{");
                                let first = true;
                                for (const k in value) {
                                    if (transientRE.test(k)) continue;

                                    const child = safeGet(value, k);

                                    if (isOmittableObjectValue(child)) continue;

                                    if (!first) write(",");
                                    first = false;
                                    write(JSON.stringify(k));
                                    write(":");
                                    await walk(child, "object");
                                }
                                write("}");
                                return;
                            }

                            write(JSON.stringify(value));
                        }

                        emitPct(0);
                        await walk(graph, "root");
                        progressBarPercent(50);

                        let result = "";
                        const joinChunk = 4096;
                        for (let i = 0; i < out.length; i += joinChunk) {
                            result += out.slice(i, i + joinChunk).join("");
                            if ((i & (joinChunk * 8 - 1)) === 0) {
                                await new Promise(r => setTimeout(r, 0));
                            }
                        }
                        return result;

    };
}
