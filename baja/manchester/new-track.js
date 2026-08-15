function (graph, genegraph_panel_layout) {

    let v;

    let export_sequence = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'title': 'Name',
                        'width': '100%',
                        'component': {
                            wid: 'input-textfield',
                            data: {
                                'show-button': false,
                                'title': 'ID',
                                'ionHookFunction': createIonFunction((input_box) => {
                                    v = input_box;
                                })
                            }
                        }
                    },
                    {
                        'title': 'Sequence',
                        'width': '100%',

                        'component': {
                            wid: 'input-textarea-editor',
                            data: {
                                'height': '400px',
                                'showButton': false,
                                'text': '',
                                'ionHookFunction': createIonFunction((input_box) => {
                                    build = input_box;
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
                                        label: 'Create track', ionFunction: createIonFunction(async () => {
                                            let { Track, TrackRef } = await exec('baja/bio/track.js')

                                            let name = v.getWidgetValue();
                                            let text = build.getWidgetValue();
                                            const dnaRegex = /[^ATCG]/g;
                                            text = text.replace(dnaRegex, '');
                                            let track = new Track(name, 0, text.length, graph.nextTrackY(), 1)

                                            track.sequence = text;
                                            graph.track.push(track);
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
        }
    }

    CurrentLayout.clearComponent('mainPanel')
    CurrentLayout.setComponent('mainPanel', export_sequence);

}
