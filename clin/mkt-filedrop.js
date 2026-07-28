function () {
    showWidget({
        wid: 'html',
        data: `
            Upload a file with columns containing temperature values.  The mkt is calculated and a new file is downloaded with MKT value appended to the bottom of each column
            <hr>
            <B> Use °C</B>
        `

    })
    showWidget({
        wid: 'data-drop',
        data: {
            onDropFunction: createIonFunction(() => {

            })
        }
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
