function () {

    const maxDepth = 10;
    const maxNodes = 200_000;
    return (object, v) => {
        const seen = new WeakSet();
        const depths = new WeakMap();
        let nodeCount = 0;
        try {
            const json = JSON.stringify(
                object,
                function (key, value) {
                    nodeCount++;
                    if (nodeCount > maxNodes) return undefined;
                    if (key != null) {
                        if (key === 'fun' && value != null) {
                            try {
                                return value.toString();
                            } catch {
                                return '[Function]';
                            }
                        }
                        if (key.startsWith?.('__')) return null;
                        if (key === 'value' && v !== undefined) return v;
                    }
                    const parentDepth = depths.get(this) ?? 0;
                    const nextDepth = parentDepth + 1;
                    if (value!=null && typeof value === 'object') {
                        if (nextDepth > maxDepth) return undefined;
                        if (seen.has(value)) return '[Circular]';
                        seen.add(value);
                        depths.set(value, nextDepth);
                    }
                    return value;
                }
            );
            return json;
        } catch (e) {

            return JSON.stringify({ error: 'safeStringify failed', message: String(e) });
        }
    };

}
