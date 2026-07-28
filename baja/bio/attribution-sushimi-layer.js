return new Promise(async (resolve, reject) => {
    let TrackLayer = await exec('baja/bio/track-layer.js');
    let Annotation = await exec('flexigraph/annotation.js')

    let AttributionSushimiLayer = class extends TrackLayer {
        acolor = "rgba(255, 100, 3, 0.9)";
        tcolor = "rgba(252, 123, 3, 0.3)";
        ccolor = "rgba(233, 3, 252, 0.3)";
        gcolor = "rgba(0, 0, 0, 0.4)";
        solid_color = "rgba(0, 0, 0, 0.1)";
        constitutive_site;
        angles = []
        skip = 0;
        window = 100;

        orfhash;
        arc_type = 'AttributionSushimiLayer'

        constructor(name, xmin, ymin, xmax, ymax, constitutive_site, skip, type) {
            super(name, xmin, ymin, xmax, ymax);
            this.type = 'AttributionSushimiLayer'
            this.constitutive_site = Math.floor(constitutive_site);
            console.log(" intial constituation site " + this.constitutive_site)
            this.skip = skip;
            this.arc_type = type;
        }

        static generateColorSets() {
            const baseColors = [
                { r: 255, g: 23, b: 0 },
                { r: 55, g: 255, b: 0 },
                { r: 0, g: 233, b: 255 },
                { r: 255, g: 255, b: 0 }
            ];

            const sets = baseColors.map(baseColor => {
                const colorSet = [];
                for (let i = 0; i < 4; i++) {
                    const alpha = (0.25 * (i + 1)).toFixed(2);
                    const color = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;
                    colorSet.push(color);
                }
                return colorSet;
            });
            return sets;
        }

        setColor(color) {
            this.acolor = color;
            this.tcolor = color;
            this.ccolor = color;
            this.gcolor = color;
            this.solid_color = color;
        }

        getDownStream(site, track) {
            let downstream = null;
            let index = 0;
            if (track.strand > 0) {
                downstream = track.getSequenceRange(site, site + this.window);
                let sites = this.findSpliceSites(downstream, site);
                return sites;

            } else {
                downstream = track.getSequenceRange(site - this.window, site);
                let sites = this.findSpliceSites(downstream, site - this.window);
                return sites;

            }
        }

        getStreamWindow(site, track) {
            let downstream = track.getSequenceRange(site - this.window, site + this.window);
            let sites = this.findSpliceSites(downstream, site - this.window);
            return sites;
        }

        findSpliceSites(dna, init, direction) {
            let donorSites = [];
            let acceptorSites = [];

            if (direction >= 1) {
                for (let i = 0; i < dna.length - 1; i++) {
                    if (dna.substring(i, i + 2).toUpperCase() === 'GT') {
                        donorSites.push(init + i);
                    }
                }

                for (let i = 0; i < dna.length - 1; i++) {
                    if (dna.substring(i, i + 2).toUpperCase() === 'AG') {
                        acceptorSites.push(init + i);
                    }
                }
            } else {
                for (let i = 0; i < dna.length - 1; i++) {
                    if (dna.substring(i, i + 2).toUpperCase() === 'TG') {
                        donorSites.push(init + i);
                    }
                }

                for (let i = 0; i < dna.length - 1; i++) {
                    if (dna.substring(i, i + 2).toUpperCase() === 'GA') {
                        acceptorSites.push(init + i);
                    }
                }
            }
            return {
                donorSites: donorSites,
                acceptorSites: acceptorSites
            };
        }

        addAttributionPoint(x, y, base) {
            if (base.toUpperCase() == 'A') {
                this.apts.push({ x: x, y: y })
            } else if (base.toUpperCase() == 'T') {
                this.tpts.push({ x: x, y: y })
            } else if (base.toUpperCase() == 'C') {
                this.cpts.push({ x: x, y: y })
            } else if (base.toUpperCase() == 'G') {
                this.gpts.push({ x: x, y: y })
            } else {
                console.log(x, y, base.toUpperCase(), base.upper)
            }
        }
        getColorForValue(value) {
            let red, blue, alpha;
            if (value <= 1) {
                red = Math.floor(255 * value);
                blue = 255 - red;
                alpha = value;
                if (alpha === 0) {
                    alpha = 0.3
                }
            } else {
                value = Math.max(0, Math.min(2, value));
                red = 255;
                blue = 0;
                alpha = 1;
            }
            return `rgba(${red}, 0, ${blue}, ${alpha})`;
        }
        async draw(tgraph, graph, track) {
            if (!this.visible) {
                return;
            }

            if (this.arc_type === 'PTC') {
                await this.drawPTC(tgraph, graph, track)
            }
            else if (this.arc_type === 'SPLICE_MAP') {
                await this.drawSpliceMap(tgraph, graph, track);
            } else if (this.arc_type === 'SPLICE_INTRON') {
                await this.drawSpliceIntron(tgraph, graph, track);
            }
            else
                await this.drawToSpliceSites(tgraph, graph, track);
        }

        async drawSpliceMap(tgraph, graph, track) {
            if (!this.visible) {
                return;

            }
            let maxLod = null;
            let maxLodX = null;

            if (this.arc_type == 'SPLICE_MAP') {
                if (!this.mouseMoveListener) {
                    if ((graph.flexigraphMouseMoveListeners && !this.isIn(graph.flexigraphMouseMoveListeners, this.mouseMoveListener))) {
                        this.mouseMoveListener = (xs, ys) => {
                            if (!this.interactive) {
                                graph.removeMouseMotionListener(this.mouseMoveListener)
                                return
                            }
                            this.highlight = true;
                            tgraph.rescale();
                            let t = Math.floor(tgraph.Xwc((graph.Xwc(xs) - tgraph.xi * 2)))
                            let spliceSites = this.getStreamWindow(t, track)
                            let diff = Infinity;
                            let currentSite = t;
                            if (spliceSites && spliceSites.acceptorSites) {
                                let asites = spliceSites.acceptorSites;
                                for (let a of asites) {
                                    let tdiff = Math.abs(t - a)
                                    if (tdiff < diff) {
                                        diff = tdiff;
                                        currentSite = a;
                                        if (track.strand > 0) {
                                            currentSite += 2;
                                        }
                                    }
                                }
                            }
                            this.constitutive_site = currentSite;
                        }
                        graph.flexigraphMouseMoveListeners.push(this.mouseMoveListener)
                    }
                }
                if ((graph.flexigraphMouseUpListeners && !this.isIn(graph.flexigraphMouseUpListeners, this.mouseUpListener))) {
                    this.mouseUpListener = async (xs, ys) => {
                        if (!this.interactive) {
                            graph.removeMouseUpListener(this.mouseUpListener)
                            return;
                        }

                        let confirm = await exec('baja/lib/confirm.js', 'Drop cryptic exon (' + maxLod.toFixed(4) + ')?', async () => {
                            let exon = new Annotation("Exon", "Exon" + maxLodX, this.constitutive_site, Math.floor(maxLodX) - 1, track.strand);
                            track.add(exon);
                            this.interactive = false;
                        })
                        showModal(confirm)

                    }
                    graph.flexigraphMouseUpListeners.push(this.mouseUpListener)
                }
            } else if (this.arc_type === 'SPLICE_INTRON') {
                if (!this.mouseMoveListener) {
                    if ((graph.flexigraphMouseMoveListeners && !this.isIn(graph.flexigraphMouseMoveListeners, this.mouseMoveListener))) {
                        this.mouseMoveListener = (xs, ys) => {
                            if (!this.interactive) {
                                graph.removeMouseMotionListener(this.mouseMoveListener)
                                return
                            }
                            this.highlight = true;
                            tgraph.rescale();
                            let t = Math.floor(tgraph.Xwc((graph.Xwc(xs) - tgraph.xi * 2)))
                            let spliceSites = this.getStreamWindow(t, track)
                            let diff = Infinity;
                            let currentSite = t;
                            if (spliceSites && spliceSites.donorSites) {
                                let asites = spliceSites.donorSites;
                                for (let a of asites) {
                                    let tdiff = Math.abs(t - a)
                                    if (tdiff < diff) {
                                        diff = tdiff;
                                        currentSite = a;
                                        if (track.strand > 0) {
                                            currentSite += 2;
                                        }
                                    }
                                }
                            }
                            this.constitutive_site = currentSite;
                        }
                        graph.flexigraphMouseMoveListeners.push(this.mouseMoveListener)
                    }
                }

            }

            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            this.tgraph.rescale();
            let screencell = graph.screenWidth(1)
            this.window = 1000;
            try {
                let x1 = graph.X(tgraph.X(this.constitutive_site));
                if (track.strand > 0) {
                    let spliceSites = this.getStreamWindow(this.constitutive_site, track);
                    if (spliceSites && spliceSites.donorSites) {
                        let downstreamSites = spliceSites.donorSites;
                        let y1 = graph.Y(tgraph.Y(0))
                        let y2 = graph.Y(tgraph.Y(0))
                        for (let x__ of downstreamSites) {
                            if (this.constitutive_site < x__) {
                                let lods = track.getAttributionScore(x__, 'donor_attribution')
                                if (maxLod === null) {
                                    maxLod = lods;
                                    maxLodX = x__;

                                } else if (maxLod < lods) {
                                    maxLod = lods;
                                    maxLodX = x__;
                                }

                                if (lods != null) {
                                    let x2 = graph.X(tgraph.X(x__))
                                    let midX = (x1 + x2) / 2;
                                    let midY = (y1 + y2) / 2;
                                    let color = lods;
                                    if (color > 2) {
                                        color = 2;
                                    }
                                    if (color < 0) {
                                        color = 0;
                                    }
                                    ctx.strokeStyle = this.getColorForValue(color);
                                    var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                    let sagitta = chordLength / 10;
                                    var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                                    var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                    var centerX = midX;
                                    var centerY = midY + offset;
                                    var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                    var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                                    ctx.beginPath();
                                    ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                    ctx.stroke();

                                    ctx.font = '11px Arial';

                                    let lradius = 15;
                                    let yoffset = 10;

                                    ctx.beginPath();
                                    ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                                    ctx.fill();
                                    ctx.fillStyle = 'black';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(lods.toFixed(2) + '', x2, y2 + yoffset);

                                }
                            }

                        }

                        let x2 = graph.X(tgraph.X(maxLodX))
                        let midX = (x1 + x2) / 2;
                        let midY = (y1 + y2) / 2;
                        ctx.strokeStyle = 'magenta'
                        ctx.lineWidth = 3;
                        var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                        let sagitta = chordLength / 10;
                        var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));

                        var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                        var centerX = midX;
                        var centerY = midY + offset;
                        var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                        var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                        ctx.stroke();
                        ctx.font = '10px Arial';
                        let lradius = 10;
                        let yoffset = 10;
                        ctx.beginPath();
                        ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                        ctx.fill();
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(maxLod.toFixed(2) + '', x2, y2 + yoffset);

                    }

                } else {
                    let spliceSites = this.getStreamWindow(this.constitutive_site, track);
                    if (spliceSites && spliceSites.donorSites) {
                        let downstreamSites = spliceSites.donorSites;
                        let y1 = graph.Y(tgraph.Y(0))
                        let y2 = graph.Y(tgraph.Y(0))
                        for (let x__ of downstreamSites) {
                            if (this.constitutive_site > x__) {
                                let lods = track.getAttributionScore(x__, 'donor_attribution')
                                if (maxLod === null) {
                                    maxLod = lods;
                                    maxLodX = x__;

                                } else if (maxLod < lods) {
                                    maxLod = lods;
                                    maxLodX = x__;
                                }

                                if (lods != null) {
                                    let x2 = graph.X(tgraph.X(x__))
                                    let midX = (x1 + x2) / 2;
                                    let midY = (y1 + y2) / 2;
                                    let color = lods;
                                    if (color > 2) {
                                        color = 2;
                                    }
                                    if (color < 0) {
                                        color = 0;
                                    }
                                    ctx.strokeStyle = this.getColorForValue(color);
                                    var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                    let sagitta = chordLength / 10;
                                    var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                                    var offset = -1 * Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                    var centerX = midX;
                                    var centerY = midY + offset;
                                    var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                    var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                                    ctx.beginPath();
                                    ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                    ctx.stroke();

                                    ctx.font = '11px Arial';

                                    let lradius = 15;
                                    let yoffset = 10;

                                    ctx.beginPath();
                                    ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                                    ctx.fill();
                                    ctx.fillStyle = 'black';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(lods.toFixed(2) + '', x2, y2 + yoffset);

                                }
                            }

                        }

                        let x2 = graph.X(tgraph.X(maxLodX))
                        let midX = (x1 + x2) / 2;
                        let midY = (y1 + y2) / 2;
                        ctx.strokeStyle = 'magenta'
                        ctx.lineWidth = 3;
                        var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                        let sagitta = chordLength / 10;
                        var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));

                        var offset = -1 * Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));

                        var centerX = midX;
                        var centerY = midY + offset;
                        var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                        var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                        ctx.stroke();
                        ctx.font = '10px Arial';
                        let lradius = 10;
                        let yoffset = 10;
                        ctx.beginPath();
                        ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                        ctx.fill();
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(maxLod.toFixed(2) + '', x2, y2 + yoffset);

                    }

                }
            }
            catch (exception) {
                console.log('\n\n\n ex ' + exception)
            }

        }

        async drawSpliceIntron(tgraph, graph, track) {
            if (!this.visible) {
                return;

            }
            let maxLod = null;
            let maxLodX = null;

            if ((graph.flexigraphMouseMoveListeners && !this.isIn(graph.flexigraphMouseMoveListeners, this.mouseMoveListener))) {
                this.mouseMoveListener = (xs, ys) => {
                    if (!this.interactive) {
                        graph.removeMouseMotionListener(this.mouseMoveListener);
                        return
                    }

                    tgraph.rescale();
                    let t = Math.floor(tgraph.Xwc((graph.Xwc(xs) - tgraph.xi * 2)))
                    let spliceSites = this.getStreamWindow(t, track)
                    console.log(' t ' + t)
                    let diff = Infinity;
                    let currentSite = t;
                    if (spliceSites && spliceSites.donorSites) {
                        let asites = spliceSites.donorSites;
                        for (let a of asites) {
                            let tdiff = Math.abs(t - a)
                            if (tdiff < diff) {
                                diff = tdiff;
                                currentSite = a;
                            }
                        }
                    }
                    this.constitutive_site = t;
                }
                graph.flexigraphMouseMoveListeners.push(this.mouseMoveListener)
            }

            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            this.tgraph.rescale();
            let screencell = graph.screenWidth(1)
            this.window = 1000;
            try {
                let x1 = graph.X(tgraph.X(this.constitutive_site));
                if (track.strand > 0) {
                    let spliceSites = this.getStreamWindow(this.constitutive_site, track);
                    if (spliceSites && spliceSites.acceptorSites) {
                        let downstreamSites = spliceSites.acceptorSites;
                        let y1 = graph.Y(tgraph.Y(0))
                        let y2 = graph.Y(tgraph.Y(0))
                        for (let x__ of downstreamSites) {
                            if (this.constitutive_site < x__) {
                                let lods = track.getAttributionScore(x__, 'acceptor_attribution')
                                if (maxLod === null) {
                                    maxLod = lods;
                                    maxLodX = x__;

                                } else if (maxLod < lods) {
                                    maxLod = lods;
                                    maxLodX = x__;
                                }

                                if (lods != null) {
                                    let x2 = graph.X(tgraph.X(x__))
                                    let midX = (x1 + x2) / 2;
                                    let midY = (y1 + y2) / 2;
                                    let color = lods;
                                    if (color > 2) {
                                        color = 2;
                                    }
                                    if (color < 0) {
                                        color = 0;
                                    }
                                    ctx.strokeStyle = this.getColorForValue(color);
                                    var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                    let sagitta = chordLength / 10;
                                    var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                                    var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                    var centerX = midX;
                                    var centerY = midY + offset;
                                    var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                    var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                                    ctx.beginPath();
                                    ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                    ctx.stroke();

                                    ctx.font = '11px Arial';

                                    let lradius = 15;
                                    let yoffset = 10;

                                    ctx.beginPath();
                                    ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                                    ctx.fill();
                                    ctx.fillStyle = 'black';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(lods.toFixed(2) + '', x2, y2 + yoffset);

                                }
                            }

                        }

                        let x2 = graph.X(tgraph.X(maxLodX))
                        let midX = (x1 + x2) / 2;
                        let midY = (y1 + y2) / 2;
                        ctx.strokeStyle = 'cyan'
                        ctx.lineWidth = 3;
                        var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                        let sagitta = chordLength / 10;
                        var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                        var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));

                        var centerX = midX;
                        var centerY = midY + offset;
                        var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                        var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                        ctx.stroke();
                        ctx.font = '10px Arial';
                        let lradius = 10;
                        let yoffset = 10;
                        ctx.beginPath();
                        ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                        ctx.fill();
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(maxLod.toFixed(2) + '', x2, y2 + yoffset);
                    }
                } else {
                    let spliceSites = this.getStreamWindow(this.constitutive_site, track);
                    if (spliceSites && spliceSites.acceptorSites) {
                        let downstreamSites = spliceSites.acceptorSites;
                        let y1 = graph.Y(tgraph.Y(0))
                        let y2 = graph.Y(tgraph.Y(0))
                        for (let x__ of downstreamSites) {
                            if (this.constitutive_site > x__) {
                                let lods = track.getAttributionScore(x__, 'acceptor_attribution')
                                if (maxLod === null) {
                                    maxLod = lods;
                                    maxLodX = x__;

                                } else if (maxLod < lods) {
                                    maxLod = lods;
                                    maxLodX = x__;
                                }

                                if (lods != null) {
                                    let x2 = graph.X(tgraph.X(x__))
                                    let midX = (x1 + x2) / 2;
                                    let midY = (y1 + y2) / 2;
                                    let color = lods;
                                    if (color > 2) {
                                        color = 2;
                                    }
                                    if (color < 0) {
                                        color = 0;
                                    }
                                    ctx.strokeStyle = this.getColorForValue(color);
                                    var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                    let sagitta = chordLength / 10;
                                    var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));

                                    var offset = -1*Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));

                                    var centerX = midX;
                                    var centerY = midY + offset;
                                    var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                    var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                                    ctx.beginPath();
                                    ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                    ctx.stroke();

                                    ctx.font = '11px Arial';

                                    let lradius = 15;
                                    let yoffset = 10;

                                    ctx.beginPath();
                                    ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                                    ctx.fill();
                                    ctx.fillStyle = 'black';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(lods.toFixed(2) + '', x2, y2 + yoffset);

                                }
                            }

                        }

                        let x2 = graph.X(tgraph.X(maxLodX))
                        let midX = (x1 + x2) / 2;
                        let midY = (y1 + y2) / 2;
                        ctx.strokeStyle = 'purple'
                        ctx.lineWidth = 3;
                        var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                        let sagitta = chordLength / 10;
                        var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));

                        var offset = -1*Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));

                        var centerX = midX;
                        var centerY = midY + offset;
                        var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                        var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                        ctx.stroke();
                        ctx.font = '10px Arial';
                        let lradius = 10;
                        let yoffset = 10;
                        ctx.beginPath();
                        ctx.arc(x2, y2 + yoffset, lradius, 0, Math.PI * 2, true);
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                        ctx.fill();
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(maxLod.toFixed(2) + '', x2, y2 + yoffset);

                    }

                }
            }
            catch (exception) {
                console.log('\n\n\n ex ' + exception)
            }

        }

        async drawToSpliceSites(tgraph, graph, track) {
            if (!this.visible) {
                return;
            }

            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            this.tgraph.rescale();
            let screencell = graph.screenWidth(1)
            try {
                let x1 = graph.X(tgraph.X(this.constitutive_site));
                let exon = track.getNextExon(this.constitutive_site);
                if (this.skip === 1)
                    exon = track.getNextExon(exon.xf + 1);
                if (exon) {
                    if (track.strand > 0) {
                        let site = exon.xi;
                        let spliceSites = this.getStreamWindow(site, track);

                        if (spliceSites && spliceSites.acceptorSites) {
                            let downstreamSites = spliceSites.acceptorSites;
                            let y1 = graph.Y(tgraph.Y(0))
                            let y2 = graph.Y(tgraph.Y(0))
                            for (let x__ of downstreamSites) {
                                if (this.constitutive_site < x__) {
                                    x__ += 2;
                                    let exon2 = track.getNearestAnnotation('Exon', x__);
                                    let mtag = '>';
                                    let diff = Math.abs(x__ - exon2.xi);
                                    if (exon2.xf > x__ && exon2.xi < x__) {
                                        mtag = '<'
                                    }
                                    if (exon2.xf < x__) {
                                        mtag = '<'
                                        diff = Math.abs(x__ - exon2.xf);
                                    }
                                    let lods = track.getAttributionScore(x__, 'acceptor_attribution')
                                    if (lods) {
                                        let x2 = graph.X(tgraph.X(x__))
                                        let midX = (x1 + x2) / 2;
                                        let midY = (y1 + y2) / 2;
                                        let color = lods * 10;
                                        if (color > 2) {
                                            color = 2;
                                        }
                                        if (color < 0) {
                                            color = 0;
                                        }

                                        ctx.strokeStyle = this.getColorForValue(color);
                                        var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));

                                        let sagitta = chordLength / 10;
                                        var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                                        var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                        var centerX = midX;
                                        var centerY = midY + offset;
                                        var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                        var angle2 = Math.atan2(y2 - centerY, x2 - centerX);

                                        ctx.beginPath();
                                        ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                        ctx.stroke();

                                        if (screencell > 5) {
                                            ctx.font = '12px Arial';
                                            let text = mtag + '' + diff.toFixed(0) + ' (' + (diff / 3).toFixed(1) + ')';
                                            ctx.fillText(text, x2, y2 + 15);
                                            ctx.fillText(lods.toFixed(2) + '', x2, y2 + 30);
                                        }
                                    }
                                }

                            }
                        }

                    } else {
                        let site = exon.xf;
                        let spliceSites = this.getStreamWindow(site, track);
                        if (spliceSites && spliceSites.acceptorSites) {
                            let downstreamSites = spliceSites.acceptorSites;
                            let y1 = graph.Y(tgraph.Y(0))
                            let y2 = graph.Y(tgraph.Y(0))
                            if (!this.angles || this.angles.length == 0) {
                                for (let i = 0; i < downstreamSites.length; i++) {
                                    var randomAngle = 3 * Math.PI / 2 + Math.PI / 2 * (Math.random());
                                    this.angles[i] = randomAngle;
                                }
                            }
                            let index = 0;
                            for (let x__ of downstreamSites) {
                                let lods = track.getAttributionScore(x__, 'acceptor_attribution')
                                let randomAngle = this.angles[index++]
                                if (this.angles.length >= index) {
                                    index = 0;
                                }

                                if (!randomAngle) {
                                    randomAngle = 0.2;
                                }

                                let x2 = graph.X(tgraph.X(x__))
                                let midX = (x1 + x2) / 2;
                                let midY = (y1 + y2) / 2;

                                if (lods == null) {
                                    lods = 0.02;
                                }
                                let color = lods * 100;
                                if (color > 1) {
                                    color = 1;
                                }

                                ctx.strokeStyle = this.getColorForValue(color);

                                var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                let sagitta = chordLength / 10;

                                var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));

                                var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                var centerX = midX;
                                var centerY = midY + offset;
                                var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                var angle2 = Math.atan2(y2 - centerY, x2 - centerX);

                                ctx.beginPath();
                                ctx.arc(centerX, centerY, radius, angle1, angle2, true);

                                ctx.stroke();
                                let value = lods * 10;
                                if (value > 1) {
                                    value = 1;
                                } else if (value < 0) {
                                    value = 0;
                                }
                                if (lods > 0.09) {

                                }
                            }
                            if (screencell > 5) {
                                ctx.fillStyle = this.acolor
                            }
                            else
                                if (screencell > 1) {
                                    ctx.fillStyle = this.acolor;
                                }
                                else {
                                    ctx.fillStyle = this.solid_color;
                                }
                        }

                    }
                }
            } catch (exception) {
                console.log('\n\n\n ex ' + exception)
            }

        }
        async drawPTC(tgraph, graph, track) {
            if (!this.visible) {
                return;
            }

            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            this.tgraph.rescale();
            let screencell = graph.screenWidth(1)
            try {

                let orf;
                if (this.orfhash != track.orfhash) {
                    orf = track.generateORF();
                    this.orfhash = track.orfhash;
                }
                else {
                    orf = track.orf;
                }

                if (orf) {
                    let startSite = orf.cdsi[0].index;

                    let x1 = graph.X(tgraph.X(startSite));
                    if (track.strand > 0) {
                        for (let or of orf.cdsi) {

                            if (or.aa == "STOP") {
                                console.log('debubg');

                                let trackIndex = or.index;
                                let y1 = graph.Y(tgraph.Y(0))
                                let y2 = graph.Y(tgraph.Y(0))
                                let x2 = graph.X(tgraph.X(trackIndex))
                                let midX = (x1 + x2) / 2;
                                let midY = (y1 + y2) / 2;
                                ctx.strokeStyle = 'rgba(255,100,0,0.4';
                                var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                let sagitta = chordLength / 10;
                                var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                                var offset = Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                var centerX = midX;
                                var centerY = midY + offset;
                                var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                                ctx.beginPath();
                                ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                ctx.stroke();
                            }
                        }
                    }

                    if (track.strand <= 0) {
                        for (let or of orf.cdsi) {
                            if (or.aa == "STOP") {
                                let trackIndex = or.index;
                                let y1 = graph.Y(tgraph.Y(0))
                                let y2 = graph.Y(tgraph.Y(0))
                                let x2 = graph.X(tgraph.X(trackIndex))
                                let midX = (x1 + x2) / 2;
                                let midY = (y1 + y2) / 2;
                                ctx.strokeStyle = 'rgba(255,200,0,0.4';
                                var chordLength = (Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
                                let sagitta = chordLength / 10;
                                var radius = (sagitta / 2) + (Math.pow(chordLength, 2) / (8 * sagitta));
                                var offset = -1 * Math.sqrt(Math.pow(radius, 2) - Math.pow(chordLength / 2, 2));
                                var centerX = midX;
                                var centerY = midY + offset;
                                var angle1 = Math.atan2(y1 - centerY, x1 - centerX);
                                var angle2 = Math.atan2(y2 - centerY, x2 - centerX);
                                ctx.beginPath();
                                ctx.arc(centerX, centerY, radius, angle1, angle2, false);
                                ctx.stroke();
                            }
                        }
                    }

                    if (screencell > 5) {

                    }

                }

            } catch (exception) {
                console.log('\n\n\n ex ' + exception)
            }

        }

    }
    resolve(AttributionSushimiLayer);
});
