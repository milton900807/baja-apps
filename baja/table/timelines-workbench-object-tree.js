function (pm) {

    return new Promise(async (resolve, reject) => {
        const spath = 'baja/templates/timelines';
        let host_ = window['env']['apiUrl'];
        let r = await POSTJSON({ spath: spath }, host_ + '/ljl-tree');
        function buildRecursiveNode(node, currentPath = spath) {
            if (node.type === 'directory') {

                const dirPath = `${currentPath}/${node.name}`;

                if (node.name === 'science') {

                    node.children.push({

                        name: `Citations to timeline`,
                        label: `Citations to timeline`,
                        type: 'inject',
                        click: async (scx, scy) => {
                            let name = null;
                            let path = null;
                            let _color = 'black'
                            let comp;
                            let innerComponentCallback = createIon((_panel) => {
                                comp = _panel;
                            })
                            let __color = 'rgba(0, 87, 163, 0.5)'
                            let progressBar;
                            let w = {
                                wid: 'progress',
                                componentRef: 'progressBar',
                                data: {
                                    'progress': 0,
                                    'progressBar': createIonFunction((progessBar) => {
                                        progressBar = progessBar;
                                    })
                                }
                            }

                            let design_params_panel_layout = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr>

                                                    1)  Select a file already uploaded or upload using the file upload window.
                                                    2)  Once you have selected a file then click the Load button at the bottom.

                                            `
                                                }
                                            },

                                            {
                                                'width': '100%',
                                                'component': w
                                            },
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'simple-file-upload',
                                                    data: {
                                                        'showUploadButton': false,
                                                        'getUploadFolder': createIonFunction(() => {
                                                        }),
                                                        'getRef': createIonFunction((ref) => {
                                                            file_drop_object = ref;
                                                        }),
                                                        'onDropToBlob': createIonFunction(async (file) => {
                                                        }),
                                                        'fileFunction': createIonFunction(async (file) => {
                                                            if (!file) {
                                                                console.error("No file selected for upload.");
                                                                return { error: "No file selected" };
                                                            }
                                                            const user = getUser();
                                                            const type = "data";
                                                            const chunkSize = 5 * 1024 * 1024;
                                                            const totalChunks = Math.ceil(file.size / chunkSize);
                                                            let uploadedChunks = 0;

                                                            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                                                const start = chunkIndex * chunkSize;
                                                                const end = Math.min(start + chunkSize, file.size);
                                                                const chunk = file.slice(start, end);

                                                                const formData = new FormData();
                                                                formData.append("user", user);
                                                                formData.append("type", type);
                                                                formData.append("file", chunk, file.name);
                                                                if (path) {
                                                                    formData.append("path", path);
                                                                }
                                                                try {

                                                                    let host_ = window['env']['apiUrl']
                                                                    const response = await fetch(host_ + '/upload', {
                                                                        method: 'POST',
                                                                        body: formData
                                                                    })

                                                                    const result = await response.json();
                                                                    if (!response.ok || result.failed) {
                                                                        console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                                                                        return { error: `Upload failed at chunk ${chunkIndex}` };
                                                                    }

                                                                    uploadedChunks++;
                                                                    progressBar((uploadedChunks / totalChunks) * 100)

                                                                    console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                                                                    setTimeout(async () => {
                                                                        await comp.refresh();
                                                                    }, 700)

                                                                } catch (error) {
                                                                    console.error("Upload failed:", error);
                                                                    return { error: "Network or server error during upload" };
                                                                }
                                                            }

                                                        })
                                                    }
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '90%',
                                                'component':
                                                {

                                                    wid: 'simple-file-browser',
                                                    width: '100%',
                                                    height: '100%',
                                                    refCallback: innerComponentCallback,
                                                    data: {
                                                        "ionfunction.cmd": createIonFunction((element) => {

                                                        }),

                                                        width: '100%',
                                                        columns: 3,
                                                        showSearch: true,
                                                        drive: 'user',
                                                        user: getUser(),
                                                        root: getUser(),
                                                        "ionfunction.fileClick": createIonFunction(async (element) => {
                                                            path = element.path;
                                                            name = element.name;
                                                            infoPrompt(" " + name + " selected.")
                                                        }),
                                                        "ionfunction.openfile": createIonFunction(async (file, text) => {

                                                        }
                                                        ),
                                                        "ionfunction.path": createIonFunction(async (_path, nodes) => {
                                                            path = _path;

                                                        })
                                                    }
                                                }
                                            },

                                        ]
                                    ]
                                }
                            }

                            let sequence_input = {
                                wid: 'card',
                                "height": "500px",
                                data: {
                                    "style.padding-top": '1px',
                                    "style.border": '1px',
                                    "style.height": "500px",
                                    cards: [
                                        [
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'card',
                                                    data: {
                                                        cards: [
                                                            [

                                                                {
                                                                    'width': '100%',
                                                                    'height': "100px",
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'color-chooser',
                                                                        'width': '100%',

                                                                        "data": {
                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                __color = _color;
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ],
                                                            [
                                                                {
                                                                    'component': design_params_panel_layout
                                                                }
                                                            ]
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Load', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                    progressBar(0)
                                                                    let host = window['env']['apiUrl'];
                                                                    if (this.server) {
                                                                        host = this.server
                                                                    }
                                                                    function removeFirstPathNode(path) {
                                                                        const segments = path.split('/').filter(Boolean);
                                                                        segments.shift();
                                                                        return segments.join('/');
                                                                    }
                                                                    let npath = removeFirstPathNode(path);
                                                                    infoPrompt("Attempting to create timeline using references from " + npath)

                                                                    let rf = await exec(`py/extract/extract_citations_from_pdf.py`, '~/' + npath);

                                                                    progressBar(80)

                                                                    if (!rf || rf.length === 0) {
                                                                        infoPrompt(" No citations found in document")
                                                                        return;
                                                                    } else {
                                                                        infoPrompt(' Loading ' + rf.length + ' points.')
                                                                    }

                                                                    async function createTimelinePlotFromReferences(referenceArray, plateTrack) {
                                                                        const MPlot = await exec('flexigraph/plot');

                                                                        const parsedData = referenceArray
                                                                            .map(entry => {
                                                                                let jsDateStr = entry.JS_Date;
                                                                                let fullDateStr;

                                                                                if (!jsDateStr) return null;

                                                                                if (jsDateStr.length === 4) {

                                                                                    const year = parseInt(jsDateStr, 10);
                                                                                    const randomDay = Math.floor(Math.random() * 365);
                                                                                    const date = new Date(year, 0);
                                                                                    date.setDate(date.getDate() + randomDay);
                                                                                    fullDateStr = date.toISOString().slice(0, 10);
                                                                                } else if (jsDateStr.length === 7) {
                                                                                    fullDateStr = `${jsDateStr}-15`;
                                                                                } else {
                                                                                    fullDateStr = jsDateStr;
                                                                                }

                                                                                const date = new Date(fullDateStr);
                                                                                if (isNaN(date.getTime())) return null;

                                                                                return {
                                                                                    date,
                                                                                    authors: entry.Author || "Unknown",
                                                                                    title: entry.Title || "Untitled",
                                                                                    category: entry.category,
                                                                                    doi: entry.DOI || "",
                                                                                    formattedLabel: date.toLocaleDateString('en-US', {
                                                                                        year: 'numeric',
                                                                                        month: 'short',
                                                                                        day: 'numeric'
                                                                                    })
                                                                                };
                                                                            })
                                                                            .filter(entry => entry !== null);

                                                                        if (parsedData.length === 0) {
                                                                            console.warn("No valid reference dates found.");
                                                                            return;
                                                                        }

                                                                        parsedData.sort((a, b) => a.date - b.date);

                                                                        const start_date = parsedData[0].date;
                                                                        const end_date = parsedData[parsedData.length - 1].date;

                                                                        const dataPoints = parsedData.map(entry => {
                                                                            const xHours = (entry.date - start_date) / (1000 * 60 * 60);
                                                                            let c = {
                                                                                type: 'milestone',
                                                                                color: _color,
                                                                                x: xHours,
                                                                                y: 0.1,
                                                                                name: entry.title,
                                                                                tooltip: `${entry.authors || 'Unknown authors'}. ${entry.title || 'Untitled'}${entry.reference ? ` (DOI: ${entry.reference})` : ''}`,
                                                                                meta: { ...entry }
                                                                            };
                                                                            if (entry.doi) {
                                                                                c.doi = entry.doi;
                                                                            }
                                                                            return c;

                                                                        });
                                                                        const scatterData = { points: dataPoints };
                                                                        const plot = new MPlot(scatterData);
                                                                        plot.type = 'timeline';

                                                                        const spanMs = end_date - start_date;
                                                                        const paddingMs = spanMs * 0.10;
                                                                        plot.startDate = start_date
                                                                        plot.endDate = end_date;

                                                                        const formattedStart = start_date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                                                                        const formattedEnd = end_date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                                                                        plot.name = `${formattedStart} - ${formattedEnd}`;
                                                                        plot.x_axis_label = "Time (Years)";
                                                                        plot.y_axis_label = "Reference Points";

                                                                        const xMin = Math.min(...scatterData.points.map(p => p.x));
                                                                        const xMax = Math.max(...scatterData.points.map(p => p.x));
                                                                        plot.grid.zoom(xMin, xMax, 0, 1);

                                                                        plot.setWidth(plateTrack.grid.worldWidth(400));
                                                                        plot.setHeight(plateTrack.grid.worldHeight(1200));
                                                                        plot.grid.rescale();
                                                                        plot.maximize = true;

                                                                        plateTrack.m_plots.push(plot);
                                                                        setTimeout(async () => {
                                                                            await plateTrack.zoomintoplot?.(plot);
                                                                        }, 399);
                                                                    }
                                                                    const pt = pm.plateTrack;
                                                                    setTimeout(async () => {
                                                                        await createTimelinePlotFromReferences(rf, pt)
                                                                    }, 400)
                                                                    pt.wb(null)
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            },
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }

                            setTimeout(() => {

                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', sequence_input);
                            }, 1000)
                        }
                    }
                    )
                }

                return {
                    label: '[' + node.name + ']/',
                    children: node.children
                        .map(child => buildRecursiveNode(child, dirPath))
                        .filter(child => child !== null),
                    click: () => { }
                };
            } else if (node.type === 'file' && node.name.endsWith('.ljp')) {
                return {
                    label: node.name.replace('.ljp', ''),
                    click: () => {
                        const parentPath = currentPath;
                        exec('baja/draw/place-timeline', pm.plateTrack, null, parentPath, node.name);
                    }
                };
            } else if (node.type === 'inject') {
                return {
                    label: node.name,
                    click: () => {
                        node.click()
                    }
                }
            }
        }
        const list_of_items = r.map(node => buildRecursiveNode(node)).filter(node => node !== null);
        const t = [
            {
                label: 'Today',
                description: ' ...',
                click: async () => {

                    function getTodayTimeRange() {
                        const now = new Date();

                        const startOfDay = new Date(now);
                        startOfDay.setHours(0, 0, 0, 0);

                        const endOfDay = new Date(now);
                        endOfDay.setHours(23, 59, 59, 999);

                        return { start: startOfDay, end: endOfDay };
                    }

                    let obj = getTodayTimeRange();
                    await exec('baja/draw/place-timeline-with-time-range', pm.plateTrack, obj.start, obj.end);
                }
            },
            {
                label: 'This week',
                description: ' ...',
                click: async () => {

                    function getThisWeekTimeRange() {
                        const now = new Date();

                        const dayOfWeek = now.getDay();

                        const startOfWeek = new Date(now);
                        startOfWeek.setDate(now.getDate() - dayOfWeek);
                        startOfWeek.setHours(0, 0, 0, 0);

                        const endOfWeek = new Date(startOfWeek);
                        endOfWeek.setDate(startOfWeek.getDate() + 6);
                        endOfWeek.setHours(23, 59, 59, 999);

                        return { start: startOfWeek, end: endOfWeek };
                    }

                    let obj = getThisWeekTimeRange();
                    await exec('baja/draw/place-timeline-with-time-range', pm.plateTrack, obj.start, obj.end);
                }
            },
            {
                label: 'This month',
                description: ' ...',
                click: async () => {

                    function getThisMonthTimeRange() {
                        const now = new Date();

                        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        startOfMonth.setHours(0, 0, 0, 0);

                        const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                        const endOfMonth = new Date(startOfNextMonth - 1);

                        return { start: startOfMonth, end: endOfMonth };
                    }

                    let obj = getThisMonthTimeRange();
                    await exec('baja/draw/place-timeline-with-time-range', pm.plateTrack, obj.start, obj.end);
                }
            },
            {
                label: 'This Quarter',
                description: ' ...',
                click: async () => {

                    function getThisQuarterTimeRange() {
                        const now = new Date();
                        const currentMonth = now.getMonth();

                        const quarterStartMonth = Math.floor(currentMonth / 3) * 3;

                        const startOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1);
                        startOfQuarter.setHours(0, 0, 0, 0);

                        const startOfNextQuarter = new Date(now.getFullYear(), quarterStartMonth + 3, 1);
                        const endOfQuarter = new Date(startOfNextQuarter - 1);

                        return { start: startOfQuarter, end: endOfQuarter };
                    }

                    let obj = getThisQuarterTimeRange();
                    await exec('baja/draw/place-timeline-with-time-range', pm.plateTrack, obj.start, obj.end);
                }
            },
            {
                label: 'This Year',
                description: ' ...',
                click: async () => {
                    function getThisYearTimeRange() {
                        const now = new Date();
                        const year = now.getFullYear();

                        const startOfYear = new Date(year, 0, 1);
                        startOfYear.setHours(0, 0, 0, 0);

                        const endOfYear = new Date(year, 11, 31);
                        endOfYear.setHours(23, 59, 59, 999);

                        return { start: startOfYear, end: endOfYear };
                    }

                    let obj = getThisYearTimeRange();
                    await exec('baja/draw/place-timeline-with-time-range', pm.plateTrack, obj.start, obj.end);
                }
            },

            {
                label: 'more...',
                description: ' General timelines...',
                click: () => { },
                children: list_of_items
            }
        ];
        return resolve(t);
    })
}
