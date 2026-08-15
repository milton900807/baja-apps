function (graph) {

    let v;
    let build = 'hg38';

    let export_sequence = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'title': 'ENSEMBL or NCBI Ids',
                        'width': '100%',
                        'component': {
                            wid: 'input-textarea-editor',
                            data: {
                                'showButton': false,
                                'title': 'ID',
                                'ionHookFunction': createIonFunction((input_box) => {
                                    v = input_box;
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
                                        label: 'Load', ionFunction: createIonFunction(async () => {

                                            let ct = v.getWidgetValue();

                                            if ( ct.indexOf ( '.')>0)
                                                ct = ct.substring (0, ct.indexOf ( '.'))

                                            if (ct.indexOf('\n') > 0) {
                                                let list = ct.split('\n');
                                                for (let l of list) {
                                                    if (l.trim().length > 0){
                                                        await graph.add(l, null, null, build.value)

                                                    }
                                                }
                                            }else {
                                                let l = ct.trim();
                                                await graph.add(l, null, null, build.value)

                                            }

                                            await exec('baja/manchester/menu/select-track-action.js', graph)

                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
        }
    }
    showModal(export_sequence)

}
