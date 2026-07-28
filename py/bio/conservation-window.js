function () {
    exec ('py/bio/conservation-window.py', 'AGCTGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG', 5).then ( r => {
        showWidget ( {
            wid:'json',
            data:JSON.stringify ( r )
        })
    })

}
