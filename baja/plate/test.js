function (libid) {

    exec('baja/plate/layout.js', libid).then(async (Plate) => {
        let stock = new Plate(12, 8);
        let stockPlate = await stock.createPlateComponent(500, 300);
        let graph = new Plate(12, 8);
        let plateComponent = await graph.createPlateComponent(500, 300);

        let synthesis = new Plate(12, 8);
        let synthesisPlate = await synthesis.createPlateComponent(500, 300);

        let qc = new Plate(12, 8);
        let qcPlate = await qc.createPlateComponent(500, 300);

        await showWidget({
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '40%',
                            'title': 'Synthesis stock plate',
                            'component': synthesisPlate
                        },
                        {
                            width: '10%',
                            'component': {
                                wid: 'html',
                                data: `<img src="/assets/img/icons/png/arrow-circle-right-8x.png">`
                            }
                        },
                        {
                            'title': 'QC Plate',
                            'width': '40%',
                            'body': ``,
                            'component': qcPlate
                        }
                    ],

                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'html',
                                data: `<ceneter><img src="/assets/img/icons/png/arrow-circle-bottom-8x.png"></center>`
                            }
                        }
                    ]

                ]
            }
        })

        await showWidget({
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '40%',
                            'title': 'Standard Screen (2x replicates)',
                            'component': stockPlate
                        },
                        {
                            width: '10%',
                            'component': {
                                wid: 'html',
                                data: `<img src="/assets/img/icons/png/arrow-circle-right-8x.png">`
                            }
                        },
                        {
                            'title': 'Dose response (2x replicates)',
                            'width': '40%',
                            'body': ``,
                            'component': plateComponent
                        }
                    ]]
            }
        })

        let path = 'kras/dose-response.xlsx'
        let sheet = 'plate-results'
        let range = 'A1:F33'

        exec('baja/lib/db.js').then(async (db) => {
            db.loadSheet(path, sheet, range).then(dresponse => {
                let values = dresponse['values']

                let i = 0;
                let j = 0;
                let index = [];
                let t = []
                let header = [];
                for (let row of values) {
                    if (i == 0) {
                        header = row;
                    } else {
                        let obj = {};
                        for (let j = 0; j < row.length; j++) {
                            obj[header[j]] = row[j];
                        }
                        index.push(obj);
                    }
                    i++;
                }
                showWidget({
                    wid: 'd3',
                    data: {
                        width: 1200,
                        height: 500,
                        values: index,
                        drawIonFunction: createIonFunction((data, d3, svg, width, height) => {

                            let subgroups = Object.keys(data[0]);
                            subgroups = subgroups.filter(item => item !== 'compound')

                            var groups = d3.map(data, function (d) { return (d.compound) }).keys()

                            var x = d3.scaleBand()
                                .domain(groups)
                                .range([0, width])
                                .padding([0.2])
                            svg.append("g")
                                .attr("transform", "translate(0," + height + ")")
                                .call(d3.axisBottom(x).tickSize(0))
                                .selectAll("text")
                                .attr("y", 0)
                                .attr("x", 9)
                                .attr("transform", "rotate(45)")

                            var y = d3.scaleLinear()
                                .domain([0, 120])
                                .range([height, 0]);
                            svg.append("g")
                                .call(d3.axisLeft(y));

                            var xSubgroup = d3.scaleBand()
                                .domain(subgroups)
                                .range([0, x.bandwidth()])
                                .padding([0.05])

                            var color = d3.scaleOrdinal()
                                .domain(subgroups)
                                .range(['#e41a1c', '#377eb8', '#4daf4a'])

                            svg.append("g")
                                .selectAll("g")

                                .data(data)
                                .enter()
                                .append("g")
                                .attr("transform", function (d) { return "translate(" + x(d.compound) + ",0)"; })
                                .selectAll("rect")
                                .data(function (d) { return subgroups.map(function (key) { return { key: key, value: d[key] }; }); })
                                .enter().append("rect")
                                .attr("x", function (d) { return xSubgroup(d.key); })
                                .attr("y", function (d) { return y(d.value); })
                                .attr("width", xSubgroup.bandwidth())
                                .attr("height", function (d) { return height - y(d.value); })
                                .attr("fill", function (d) { return color(d.key); });

                        })
                    }
                })

            })
        })

        let range_plate = 'G1:H98'
        let db = await exec('baja/lib/db.js');
        let ds = await db.loadSheet(path, sheet, range_plate);
        let values = ds['values']

        let min = -0.02;
        let max = 0.145;
        graph.setData(values, min, max);
        synthesis.setData ( values, 0.14, 0.151)
        qc.setData ( values, 0.7, 0.97)

        range_plate = 'A1:B163'
        sheet = 'standard-screen'
        db = await exec('baja/lib/db.js');
        ds = await db.loadSheet(path, sheet, range_plate);
        values = ds['values']
        min = 0;
        max = 110;
        stock.setData(values, min, max);

        setInterval(async () => {
            await synthesis.drawPlate();
            await qc.drawPlate();
            await graph.drawPlate();
            await stock.drawPlate();
        }, 1500)

    })

}
