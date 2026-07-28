function () {

    return new Promise(async (resolve, reject) => {
        let host_ = window['env']['apiUrl']
        window.history.replaceState(
            {  },
            '',
            `/app/baja/news`
        );
        showWidget({
            wid: 'news-letter',
            data: {
                referenceURL: `${host_}/internal-news-links`
            }
        })

    })
}
