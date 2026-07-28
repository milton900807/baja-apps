function () {
    let annotatoin = 'NC_000012.12:c25250929-25205246'
    let position_coordinates = { xmax: 25250929, xmin: 25205246 }
    exec('flexigraph/genegraph.js').then(async (msgraph) => {
        msgraph.setxmax(25250929)
        msgraph.setxmin(25205246)
        msgraph.setymin(0);
        msgraph.setymax(2);
        await msgraph.setSize(1200, 400);
        for (let i = 25205246; i < 25250929; i++) {
            await msgraph.plot(i, 100 * Math.random());
        }
        let gff_editor = await exec('genome/gff3-editor', async (data) => {

            let spl = data.split('\n')
            let i = 1;
            msgraph.setymax ( spl.length + 1)
            for (let s of spl) {
                let t = s.split(/[ ,]+/)
                let start = t[3]
                let end = t[4]
                let annotation = t[2]
                let j = 6;
                let color = 'orange';
                msgraph.drawLine(+start, i, +end, i, color);
                i++
            }
        });
    })
}
