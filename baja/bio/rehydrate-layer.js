function () {
    // REBUILD A SAVED TRACK LAYER AS THE CLASS IT WAS.
    //   const RL = await exec('baja/bio/rehydrate-layer.js');
    //   const layer = await RL(tl);          // tl = the layer's plain JSON
    //
    // A layer's behaviour lives on its PROTOTYPE -- CisLayer paints its own windows,
    // AttributionSushimiLayer draws its own arcs -- and JSON carries none of that. So every
    // loader has to look at the saved `type` and construct the right class. There are
    // several loaders (flexigraph/gene.js, flexigraph/gene2plates.js, load-track.js,
    // copyLayers, liftLayers...), each grew its own dispatch, and they do not agree. The
    // comment on __migrateCisLayer in baja/bio/track-layer.js records the result: "a CisLayer
    // falls through all but two of them into a plain TrackLayer", which then repairs itself at
    // draw time. This module is that dispatch, once.
    //
    // THE BUG THIS FIXES. gene.js tested, in this order:
    //
    //     if (!tl.attribution_type)                       -> plain TrackLayer
    //     else if (tl.attribution_type.includes(...))      -> AttributionLayer
    //     else if (tl.gpts || tl.apts || ...)              -> AttributionLayer
    //     else if (tl.type === 'AttributionSushimiLayer')  -> AttributionSushimiLayer
    //
    // `attribution_type` is undefined on every layer that is not an attribution layer, so the
    // FIRST branch caught them all and the `tl.type` test below it was unreachable. Every
    // subclass came back from a file as a plain TrackLayer with its painter gone. That is why
    // layers stopped working after save and reload -- and the console said so on every load:
    // "tl type : undefined for name SMN2_domains".
    //
    // So `type` -- the field the classes actually set -- is consulted FIRST, and the
    // attribution heuristics are kept only as a fallback for saves old enough to predate it.
    const PATHS = {
        CisLayer: 'baja/bio/splicing/cis-layer.js',
        AttributionLayer: 'baja/bio/attribution-layer.js',
        AttributionSushimiLayer: 'baja/bio/attribution-sushimi-layer.js',
        TrackLayer: 'baja/bio/track-layer.js',
    };
    const cache = {};
    const klass = async (name) => {
        if (cache[name] !== undefined) return cache[name];
        let K = null;
        try { K = await exec(PATHS[name]); } catch (e) { K = null; }
        cache[name] = K;
        return K;
    };

    // Which class a saved layer is, from the layer alone.
    const classNameOf = (tl) => {
        const t = '' + ((tl && tl.type) || '');
        if (PATHS[t]) return t;
        // Fallbacks for layers saved before `type` was written, in the order the old loaders
        // used them. An attribution layer is recognisable from its own fields.
        try {
            if (tl && tl.attribution_type && ('' + tl.attribution_type).includes('attribution')) return 'AttributionLayer';
            if (tl && (tl.gpts || tl.apts || tl.cpts || tl.tpts)) return 'AttributionLayer';
        } catch (e) { }
        return 'TrackLayer';
    };

    const rehydrate = async (tl) => {
        if (!tl) return null;
        const name = classNameOf(tl);
        let K = await klass(name);
        if (!K) K = await klass('TrackLayer');
        if (!K) return null;
        let layer;
        try { layer = Object.assign(new K(), tl); }
        catch (e) {
            // A constructor that needs arguments must not lose the layer: fall back to
            // grafting the prototype onto the plain object, which is what hydrate() does.
            layer = tl;
            try { Object.setPrototypeOf(layer, K.prototype); } catch (e2) { }
        }
        // CisLayer (and any class that grows one) restores its class-field defaults here;
        // Object.assign copies the JSON's own keys only, so fields the class declares but the
        // save did not contain would otherwise be undefined and the painter throws on the
        // first one it reads.
        try { if (typeof K.hydrate === 'function') K.hydrate(layer); } catch (e) { }
        try { layer.type = name; } catch (e) { }
        return layer;
    };

    rehydrate.classNameOf = classNameOf;
    rehydrate.paths = PATHS;
    return rehydrate;
}
