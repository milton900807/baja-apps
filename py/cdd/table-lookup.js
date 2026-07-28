exec ( 'py/cdd/table-lookup.py').then ( res => {

    showWidget ( {
        wid:'json',
        data:JSON.stringify ( res )
    })

})
