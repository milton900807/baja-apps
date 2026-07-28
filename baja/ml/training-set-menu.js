function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let Annotation = await exec('flexigraph/annotation.js')

        let seq_length = 500
        let predict_length = 500;

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'grid': {
                    xmin: 0,
                    xmax: 6,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 10,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Train-Track', ionFunction: createIonFunction(async () => {

                            let va = await prompt("Sequence window", ["Window"], { "Window": seq_length }, 300, 300)
                            let m = va['Window']
                            if (m === null) {
                                seq_length = 720
                            } else {
                                seq_length = parseInt(m);
                            }

                            function findMaxValues(scatterDataTrain, scatterDataTest) {
                                let maxX = -Infinity;
                                let maxY = -Infinity;

                                function updateMaxValues(points) {
                                    points.forEach(point => {
                                        if (point.x > maxX) {
                                            maxX = point.x;
                                        }
                                        if (point.y > maxY) {
                                            maxY = point.y;
                                        }
                                    });
                                }

                                updateMaxValues(scatterDataTrain.points);
                                updateMaxValues(scatterDataTest.points);

                                return { maxX, maxY };
                            }
                            function findMinValues(scatterDataTrain, scatterDataTest) {
                                let minX = Infinity;
                                let minY = Infinity;

                                function updateMinValues(points) {
                                    points.forEach(point => {
                                        if (point.x < minX) {
                                            minX = point.x;
                                        }
                                        if (point.y < minY) {
                                            minY = point.y;
                                        }
                                    });
                                }

                                updateMinValues(scatterDataTrain.points);
                                updateMinValues(scatterDataTest.points);

                                return { minX, minY };
                            }

                            let MPlot = await exec('flexigraph/plot.js')
                            function plotLearningCurve(learningCurveData, graph, x, y) {

                                console.log('debubg');
                                if (!learningCurveData || !learningCurveData.train_sizes)
                                    return;
                                const trainSizes = learningCurveData.train_sizes;
                                const trainScoresMean = learningCurveData.train_scores_mean;
                                const testScoresMean = learningCurveData.test_scores_mean;

                                let scatterDataTrain = {
                                    points: trainSizes.map((size, i) => ({
                                        x: size,
                                        y: trainScoresMean[i],
                                        name: `Train: ${size}`
                                    }))
                                };

                                let scatterDataTest = {
                                    points: trainSizes.map((size, i) => ({
                                        x: size,
                                        y: testScoresMean[i],
                                        name: `Test: ${size}`
                                    }))
                                };

                                let { maxX, maxY } = findMaxValues(scatterDataTrain, scatterDataTest)
                                let { minX, minY } = findMinValues(scatterDataTrain, scatterDataTest)

                                let trainPlot = new MPlot(scatterDataTrain);
                                trainPlot.name = "Training (black) & Validation (Yellow) ";
                                let testPlot = new MPlot(scatterDataTest);
                                trainPlot.mode = 'line'
                                testPlot.mode = 'line'
                                testPlot.name = "";
                                let plot_length = graph.worldWidth(250);
                                trainPlot.w = plot_length;
                                testPlot.w = plot_length;
                                trainPlot.h = plot_length;
                                testPlot.h = plot_length;
                                testPlot.fitScaleToData = false;
                                trainPlot.fitScaleToData = false;
                                testPlot.lineColor = 'yellow'
                                trainPlot.lineColor = 'black'

                                trainPlot.x = x;
                                testPlot.x = x;
                                trainPlot.y = y;
                                testPlot.y = y;

                                testPlot.setxmax(maxX)
                                testPlot.setymax(maxY)
                                testPlot.setymin(minY)
                                testPlot.setxmin(minX)

                                trainPlot.setxmax(maxX)
                                trainPlot.setymax(maxY)
                                trainPlot.setymin(minY)
                                trainPlot.setxmin(minX)

                                graph.plots = []
                                graph.plots.push(trainPlot)
                                graph.plots.push(testPlot)
                            }

                            graph.clearMouseListeners();
                            let rlist = []
                            graph.setMouseMode('navigate')
                            for (let track of graph.track) {
                                if (track.markstart >= 0 && track.markend > track.markstart) {
                                    const gxi = track.markstart;
                                    const gxf = track.markend;
                                    for (let start = gxi; start < gxf; start += seq_length) {
                                        let end = Math.min(start + seq_length, gxf);
                                        let currentLayer = {};
                                        let tl = track.track_layers;
                                        for (let tlayer of tl) {
                                            let p = tlayer.polygonpts;
                                            if (p) {
                                                let filtered_points = p.filter(point => point.x >= start && point.x <= end);
                                                if (filtered_points.length > 0) {
                                                    currentLayer[tlayer.name] = filtered_points;
                                                }
                                            }
                                        }
                                        let reference_polygon = track.getAnnotations('Exon');
                                        let ref = [];

                                        for (let r of reference_polygon) {

                                            if (r.xf >= start && r.xi <= end) {

                                                let overlap_xi = Math.max(start, r.xi);
                                                let overlap_xf = Math.min(end, r.xf);

                                                ref.push({ name: r.name, xi: overlap_xi, xf: overlap_xf });
                                            } else
                                                if (r.xi >= start && r.xi < end) {

                                                    let overlap_xi = Math.max(start, r.xi);
                                                    let overlap_xf = Math.min(end, r.xf);

                                                    ref.push({ name: r.name, xi: overlap_xi, xf: overlap_xf });
                                                } else
                                                    if (r.xf >= start && r.xf < end) {

                                                        let overlap_xi = Math.max(start, r.xi);
                                                        let overlap_xf = Math.min(end, r.xf);

                                                        ref.push({ name: r.name, xi: overlap_xi, xf: overlap_xf });
                                                    }

                                        }
                                        let sequence = track.getSequenceRange(start, end)
                                        track.highlightstart = start;
                                        track.highlightend = end;
                                        if (sequence.length === seq_length && Object.keys(currentLayer).length > 0) {

                                            let em = new EngineMonitor((v) => {
                                            });

                                            const dbhost = window["env"]["db"];
                                            if (!dbhost) {
                                                alert(" feature not available since we do not have a database installed in this instance.")
                                                return;
                                            }

                                            let r = await exec('py/baja/ml/polygonseqtrain.py', em, currentLayer, ref, sequence, getUser(), 'models', dbhost);
                                            console.log('debubg');
                                            if (r.features && r.features.learning_curve) {
                                                plotLearningCurve(r.features.learning_curve, graph, track.tgraph.X(start), track.tgraph.yi - 1)
                                                rlist.push(r)
                                            } else if (r.learning_curve) {
                                                plotLearningCurve(r.learning_curve, graph, track.tgraph.X(start), track.tgraph.yi - 1)
                                                rlist.push(r)

                                            }
                                        }
                                    }
                                }
                            }

                        })
                    },
                    {
                        x: 1, y: 0, label: 'Predict...', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate');
                            let rlist = []

                            let va = await prompt("Sequence window", ["Window"], { "Window": seq_length }, 300, 300)
                            let m = va['Window']
                            if (m === null) {
                                predict_length = 720
                            } else {
                                predict_length = parseInt(m);
                            }

                            let parseResultsToAnnotations = (results, track) => {
                                let annotations = [];
                                console.log('debubg');
                                results.forEach(point => {
                                    if (point.label === 1) {
                                        const strand = track.strand;
                                        const annotation = new Annotation(
                                            "Exon",
                                            "" + point.y.toString(),
                                            point.x,
                                            point.x + 1,
                                            strand);

                                        annotations.push(annotation);
                                    }
                                });
                                return annotations;
                            }

                            for (let track of graph.track) {
                                if (track.markstart >= 0 && track.markend > track.markstart) {
                                    const gxi = track.markstart;
                                    const gxf = track.markend;

                                    for (let start = gxi; start < gxf; start += predict_length) {
                                        let end = Math.min(start + predict_length, gxf);
                                        let currentLayer = {};
                                        let tl = track.track_layers;

                                        for (let tlayer of tl) {
                                            let p = tlayer.polygonpts;
                                            if (p) {
                                                let filtered_points = p.filter(point => point.x >= start && point.x <= end);
                                                if (filtered_points.length > 0) {
                                                    currentLayer[tlayer.name] = filtered_points;
                                                }
                                            }
                                        }

                                        let sequence = track.getSequenceRange(start, end)
                                        track.highlightstart = start;
                                        track.highlightend = end;

                                        if (sequence.length === predict_length) {
                                            let em = new EngineMonitor((v) => { });
                                            const dbhost = window["env"]["db"];
                                            if (!dbhost) {
                                                alert(" feature not available since we do not have a database installed in this instance.")
                                                return;
                                            }
                                            if (sequence && sequence.length === predict_length && Object.keys(currentLayer).length > 0) {
                                                let r = await exec('py/baja/ml/polypredict-model.py', em, currentLayer, sequence + '', getUser(), 'models', dbhost);
                                                let an = parseResultsToAnnotations(r, track);
                                                if (an) {
                                                    graph.setMessage('Adding ' + an.length + ' annotations ')
                                                    for (let a of an)
                                                        track.add(a);
                                                }

                                                rlist.push(r)
                                            }
                                        }
                                    }
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
                                                    data: '<hr>'
                                                }
                                            },
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'json',
                                                    data: JSON.stringify(rlist)
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
                                                                label: 'Close',
                                                                ionFunction: createIonFunction(() => {
                                                                    CurrentLayout.clearComponent('mainPanel');
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]
                                    ]
                                }
                            };

                            CurrentLayout.clearComponent('mainPanel');
                            CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                        })
                    },
                    {
                        x: 2, y: 0, label: 'View model', ionFunction: createIonFunction(async () => {

                            CurrentLayout.clearComponent('mainPanel')

                            let uploadFile = async (file) => {
                                if (!file) {
                                    alert('Please select a file before uploading.');
                                    return;
                                }
                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('user', getUser());
                                formData.append('type', 'model');
                                let host_ = window['env']['apiUrl']
                                fetch(host_ + '/upload', {
                                    method: 'POST',
                                    body: formData
                                })
                                    .then(async response => response.json())
                                    .then(async response => {
                                        if (response['success']) {

                                            let load = response['success'][0]
                                            let folder = response['folder']

                                            let em = new EngineMonitor ( () => {} )
                                            let r = await exec ('py/db/upload-model-into-db.py', em, load, folder, 'localhost')
                                            showModal ( {

                                                wid:'json',
                                                data:JSON.stringify ( r )

                                            })

                                        }

                                    })
                                    .catch(error => {
                                        console.error('Error:', error);
                                        alert('An error occurred while uploading the file.');
                                    });
                            }

                            let progressBar;

                            let dbhost = window['env']['db']

                            let em = new EngineMonitor((v) => { });
                            let r = await exec('py/baja/ml/polypredict-db-stats.py', em, getUser(), 'models', dbhost);
                            CurrentLayout.clearComponent('mainPanel');
                            let jsonPanel;
                            let jdescHook = createIonFunction((p) => {
                                jsonPanel = p;
                            });
                            let file_drop_object = null;
                            let design_params_panel_layout = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'html',
                                                    data: '<hr> '
                                                }
                                            },
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'json',
                                                    refCallback: jdescHook,

                                                    data: JSON.stringify(r)
                                                }
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

                                                            let w = {
                                                                wid: 'progress',
                                                                componentRef: 'progressBar',
                                                                data: {
                                                                    'progress': 10,
                                                                    'progressBar': createIonFunction((progessBar) => {
                                                                        progressBar = progessBar;
                                                                    })
                                                                }
                                                            }
                                                            uploadFile(file)

                                                            CurrentLayout.clearComponent('progress_panel')
                                                            CurrentLayout.setComponent('progress_panel', w);
                                                        })
                                                    }
                                                }
                                            },

                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                })
                                                            },
                                                            {
                                                                label: 'Reset model', ionFunction: createIonFunction(async () => {

                                                                    let confirm = await exec('baja/lib/confirm.js', 'Reset the model?????', async () => {

                                                                        const dbhost = window["env"]["db"];
                                                                        if (!dbhost) {
                                                                            alert(" feature not available since we do not have a database installed in this instance.")
                                                                            return;
                                                                        }

                                                                        await exec('py/db/create-training-set-schema.py', getUser(), dbhost)
                                                                    })
                                                                    showModal(confirm)

                                                                })
                                                            },
                                                            {
                                                                label: 'Download model', ionFunction: createIonFunction(async () => {
                                                                    let confirm = await exec('baja/lib/confirm.js', 'Download the model?', async () => {
                                                                        const dbhost = window["env"]["db"];
                                                                        if (!dbhost) {
                                                                            alert(" feature not available since we do not have a database installed in this instance.")
                                                                            return;
                                                                        }

                                                                        showWidget({
                                                                            'wid': 'html',
                                                                            'data': ` Compressing model... `
                                                                        })

                                                                        let rs = await exec('py/db/fetch-model.py', getUser(), dbhost)

                                                                        if (rs.url) {

                                                                            showWidget({
                                                                                'wid': 'html',
                                                                                'data': ` Downloading... `
                                                                            })

                                                                            let ap = window['env']['apiUrl'] + '/download'
                                                                            const url = ap + '?path=' + rs.url;
                                                                            const a = document.createElement('a');
                                                                            a.setAttribute('hidden', '');
                                                                            a.setAttribute('href', url);
                                                                            a.setAttribute('download', 'download.json');
                                                                            document.body.appendChild(a);
                                                                            a.click();
                                                                            document.body.removeChild(a);

                                                                            showWidget({
                                                                                'wid': 'html',
                                                                                'data': ` Download complete. `
                                                                            })

                                                                        }

                                                                    })
                                                                    showModal(confirm)

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
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                        }),
                    },
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel')
        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
        CurrentLayout.clearComponent('buttonMenuPanel')
        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

        resolve({})

    })

}
