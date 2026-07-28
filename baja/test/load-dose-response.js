function () {
    exec('baja/lib/db.js').then(async (db) => {
        db.loadSheet('kras/dose-response.xlsx', 'plate-results', 'A1:F33').then(dresponse => {
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
}
