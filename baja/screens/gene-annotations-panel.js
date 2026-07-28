function (props) {

    let display_genome_annotations = {
        wid: 'html',
        data: `
                     <div class="alert alert-warning" role="alert">
                            These parameters are optional
                    </div>
            `
    }

    let ms = {
        wid: 'multi-select',
        height: '100px',
        data: {
            showButton: false,
            list: ['Mouse', 'Rat', 'NHP'], ionFunction: createIonFunction((action_item, value) => {

                props.crossReactive[action_item] = value;

            })
        }
    }
    let cross_reactive_card = {
        wid: 'card',
        data: {
            "style.padding-top": '10px',
            cards: [
                [

                    {
                        'width': '90%',
                        'component': {
                            wid: 'html',
                            data: `<hr>Cross-reactive options`
                        }
                    },
                    {

                        'width': '100%',
                        'component': ms,
                    }
                ]]
        }
    }

    let radio = {
        wid: 'radio-buttons',
        data: {
            buttons: [
                {
                    'label': 'Only exons', ionfunction: createIonFunction(() => {
                        props.gene_annotation_restriction = 'exons';
                    })
                },
                {
                    'label': 'Only introns', ionfunction: createIonFunction(() => {
                        props.gene_annotation_restriction = 'introns';

                    })
                },
                {
                    'label': 'Exon-exon junctions', ionfunction: createIonFunction(() => {
                        props.gene_annotation_restriction = 'exon-exon';

                    })
                },
                {
                    'label': 'Exon-Intron junctions', ionfunction: createIonFunction(() => {
                        props.gene_annotation_restriction = 'intron-intron';

                    })
                }
            ]
        }
    }

    let options = {
        wid: 'card',
        data: {
            padding: "10px",
            cards: [
                [
                    {
                        width: '100%',
                        component: display_genome_annotations
                    },

                    {
                        'width': '90%',
                        "style.padding-top": '2px',
                        'component': radio
                    },
                    {
                        'width': '100%',
                        'component': cross_reactive_card
                    }
                ]]
        }
    }
    return (options)

}
