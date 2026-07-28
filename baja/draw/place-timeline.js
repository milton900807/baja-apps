function (platetrack, type, type_path, _name) {

    return new Promise(async (resolve, reject) => {
        const Plot = await exec('flexigraph/plot');
        let start_date = null;
        let end_date = null;

        m = _name;
        const load_file = async (path, name) => {
            let jsonobj = {
                'spath': path,
                'rule_name': name,
                'user': getUser(),
                'type': 'ljp'
            };
            let host_ = window['env']['apiUrl'];
            let rs = await POSTJSON(jsonobj, host_ + '/get-script');
            return rs;
        };
        if (_name && type_path) {
            if (type_path === _name) {
                type_path = ''
            }
            const lf = await load_file(type_path, _name)
            if (lf && lf.rule_value) {
                const ts = __decompress(lf.rule_value);
                const pl = Plot.fromJSON(ts)
                pl.uid = uuid();

                if (pl.config_script.set_time_on_init) {
                    let main_layout = {
                        wid: 'card',
                        height: '100%',
                        componentRef: 'mainPanel',
                        data: {
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'html', data: `

                                                You may use the default values for timeline templates or you may define your own start time and/or stop time.  Be aware that for template timeranges if you define your
                                                own stop and the total time range is shorter than the template timerange some timeline points may not now up on the timeline (i.e. they are defined after your end point).

                                            `

                                        }
                                    },

                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [

                                                    {
                                                        label: 'Use default date range', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                            setTimeout(() => {
                                                                CurrentLayout.reset('mainPanel')
                                                            }, 300)
                                                        })
                                                    },
                                                    {
                                                        label: 'Set my own date range', ionFunction: createIonFunction(async () => {
                                                            let setTimeRange = {
                                                                wid: 'card',
                                                                height: '100%',
                                                                data: {
                                                                    cards: [[
                                                                        {
                                                                            'width': '100%',
                                                                            'height': '100vh',
                                                                            'component': {
                                                                                wid: 'html',
                                                                                data: `<hr> Start date `
                                                                            }
                                                                        },

                                                                        {
                                                                            'width': '100%',
                                                                            'height': '100vh',
                                                                            'component': {
                                                                                wid: 'calendar-chooser',
                                                                                data: {
                                                                                    select: createIonFunction((_date) => {
                                                                                        start_date = _date;
                                                                                    })
                                                                                }
                                                                            }
                                                                        },
                                                                        {
                                                                            'width': '100%',
                                                                            'height': '100vh',
                                                                            'component': {
                                                                                wid: 'html',
                                                                                data: `<hr> End date `
                                                                            }
                                                                        },
                                                                        {
                                                                            'width': '100%',
                                                                            'height': '100vh',
                                                                            'component': {
                                                                                wid: 'calendar-chooser',
                                                                                data: {
                                                                                    select: createIonFunction((_date) => {
                                                                                        end_date = _date;
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
                                                                                            label: 'Apply', ionFunction: createIonFunction(() => {
                                                                                                hideAllModal();
                                                                                                setTimeout(() => {
                                                                                                    CurrentLayout.reset('mainPanel')
                                                                                                }, 300)
                                                                                                let plot = pl;

                                                                                                plot.setWidth(plot.grid.worldWidth(800))
                                                                                                plot.setHeight(plot.grid.worldHeight(400))

                                                                                                console.log('debubg');

                                                                                                const spanMs = end_date - start_date;
                                                                                                const spanHours = spanMs / (1000 * 60 * 60);
                                                                                                const numberOfPoints = 2;
                                                                                                const dataPoints = [];
                                                                                                const scatterData = { points: dataPoints };

                                                                                                const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
                                                                                                const formattedDate = start_date.toLocaleDateString('en-US', options);
                                                                                                const formattedDate2 = end_date.toLocaleDateString('en-US', options);

                                                                                                let i = 0;
                                                                                                let fraction = i / (numberOfPoints - 1);
                                                                                                let pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                                                                let xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                                                                let y = 0.1;

                                                                                                const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                                                                const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
                                                                                                dataPoints.push({ x: xHours, y, name: formattedDate3 });
                                                                                                i = 1;

                                                                                                fraction = i / (numberOfPoints - 1);
                                                                                                pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                                                                xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                                                                y = 0.1;
                                                                                                const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                                                                const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
                                                                                                dataPoints.push({ x: xHours, y, name: formattedDate4 });
                                                                                                plot.startDate = (start_date);
                                                                                                plot.endDate = (end_date);
                                                                                                plot.type = 'timeline'
                                                                                                const xMin = Math.min(...scatterData.points.map(p => p.x));
                                                                                                const xMax = Math.max(...scatterData.points.map(p => p.x));
                                                                                                plot.grid.zoom(xMin, xMax, 0, 1);

                                                                                                plot.name = formattedDate + ' - ' + formattedDate2;
                                                                                                plot.x_axis_label = "Time (Years)";
                                                                                                plot.y_axis_label = "Sample Metric";
                                                                                                plot.fitScaleToData = false;
                                                                                                plot.grid.rescale();
                                                                                                setTimeout(async () => {
                                                                                                    if (plot)
                                                                                                        await pm.plateTrack.zoomintoplot(plot)
                                                                                                }, 299)

                                                                                                setTimeout(() => {
                                                                                                    CurrentLayout.reset('mainPanel')
                                                                                                }, 300)

                                                                                            })
                                                                                        }, {
                                                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                                                hideAllModal();
                                                                                                setTimeout(() => {
                                                                                                    CurrentLayout.reset('mainPanel')
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

                                                            CurrentLayout.setComponent('mainPanel', setTimeRange)

                                                        })
                                                    },
                                                    {
                                                        label: 'Set start date only', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                            let setTimeRange = {
                                                                wid: 'card',
                                                                height: '100%',
                                                                data: {
                                                                    cards: [[
                                                                        {
                                                                            'width': '100%',
                                                                            'height': '100vh',
                                                                            'component': {
                                                                                wid: 'html',
                                                                                data: `<hr> Start date `
                                                                            }
                                                                        },

                                                                        {
                                                                            'width': '100%',
                                                                            'height': '100vh',
                                                                            'component': {
                                                                                wid: 'calendar-chooser',
                                                                                data: {
                                                                                    select: createIonFunction((_date) => {
                                                                                        start_date = _date;
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
                                                                                            label: 'Apply', ionFunction: createIonFunction(() => {
                                                                                                hideAllModal();
                                                                                                let plot = pl;

                                                                                                const spanMs = plot.endDate-plot.startDate;
                                                                                                const spanHours = spanMs / (1000 * 60 * 60);
                                                                                                end_date = new Date(start_date + spanMs)

                                                                                                const numberOfPoints = 2;
                                                                                                const dataPoints = [];
                                                                                                const scatterData = { points: dataPoints };
                                                                                                const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
                                                                                                const formattedDate = start_date.toLocaleDateString('en-US', options);
                                                                                                const formattedDate2 = end_date.toLocaleDateString('en-US', options);
                                                                                                let i = 0;
                                                                                                let fraction = i / (numberOfPoints - 1);
                                                                                                let pointTime = new Date(start_date.getTime() + fraction * spanMs);

                                                                                                let xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                                                                let y = 0.1;

                                                                                                const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                                                                const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
                                                                                                dataPoints.push({ x: xHours, y, name: formattedDate3 });
                                                                                                i = 1;

                                                                                                fraction = i / (numberOfPoints - 1);
                                                                                                pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                                                                xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                                                                y = 0.1;
                                                                                                const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                                                                const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
                                                                                                dataPoints.push({ x: xHours, y, name: formattedDate4 });
                                                                                                plot.startDate = (start_date);
                                                                                                plot.endDate = (end_date);
                                                                                                plot.type = 'timeline'
                                                                                                const xMin = Math.min(...scatterData.points.map(p => p.x));
                                                                                                const xMax = Math.max(...scatterData.points.map(p => p.x));
                                                                                                plot.grid.zoom(xMin, xMax, 0, 1);

                                                                                                plot.setWidth(platetrack.grid.worldWidth(800))
                                                                                                plot.setHeight(platetrack.grid.worldHeight(400))

                                                                                                plot.name = formattedDate + ' - ' + formattedDate2;
                                                                                                plot.x_axis_label = "Time (Years)";
                                                                                                plot.y_axis_label = "Sample Metric";
                                                                                                plot.fitScaleToData = false;
                                                                                                plot.grid.rescale();
                                                                                                setTimeout(async () => {
                                                                                                    if (plot)
                                                                                                        await pm.plateTrack.zoomintoplot(plot)
                                                                                                }, 299)

                                                                                                setTimeout(() => {
                                                                                                    CurrentLayout.reset('mainPanel')
                                                                                                }, 300)

                                                                                            })
                                                                                        }, {
                                                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                                                hideAllModal();
                                                                                                setTimeout(() => {
                                                                                                    CurrentLayout.reset('mainPanel')
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

                                                            CurrentLayout.setComponent('mainPanel', setTimeRange)

                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }

                                ]]
                        }
                    }

                    CurrentLayout.setComponent('mainPanel', main_layout)

                }
                pl.setWidth(pl.grid.worldWidth(800))
                pl.setHeight(pl.grid.worldHeight(440))

                pl.name = m;

                setTimeout(async () => {
                    await platetrack.setPlotCenter(pl)
                    await platetrack.zoomintoplot(pl)
                }, 100)
            }
        } else {
            let main_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'height': '100vh',
                                'component': {
                                    wid: 'html',
                                    data: `<hr> Start date `
                                }
                            },

                            {
                                'width': '100%',
                                'height': '100vh',
                                'component': {
                                    wid: 'calendar-chooser',
                                    data: {
                                        select: createIonFunction((_date) => {

                                            start_date = _date;
                                        })
                                    }
                                }
                            },
                            {
                                'width': '100%',
                                'height': '100vh',
                                'component': {
                                    wid: 'html',
                                    data: `<hr> End date `
                                }
                            },
                            {
                                'width': '100%',
                                'height': '100vh',
                                'component': {
                                    wid: 'calendar-chooser',
                                    data: {
                                        select: createIonFunction((_date) => {
                                            end_date = _date;
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
                                                label: 'Yes', ionFunction: createIonFunction(async () => {

                                                    hideAllModal();

                                                    setTimeout(() => {
                                                        CurrentLayout.reset('mainPanel')
                                                    }, 300)

                                                    const MPlot = await exec('flexigraph/plot')
                                                    const spanMs = end_date - start_date;
                                                    const spanHours = spanMs / (1000 * 60 * 60);
                                                    const numberOfPoints = 2;
                                                    const dataPoints = [];
                                                    const scatterData = { points: dataPoints };

                                                    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
                                                    const formattedDate = start_date.toLocaleDateString('en-US', options);
                                                    const formattedDate2 = end_date.toLocaleDateString('en-US', options);

                                                    let i = 0;
                                                    let fraction = i / (numberOfPoints - 1);
                                                    let pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                    let xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                    let y = 0.1;

                                                    const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                    const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
                                                    dataPoints.push({ x: xHours, y, name: formattedDate3 });
                                                    i = 1;

                                                    fraction = i / (numberOfPoints - 1);
                                                    pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                    xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                    y = 0.1;
                                                    const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                    const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
                                                    dataPoints.push({ x: xHours, y, name: formattedDate4 });
                                                    const plot = new MPlot(scatterData);
                                                    plot.uid = uuid();
                                                    plot.startDate = (start_date);
                                                    plot.endDate = (end_date);
                                                    plot.type = 'timeline'

                                                    const xMin = Math.min(...scatterData.points.map(p => p.x));
                                                    const xMax = Math.max(...scatterData.points.map(p => p.x));
                                                    plot.grid.zoom(xMin, xMax, 0, 1);

                                                    plot.name = formattedDate + ' - ' + formattedDate2;
                                                    plot.x_axis_label = "Time (Years)";
                                                    plot.y_axis_label = "Sample Metric";
                                                    plot.fitScaleToData = false;
                                                    plot.x = pm.plateTrack.grid.Xwc(hd.startX);
                                                    plot.y = pm.plateTrack.grid.Ywc(hd.startY);
                                                    plot.setWidth(pm.plateTrack.grid.worldWidth(400))
                                                    plot.setHeight(pm.plateTrack.grid.worldHeight(200))
                                                    plot.grid.rescale();
                                                    pm.plateTrack.m_plots.push(plot)
                                                    setTimeout( async () => {
                                                        if (plot)
                                                            await pm.plateTrack.zoomintoplot(plot)
                                                    }, 299)

                                                    hd.startX = null;
                                                    hd.startY = null;
                                                    hd.currentX = null;
                                                    hd.currentY = null;

                                                    pm.plateTrack.wb(null)

                                                    hd.startX = null;
                                                    hd.startY = null;
                                                    hd.currentX = null;
                                                    hd.currentY = null;

                                                    setTimeout(() => {

                                                        CurrentLayout.reset('mainPanel')

                                                    }, 300)

                                                })
                                            },
                                            {
                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                    hideAllModal();
                                                    hd.startX = null;
                                                    hd.startY = null;
                                                    hd.currentX = null;
                                                    hd.currentY = null;
                                                    pm.plateTrack.wb(null)

                                                    setTimeout(() => {
                                                        CurrentLayout.reset('mainPanel')
                                                    }, 300)

                                                })
                                            }
                                        ]
                                    }
                                }
                            }

                        ]]
                }
            }
            setTimeout(async () => {
                await platetrack.zoomintoplot(plot)

            }, 300)
        }
    })
}
