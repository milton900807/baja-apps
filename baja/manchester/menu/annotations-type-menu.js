function (graph, genegraph_panel_layout, annotations, selectedTrack) {

    let mml = [
        {
            label: 'Annotation type',
            click: async () => {

                let ch = []

                const types = [...new Set(
                    annotations
                        .map(a => a.type)
                        .filter(t => t != null)
                )]

                for (let type of types) {
                    ch.push({
                        label: type,
                        click: () => {

                            const annotationsOfType = annotations.filter(a => a?.type === type)

                            graph.showSideMenu([
                                {
                                    label: 'View',
                                    click: () => {
                                        if (selectedTrack.setSelectedAnnotations) {
                                            selectedTrack.setSelectedAnnotations(annotationsOfType)
                                        }
                                    }
                                },
                                {
                                    label: 'Copy',
                                    click: async () => {
                                        const json = JSON.stringify(annotationsOfType, null, 2)
                                        if (navigator.clipboard?.writeText) {
                                            await navigator.clipboard.writeText(json)
                                        }
                                    }
                                },
                                {
                                    label: 'Remove',
                                    click: () => {
                                        if (selectedTrack.removeAnnotations) {
                                            selectedTrack.removeAnnotations(annotationsOfType)
                                        } else if (selectedTrack.removeAnnotation) {
                                            for (const a of annotationsOfType) {
                                                selectedTrack.removeAnnotation(a)
                                            }
                                        }
                                        graph.render?.()
                                    }
                                }
                            ])
                        }
                    })
                }
                graph.showSideMenu(ch)

            }
        },
        {
            label: 'New Annotation',
            click: () => {

            }
        }
    ]
    return mml;

}
