function () {



    let myfiles_button = [{
        label: 'Screening Editor',
        ionfunction: createIonFunction(async () => {
            await exec('manchester/editor', '', { mode: 'editor' })
        })
    }]
    myfiles_button.push({
        label: 'Chromosomes',
        ionfunction: createIonFunction(async () => {
            // The whole genome at one scale, smallest chromosome first. Drag down one to
            // pick a region; it zooms in the same world coordinates the editor uses.
            await exec('manchester/karyotype')
        })

    })
    myfiles_button.push({
        label: 'Simple Designer',
        ionfunction: createIonFunction(async () => {
            await exec('manchester/assay-design')
        })

    })
    myfiles_button.push({
        label: 'RNA-binding',
        ionfunction: createIonFunction(async () => {
            await exec('manchester/editor', '', { mode: 'editor' })
        })

    })
    myfiles_button.push({
        label: 'Protein analysis',
        ionfunction: createIonFunction(async () => {
            view = '' + getUser();
        })

    })
    myfiles_button.push({
        label: 'Sequence tools',
        ionfunction: createIonFunction(async () => {
            view = '' + getUser();
        })

    })


    // exec('cpd/baja-analytics', element.path, config, `/app/cpd/baja-analytics`)

    myfiles_button.push({
        label: 'Models',
        ionfunction: createIonFunction(async () => {
            view = '' + getUser();
            await exec('manchester/editor', path, { mode: 'editor' })
        })

    })

    myfiles_button.push({
        label: 'Project',
        ionfunction: createIonFunction(async () => {
            view = '' + getUser();

            let config = {
                silent: true,
                user: getUser(),
                mode: 'editor'
            }

            exec('cpd/baja-project', '', config, `/app/cpd/baja-project`)
        })
    })
    myfiles_button.push({
        label: 'Analytics',
        ionfunction: createIonFunction(async () => {
            view = '' + getUser();

            let config = {
                silent: true,
                user: getUser(),
                mode: 'editor'
            }

            exec('cpd/baja-analytics', '', config, `/app/cpd/baja-analytics`)
        })

    })

    return myfiles_button;


}