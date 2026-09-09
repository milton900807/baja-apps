function (platetrack, targetPlot) {
    // Image -> timeline. The user uploads (or pastes) a picture of a timeline, roadmap,
    // Gantt chart or whiteboard plan; py/timeline/timeline-from-image.py has Claude
    // transcribe every dated item; the result is drawn as a timeline plot.
    //
    //   platetrack  the PlateTrack to draw on
    //   targetPlot  optional existing timeline plot: the user may replace its events

    const SCRIPT = '/py/timeline/timeline-from-image.py';
    const TIMEOUT_MS = 4 * 60 * 1000;
    const MAX_BYTES = 20 * 1024 * 1024;
    const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    let hintBox = null;
    let busy = false;
    let pasteListener = null;

    const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const say = (msg, type) => {
        try { platetrack.setMessage(msg, type); } catch (e) { }
    };

    const removePasteListener = () => {
        if (pasteListener) {
            try { document.removeEventListener('paste', pasteListener); } catch (e) { }
            pasteListener = null;
        }
    };

    const closeDialog = () => {
        removePasteListener();
        hideAllModal();
        setTimeout(() => { CurrentLayout.reset('mainPanel'); }, 300);
    };

    const readAsBase64 = (blob) => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => {
            const s = '' + fr.result;
            const comma = s.indexOf(',');
            res(comma >= 0 ? s.slice(comma + 1) : '');
        };
        fr.onerror = () => rej(fr.error || new Error('read error'));
        fr.readAsDataURL(blob);
    });

    // ------------------------------------------------------------------
    // Build the plot from the script result
    // ------------------------------------------------------------------
    const applyToPlot = (plot, model, title) => {
        const start = new Date(model.window.start);
        const end = new Date(model.window.end);
        const spanHours = Math.max(1, (end - start) / (1000 * 60 * 60));

        plot.scatterData = { points: model.points };
        plot.type = 'timeline';
        plot.startDate = start;
        plot.endDate = end;
        plot.name = title;
        plot.x_axis_label = '';
        plot.y_axis_label = '';
        plot.fitScaleToData = false;
        if (typeof plot.setTheme === 'function') plot.setTheme('timeline-clean');
        plot.grid.zoom(0, spanHours, 0, 1);
        plot.grid.rescale();
    };

    const createTimeline = async (model, fileName) => {
        const MPlot = await exec('flexigraph/plot');
        const plot = new MPlot({ points: model.points });
        const title = model.title || (fileName ? fileName.replace(/\.[^.]+$/, '') : '')
            || `${fmtShort(new Date(model.window.start))} – ${fmtShort(new Date(model.window.end))}`;
        applyToPlot(plot, model, title);
        plot.setWidth(platetrack.grid.worldWidth(900));
        plot.setHeight(platetrack.grid.worldHeight(360));
        plot.grid.rescale();
        platetrack.setPlotCenter(plot);
        setTimeout(async () => {
            try { if (platetrack.zoomintoplot) await platetrack.zoomintoplot(plot); } catch (e) { }
        }, 300);
        return plot;
    };

    const replaceTimeline = (plot, model) => {
        applyToPlot(plot, model, model.title || plot.name);
        return plot;
    };

    // ------------------------------------------------------------------
    // Run the extractor
    // ------------------------------------------------------------------
    const processImage = async (blob, name) => {
        if (busy) return;
        if (!blob) { say('No image selected.', 1); return; }
        const mime = (blob.type || 'image/png').toLowerCase();
        if (IMAGE_TYPES.indexOf(mime) < 0) {
            say('Please choose a PNG, JPEG, GIF or WebP image.', 1);
            return;
        }
        if (blob.size > MAX_BYTES) {
            say('That image is larger than 20 MB. Please use a smaller one.', 1);
            return;
        }

        busy = true;
        const hint = hintBox && typeof hintBox.value === 'string' ? hintBox.value.trim() : '';
        const fileName = name || blob.name || 'timeline-image.png';

        closeDialog();
        say('Reading the timeline image with Claude…', 5);

        let b64 = '';
        try { b64 = await readAsBase64(blob); } catch (e) { busy = false; say('Could not read the image.', 1); return; }
        if (!b64) { busy = false; say('The image was empty.', 1); return; }

        const em = new EngineMonitor((msg) => { try { platetrack.updateSprite(msg); } catch (e) { } });
        let timedOut = false, toTimer = null;
        const timeoutP = new Promise((res) => { toTimer = setTimeout(() => { timedOut = true; res(null); }, TIMEOUT_MS); });

        let model = null;
        try {
            model = await Promise.race([
                exec(SCRIPT, em, b64, mime, fileName, hint, new Date().toISOString()),
                timeoutP
            ]);
        } catch (e) {
            clearTimeout(toTimer);
            try { platetrack.killSprite(); } catch (e2) { }
            busy = false;
            say('Timeline extraction failed: ' + (e && e.message ? e.message : e), 1);
            return;
        }
        clearTimeout(toTimer);
        try { platetrack.killSprite(); } catch (e) { }
        busy = false;

        if (timedOut) { say('The AI service is taking too long. Please try again later.', 1); return; }
        if (!model || model.error) { say('Could not read a timeline from the image' + (model && model.error ? ': ' + model.error : '.'), 1); return; }
        if (!model.points || model.points.length === 0) { say('No dated events were found in that image.', 1); return; }

        const nI = (model.intervals || []).length, nM = (model.milestones || []).length;
        const summary = [nI ? `${nI} span${nI === 1 ? '' : 's'}` : '', nM ? `${nM} milestone${nM === 1 ? '' : 's'}` : '']
            .filter(Boolean).join(' and ');

        const done = () => {
            say(`Timeline built from ${fileName}: ${summary}` + (model.notes ? `. Notes: ${model.notes}` : ''), 1.1);
        };

        if (targetPlot && typeof platetrack.showMenu === 'function') {
            // Let the user choose where the events go.
            platetrack.showMenu([
                {
                    label: `Replace events on "${targetPlot.name}" (${summary})`,
                    move: () => { },
                    click: async () => {
                        try { platetrack.showMenu(null); } catch (e) { }
                        replaceTimeline(targetPlot, model);
                        done();
                    }
                },
                {
                    label: `Create a new timeline (${summary})`,
                    move: () => { },
                    click: async () => {
                        try { platetrack.showMenu(null); } catch (e) { }
                        await createTimeline(model, fileName);
                        done();
                    }
                }
            ]);
        } else {
            await createTimeline(model, fileName);
            done();
        }
    };

    // ------------------------------------------------------------------
    // Dialog
    // ------------------------------------------------------------------
    const sectionLabel = (text) => ({
        'width': '100%',
        'component': {
            wid: 'html',
            data: `<div style="padding:14px 16px 4px;font:600 11px/1.2 Inter,'Segoe UI',system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">${text}</div>`
        }
    });

    const layout = {
        wid: 'card',
        height: '100%',
        componentRef: 'mainPanel',
        data: {
            cards: [[
                {
                    'width': '100%',
                    'component': {
                        wid: 'html',
                        data: `
                            <div style="padding:16px 16px 8px;border-bottom:1px solid #e2e8f0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
                                <div style="font-size:18px;font-weight:600;color:#0f172a;">Timeline from an image</div>
                                <div style="margin-top:4px;font-size:13px;color:#64748b;">
                                    Upload a screenshot or photo of a timeline, roadmap, Gantt chart or whiteboard plan.
                                    Claude reads every dated item and draws it${targetPlot ? ' into this timeline' : ' as a new timeline'}.
                                    You can also paste an image from the clipboard with Ctrl+V.
                                </div>
                            </div>`
                    }
                },
                sectionLabel('Image'),
                {
                    'width': '100%',
                    'component': {
                        wid: 'simple-file-upload',
                        data: {
                            'showUploadButton': false,
                            'getUploadFolder': createIonFunction(() => { }),
                            'getRef': createIonFunction((ref) => { }),
                            'onDropToBlob': createIonFunction(async (file) => { }),
                            'fileFunction': createIonFunction(async (file) => {
                                await processImage(file, file && file.name);
                            })
                        }
                    }
                },
                sectionLabel('Hints for the AI (optional)'),
                {
                    'width': '100%',
                    'component': {
                        wid: 'input-textfield',
                        data: {
                            'show-button': false,
                            'title': 'e.g. "the year is 2026", "quarters are fiscal", "rows are teams"',
                            'text': '',
                            'ionHookFunction': createIonFunction((input_box) => { hintBox = input_box; })
                        }
                    }
                },
                {
                    'title': '',
                    'width': '100%',
                    'component': {
                        wid: 'mt-button',
                        data: {
                            buttons: [
                                {
                                    label: 'Cancel',
                                    background: '#ffffff',
                                    color: '#0f172a',
                                    borderColor: '#c8ced6',
                                    ionFunction: createIonFunction(() => { closeDialog(); })
                                }
                            ]
                        }
                    }
                }
            ]]
        }
    };

    // Clipboard paste while the dialog is open.
    pasteListener = async (evt) => {
        try {
            const items = (evt.clipboardData && evt.clipboardData.items) || [];
            let blob = null;
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it && it.type && ('' + it.type).indexOf('image') === 0) { blob = it.getAsFile(); break; }
            }
            if (!blob) return;
            evt.preventDefault();
            await processImage(blob, blob.name || 'pasted-image.png');
        } catch (e) { }
    };
    document.addEventListener('paste', pasteListener);

    CurrentLayout.clearComponent('mainPanel');
    CurrentLayout.setComponent('mainPanel', layout);
}
