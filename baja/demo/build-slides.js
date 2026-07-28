exec('baja/demo/chapters.js').then( async chapters => {
    let chapterIndex = 0;
    let currentChapter;
    let slides = [];
    for (let chapter of chapters) {
        slides.push ( {
            title:chapter.title,
            type:"Chapter",
            path:chapter.path
        } )
        let cha = await exec(chapter.path)
        let bookmarks = cha.bookmarks;
        let bkeys = Object.keys ( bookmarks );
        for ( let bkey of bkeys ){
            slides.push ( {
                title:bkey,
                path:chapter.path,
                chapter_title:chapter.title,
                type:'Bookmark',
            })
        }

    }

    showWidget ( {
        wid:'json',
        data:JSON.stringify ( slides )
    })

})
