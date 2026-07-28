function () {

    showWidget({
        wid: 'html',
        data: `
            The following data is a sample list of temperatures (C) to calculate the MKT.  If there are multiple locations I can have users upload an excel doc or just copy multiple columns into the text box.
            <hr>
            <B> Sample  (°C)</B>
        `

    })

    let sample = `
    20.2
    21.23
    20.3
    19.23
    19.9
    20.62
    21.2
    19.2
`

    showWidget({
        wid: 'data-drop',
        data: {
            onDropFunction: createIonFunction(() => {

                log ( ' hello world ')

            })
        }
    })

    showWidget({
        wid: 'text-editor',
        data: sample

    }).then(editor => {

        showWidget({
            wid: 'button',
            data: {
                label: 'Calculate MKT',
                ionfunction: createIonFunction(() => {

                    let data = editor.getData();
                    data = data.trim()
                    let split = data.split('\n')

                    let temperatures = []
                    for (let s of split) {
                        if (!isNaN(s)) {
                            temperatures.push(+s.trim())
                        }
                    }
                    calculate(temperatures)
                }),
                disableAfterClick: false

            }
        })

    })

    let calculate = (tlist) => {

        let n = tlist.length;
        let elist = []
        let esum = 0;
        for (let t of tlist) {
            let ta = -(10000 / (t + 273.1));

            let e = Math.exp(ta);
            elist.push(e)
            esum += e;
        }

        let result = Math.log((esum) / n);

        let mkt = ((-10000 / result) - 273.1);
        log(mkt.toPrecision(3))
    };
}
