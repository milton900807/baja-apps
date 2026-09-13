function (config) {

    // screen-recorder.js — record the SCREEN to a video file, as an alternative to
    // manchester/recorder.js, which records actions and replays them.
    //
    //   exec('manchester/screen-recorder.js')          // start (call again to stop)
    //
    // WHY BOTH. They are good at opposite things and neither replaces the other.
    //
    //   A SCRIPT is a few kilobytes, is editable, and replays LIVE against real data, so it
    //   stays current as the application changes and can be re-run on a different genome. It
    //   breaks when the interface it clicks moves.
    //
    //   A VIDEO is pixel-exact and always plays, including every panel, dialog, shelf and the
    //   header — everything a script has to be taught to reach. It is tens of megabytes, it
    //   cannot be edited, and it goes stale the moment the interface changes.
    //
    // WHAT IT CAPTURES. getDisplayMedia hands back a live stream of whatever the person picks
    // to share, so this records the TAB, not the canvas. That is the point: canvas.captureStream
    // would need no permission prompt and would miss the toolbars, libraries and dialogs, which
    // are DOM and not pixels on the canvas.
    //
    // THE PROMPT CANNOT BE SUPPRESSED. The browser asks which tab or screen to share every
    // time, and no page is allowed to answer for the user. One extra click before a demo.

    const BITS = 4_000_000;          // ~4 Mbps: a clean 1080p screen capture, ~30 MB a minute
    const ID = 'baja-vid-badge';

    // ALREADY RUNNING -> STOP. Same shape as the action recorder, so the one button in the
    // header starts and stops without having to know which state it is in.
    try {
        if (window.__bajaVideoRec && window.__bajaVideoRec.on) {
            try { window.__bajaVideoRec.stop(); } catch (e) { }
            return true;
        }
    } catch (e) { }

    const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const say = (m) => { try { console.log('[screen-recorder] ' + m); } catch (e) { } };

    // A BROWSER THAT CANNOT DO THIS SHOULD SAY SO, not fail silently on a click.
    const can = !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia
        && typeof window.MediaRecorder === 'function');
    if (!can) {
        try {
            window.alert('This browser cannot record the screen from a page.\n\n'
                + 'Screen capture needs getDisplayMedia and MediaRecorder, which Chrome, Edge and '
                + 'Firefox have. Safari’s support for the combination is partial.');
        } catch (e) { }
        return false;
    }

    // THE BEST CONTAINER THIS BROWSER WILL ACTUALLY WRITE. Asked for one it does not
    // support, MediaRecorder throws on construction, so the list is tried in order and the
    // first that passes isTypeSupported is used. The empty string is the browser's own
    // default and the last resort.
    const pickType = () => {
        const want = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        for (const t of want) {
            try { if (window.MediaRecorder.isTypeSupported(t)) return t; } catch (e) { }
        }
        return '';
    };

    const stamp = () => {
        const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    };
    const human = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB');

    (async () => {
        let stream = null;
        try {
            // `cursor: 'always'` so the pointer is in the recording: a demo of an interface is
            // largely a demo of where someone pointed, and a video without the cursor is a
            // slideshow of states with the reason for each one missing.
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30, cursor: 'always' },
                audio: false,
            });
        } catch (e) {
            // A refused prompt is a decision, not an error, and should not raise anything.
            say('display capture declined: ' + e);
            return;
        }

        const type = pickType();
        let rec = null;
        try { rec = new window.MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: BITS } : { videoBitsPerSecond: BITS }); }
        catch (e) {
            try { rec = new window.MediaRecorder(stream); } catch (e2) {
                try { stream.getTracks().forEach((t) => t.stop()); } catch (e3) { }
                try { window.alert('Recording could not start: ' + (e2 && e2.message ? e2.message : e2)); } catch (e3) { }
                return;
            }
        }

        const chunks = [];
        let bytes = 0;
        rec.ondataavailable = (e) => {
            if (e && e.data && e.data.size) { chunks.push(e.data); bytes += e.data.size; }
        };

        // ---- the badge: a readout, and NOTHING TO PRESS ----------------------------------
        //
        // Deliberately small and in a corner, because it is IN THE VIDEO: anything larger is
        // a watermark over the demo it is helping to make.
        //
        // AND IT NO LONGER TAKES CLICKS. It sat in the top-right corner with a Stop button on
        // it, over the part of the application people were trying to use -- so the control for
        // making a recording was in the way of the thing being recorded, which is the one
        // place it must never be. `pointer-events:none` means the pointer goes straight
        // through it to whatever is underneath, and stopping moved to the account menu, where
        // it cannot cover anything. The browser's own "Stop sharing" bar still works too.
        const badge = document.createElement('div');
        badge.id = ID;
        badge.style.cssText = 'position:fixed;top:10px;right:12px;z-index:2147483600;display:flex;'
            + 'align-items:center;gap:8px;background:rgba(11,37,69,0.78);color:#fff;'
            + 'border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:5px 11px;'
            + 'font:700 11px Arial,Helvetica,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.32);'
            + 'pointer-events:none;user-select:none;';
        badge.innerHTML = '<span id="bv-dot" style="width:9px;height:9px;border-radius:50%;background:#ef4444;'
            + 'box-shadow:0 0 8px #ef4444;"></span>'
            + '<span id="bv-t" style="font-variant-numeric:tabular-nums;">0:00</span>'
            + '<span id="bv-n" style="color:#9fb3c8;font-weight:600;">0 kB</span>';
        document.body.appendChild(badge);

        const t0 = Date.now();
        const tick = setInterval(() => {
            try {
                const s = Math.round((Date.now() - t0) / 1000);
                badge.querySelector('#bv-t').textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
                badge.querySelector('#bv-n').textContent = human(bytes);
                const d = badge.querySelector('#bv-dot');
                if (d) d.style.opacity = (Math.floor(Date.now() / 500) % 2) ? '1' : '0.25';
            } catch (e) { }
        }, 250);

        const cleanup = () => {
            try { clearInterval(tick); } catch (e) { }
            try { if (badge.parentNode) badge.parentNode.removeChild(badge); } catch (e) { }
            try { stream.getTracks().forEach((t) => t.stop()); } catch (e) { }
            try { window.__bajaVideoRec = { on: false }; } catch (e) { }
        };

        rec.onstop = async () => {
            cleanup();
            if (!chunks.length) { say('nothing was captured'); return; }
            const blob = new Blob(chunks, { type: (type || 'video/webm').split(';')[0] });
            const ext = (blob.type.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
            const name = 'baja-screen-' + stamp() + '.' + ext;
            offer(blob, name);
        };

        // STOPPING FROM THE BROWSER'S OWN BAR counts as stopping. Chrome puts a "Stop sharing"
        // control outside the page, and a recording that kept running after it would write a
        // file of nothing.
        try { stream.getVideoTracks().forEach((t) => { t.onended = () => { try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { } }; }); } catch (e) { }
        // Nothing on the badge to press any more: stopping is the account menu's item, the
        // browser's own bar, or running this module again (the toggle at the top).

        // A timeslice, so data arrives during the recording rather than in one lump at the
        // end: the size counter is honest and a crash loses a second, not the session.
        try { rec.start(1000); } catch (e) { rec.start(); }
        try { window.__bajaVideoRec = { on: true, stop: () => { try { if (rec.state !== 'inactive') rec.stop(); } catch (e2) { } } }; } catch (e) { }
        say('recording started (' + (type || 'browser default') + ')');
    })();

    // ---- what to do with the file ---------------------------------------------------
    //
    // Download and keep are both offered rather than one chosen: a demo usually wants the
    // file locally to edit or upload elsewhere, and the ones worth keeping belong beside the
    // designs they are about.
    function offer(blob, name) {
        const url = URL.createObjectURL(blob);
        const id = 'baja-vid-done';
        try { const old = document.getElementById(id); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const p = document.createElement('div');
        p.id = id;
        p.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(4,12,24,0.72);'
            + 'display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;';
        p.innerHTML = '<div style="width:min(560px,92vw);background:#0b2545;color:#eaf6f9;border-radius:14px;'
            + 'border:1px solid rgba(255,255,255,0.16);box-shadow:0 18px 50px rgba(0,0,0,0.5);overflow:hidden;">'
            + '<div style="padding:16px 20px;background:#0a1e3a;border-bottom:1px solid rgba(255,255,255,0.12);'
            + 'font:700 16px Arial;">Recording finished</div>'
            + '<div style="padding:18px 20px;">'
            + '<video src="' + url + '" controls style="width:100%;border-radius:9px;background:#000;max-height:46vh;"></video>'
            + '<div style="margin-top:12px;font:12.5px/1.6 Arial;color:#9fb3c8;">'
            + esc(name) + '  ·  ' + human(blob.size) + '</div>'
            + '<div id="bv-msg" style="margin-top:8px;font:12.5px Arial;color:#7fd9ea;min-height:18px;"></div>'
            + '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">'
            + '<button id="bv-dl" style="cursor:pointer;border-radius:8px;padding:10px 16px;font:700 13px Arial;'
            + 'border:1px solid #12c2e0;background:#12c2e0;color:#042a33;">Download</button>'
            + '<button id="bv-save" style="cursor:pointer;border-radius:8px;padding:10px 16px;font:600 13px Arial;'
            + 'border:1px solid rgba(255,255,255,0.25);background:transparent;color:#eaf6f9;">Keep in My Files</button>'
            + '<button id="bv-x" style="cursor:pointer;border-radius:8px;padding:10px 16px;font:600 13px Arial;'
            + 'border:1px solid rgba(255,255,255,0.25);background:transparent;color:#eaf6f9;">Discard</button>'
            + '</div></div></div>';
        document.body.appendChild(p);
        const msg = (t) => { try { p.querySelector('#bv-msg').textContent = t; } catch (e) { } };
        const close = () => {
            try { if (p.parentNode) p.parentNode.removeChild(p); } catch (e) { }
            // Revoked only on the way out: the <video> above is still reading from it.
            try { URL.revokeObjectURL(url); } catch (e) { }
        };
        try {
            p.querySelector('#bv-dl').onclick = () => {
                try {
                    const a = document.createElement('a');
                    a.href = url; a.download = name;
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { try { document.body.removeChild(a); } catch (e) { } }, 150);
                    msg('Downloaded.');
                } catch (e) { msg('Download failed: ' + (e && e.message ? e.message : e)); }
            };
            p.querySelector('#bv-x').onclick = close;
            p.querySelector('#bv-save').onclick = async () => {
                msg('Saving to My Files…');
                try {
                    const file = new File([blob], name, { type: blob.type });
                    const r = await upload(file, (pct) => msg('Saving to My Files — ' + Math.round(pct) + '%…'));
                    msg(r && r.ok ? 'Saved to My Files as ' + name : ('Could not save: ' + ((r && r.error) || 'unknown error')));
                } catch (e) { msg('Could not save: ' + (e && e.message ? e.message : e)); }
            };
        } catch (e) { }
    }

    // The SAME chunked upload the karyotype uses for a dropped file, so a video lands in My
    // Files the way everything else does and the 5 MB chunking keeps a long recording from
    // being one enormous request.
    async function upload(file, onPct) {
        const host_ = window['env']['apiUrl'];
        const chunkSize = 5 * 1024 * 1024;
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        const uploadId = Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + file.name;
        for (let ci = 0; ci < totalChunks; ci++) {
            const start = ci * chunkSize;
            const fd = new FormData();
            fd.append('user', getUser());
            fd.append('type', 'data');
            fd.append('file', file.slice(start, Math.min(start + chunkSize, file.size)), file.name);
            fd.append('uploadId', uploadId);
            fd.append('filename', file.name);
            fd.append('chunkIndex', String(ci));
            fd.append('totalChunks', String(totalChunks));
            fd.append('fileSize', String(file.size));
            try {
                const res = await fetch(host_ + '/upload', { method: 'POST', body: fd });
                const r = await res.json();
                if (!res.ok || (r && r.failed)) return { error: 'upload failed at chunk ' + ci };
            } catch (e) { return { error: 'network error during upload' }; }
            if (onPct) onPct(((ci + 1) / totalChunks) * 100);
        }
        return { ok: true };
    }

    return true;
}
