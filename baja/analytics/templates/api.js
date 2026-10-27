function () {

    // Baja Analytics templates: talking to the library.
    //
    //   const api = await exec('baja/analytics/templates/api')
    //   const lib = await api.loadIndex()          // { categories, templates, offline }
    //   const rs  = await api.loadItem(entry)      // { rule_value, ... } as /get-script returns it
    //   await api.publish({ title, kind, ... }, payloadString)
    //   await api.remove(id)
    //   api.encode(obj, replacer)                  // the payload string for a table/model/timeline
    //
    // The server endpoints are /analytics-templates/* (baja-server src/analytics-templates.ts).
    // Against an older server without them, the built-in library still works: the index is read
    // from baja/analytics-templates/index.json and payloads through /get-script, exactly the
    // files the old Tables/Models/Timelines menus read. Only "my templates" needs the new server.

    const apiUrl = () => (window['env'] && window['env']['apiUrl']) || '';
    const user = () => { try { return '' + (getUser() || ''); } catch (e) { return ''; } };

    async function getJson(url) {
        const r = await fetch(url, { headers: { 'x-user-id': user() } });
        let body = null;
        try { body = await r.json(); } catch (e) { }
        if (!r.ok) {
            const err = new Error((body && body.msg) || ('HTTP ' + r.status));
            err.status = r.status;
            throw err;
        }
        return body;
    }

    async function postJson(url, obj) {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-user-id': user() },
            body: JSON.stringify(obj),
        });
        let body = null;
        try { body = await r.json(); } catch (e) { }
        if (!r.ok || (body && body.ok === false)) {
            const err = new Error((body && body.msg) || ('HTTP ' + r.status));
            err.status = r.status;
            throw err;
        }
        return body;
    }

    async function getScript(spath, name) {
        return POSTJSON({ spath: spath, rule_name: name, user: user() }, apiUrl() + '/get-script');
    }

    async function loadIndex() {
        try {
            const r = await getJson(apiUrl() + '/analytics-templates/index?user=' + encodeURIComponent(user()));
            return { categories: r.categories || [], templates: r.templates || [], offline: false };
        } catch (e) {
            // Older server: no endpoint. Read the built-in index the same way modules are read.
            const rs = await getScript('/baja/analytics-templates', 'index.json');
            if (!rs || !rs.rule_value) throw new Error('The template library is not available on this server.');
            const ix = JSON.parse(rs.rule_value);
            return {
                categories: ix.categories || [],
                templates: (ix.templates || []).map(t => Object.assign({}, t, { source: 'builtin' })),
                offline: true,
            };
        }
    }

    async function loadItem(entry) {
        if (!entry) throw new Error('No template selected.');
        try {
            const q = '?id=' + encodeURIComponent(entry.id) + '&source=' + encodeURIComponent(entry.source || 'builtin')
                + '&user=' + encodeURIComponent(user());
            const r = await getJson(apiUrl() + '/analytics-templates/item' + q);
            if (r && r.rule_value) return r;
        } catch (e) {
            if (entry.source === 'mine') throw e;
        }
        // Built-in on an older server: the payload file itself.
        const rs = await getScript(entry.spath, entry.name);
        if (!rs || !rs.rule_value) throw new Error('Could not load ' + (entry.title || entry.id) + '.');
        return rs;
    }

    async function publish(meta, payload) {
        const body = Object.assign({}, meta, { user: user(), payload: payload });
        const r = await postJson(apiUrl() + '/analytics-templates/publish', body);
        return r.template;
    }

    async function remove(id) {
        return postJson(apiUrl() + '/analytics-templates/delete', { user: user(), id: id });
    }

    // The stored form every loader expects: zlib bytes (pako, via compressString), one char per
    // byte, in 32 KB chunks so String.fromCharCode does not overflow the stack.
    function encode(obj, replacer) {
        const bytes = compressString(JSON.stringify(obj, replacer || undefined));
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return s;
    }

    // What publish-yakro.js strips when it serializes a whole workbook: functions as source,
    // plate links as uids, and transient __ fields dropped.
    function workbookReplacer(key, value) {
        if (key != null) {
            if (key === 'fun') return value != null ? value.toString() : value;
            const k = key.toString().toLowerCase();
            if (k === 'toplate' && value) return 'toPlate:' + (value[key] ? value[key].uid : value.uid);
            if (k === 'fromplate' && value) return 'fromPlate:' + (value[key] ? value[key].uid : value.uid);
            if (key.startsWith && key.startsWith('__')) return null;
        }
        return value;
    }

    return { loadIndex, loadItem, publish, remove, encode, workbookReplacer, user };
}
