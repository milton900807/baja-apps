function (imageBuffer) {

    return new Promise((resolve, reject) => {

        Tesseract.recognize(imageBuffer, 'eng', {

        }).then(({ data: { text } }) => {
            let _text = text;

            showModal({
                wid: 'json',
                data: text
            })

        })
    })
}
