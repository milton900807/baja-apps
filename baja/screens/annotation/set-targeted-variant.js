function ( selectedTrack ) {
    return new Promise( async(resolve,reject) => {

        if (selectedTrack.snpindels.length > 0) {
            let [phase0snpIndels,phase1snpIndels] = await selectedTrack.phasesnpindels(1)
            let snpIndels = phase0snpIndels.concat(phase1snpIndels)
            console.log(snpIndels)
            snpIndels = snpIndels.map((i) =>
                            `${i.name}`+
                            `_${i.reference.length < 10 ? i.reference : i.reference.slice(10)+'...'}`+
                            `->${i.alternate.length < 10 ? i.alternate : i.alternate.slice(10)+'...'}`+
                            `_${i.phase == 1 ? '0|1' : '1|0'}`+
                            `  PHASESET=${i.phaseset ? i.phaseset : 'unphased'}`
                            )
            let ms = {
                wid: 'selection-list',
                data: {
                    title: 'Select targeted variant:',
                    single_selection: true,
                    button_label: 'Set target variant',
                    listItems: snpIndels,
                    button_function: createIonFunction( async(items) => {
                        console.log('debubg');
                        let phasetarget;
                        phasetarget = items[0].split(' ')[0].split('_').slice(-1)[0]

                        let phasesets = snpIndels.map(item => item.split(' ').slice(-1)[0]);

                        if ( phasesets.every(ps => ps == phasesets[0]) ) {
                            if ( phasetarget ) {
                                if (phasetarget == '1|0' || phasetarget.endsWith('|0')) {
                                    selectedTrack.targetPhase = -1;
                                } else if (phasetarget == '0|1' || phasetarget.startsWith('0|')) {
                                    selectedTrack.targetPhase = 1;
                                }
                                selectedTrack.targetVariant = items[0];
                            } else {
                                graph.setMessage('Variant not supported.')
                            }
                            hideAllModal();
                        } else {
                            alert('Phasing problem encountered. Examine VCF for unphased variants.')
                        }
                    })
                }

            }
            showModal(ms,600,600);
            } else {
                graph.setMessage('No variants available for phasing.')
            }
            resolve();
    })
}
