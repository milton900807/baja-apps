function (graph, genegraph_panel_layout, preAction) {
  // `preAction` is one of the menu item keys below ('rnaseq' | 'vcf' | 'bed' | 'layers').
  // Given one, clicking a track goes STRAIGHT into that item instead of opening the menu:
  // the My data library has already asked which kind of file this is, and asking again in a
  // popup right after would be the same question twice in two different interfaces.
  // Without it the menu appears exactly as before, which is what the older callers get.
  return new Promise(async (resolve, reject) => {
    const server = window["env"]["apiUrl"] + "/" + getUser();
    graph.clearMouseListeners("baja/manchester/menu/mouse-over-highlight.js");
    graph.selectOff();

    graph.setMouseMode("select-track");
    graph.selectOff();
    // Name the action the library already chose, so the prompt says what this click is FOR
    // rather than the generic one it would have shown before the choice existed.
    const PRE_LABEL = {
      rnaseq: "add RNASeq coverage",
      vcf: "add a phased VCF",
      bed: "add a BED file",
      layers: "edit its layers",
    };
    graph.setMessage(" Select a track... ");
    graph.setCenterMessage(
      preAction && PRE_LABEL[preAction]
        ? " Click a track to " + PRE_LABEL[preAction] + "... "
        : " Click on  a track... ",
    );
    let selectedTrack = null;
    let menuList = [];
    function convertToLocal(x, gxi, gxf, xi, xf) {
      return xi + ((x - gxi) * (xf - xi)) / (gxf - gxi);
    }
    function convertToGlobal(x, gxi, gxf, xi, xf) {
      return gxi + ((x - xi) * (gxf - gxi)) / (xf - xi);
    }
    const colors = [
      "#FF5733",
      "#33FF57",
      "#3357FF",
      "#F33FF5",
      "#33F5FF",
      "#F5FF33",
      "#FF8333",
      "#8333FF",
      "#3FF573",
      "#5733FF",
    ];

    function getColorByNumber(number) {
      if (number > 10) number = 1;

      if (number < 1 || number > 10) {
        throw new Error("Number must be between 1 and 10.");
      }

      return colors[number - 1];
    }

    let loadData = async (__selectedTrack, element) => {
      let TrackLayer = await exec("baja/bio/track-layer.js");

      let em = new EngineMonitor((msg) => {
        log(msg);
      });
      let epath = element.path;
      epath = epath.replace(/\/+/g, "/");
      let range = {
        start: __selectedTrack.xi,
        end: __selectedTrack.xf,
      };
      // The track's own selectedRange() rather than the raw marks: it resolves
        // world-coordinate marks and offset marks to the same absolute span.
        {
            const __sel = (__selectedTrack.selectedRange && __selectedTrack.selectedRange()) || null;
            if (__sel) { range.start = __sel.start; range.end = __sel.end; }
        }

      let fix = (ochr) => {
        const regex = /^chrx$/i;
        const regey = /^chry$/i;
        if (regex.test(ochr)) {
          return "X";
        } else if (regey.test(ochr)) {
          return "Y";
        } else {
          return ochr;
        }
      };

      let res = await exec(
        "py/baja/bigwig/view-bigwig-userdata.py",
        em,
        epath,
        range.start,
        range.end,
        fix(__selectedTrack.chr),
      );

      try {
        let rv = JSON.parse(res.values);
        let rs_base = element.path.split(".bw")[0];
        let layer = new TrackLayer(rs_base, __selectedTrack.xi, 0, __selectedTrack.xf, 1);
        let index = 0;
        layer.data_type = "RNASeq";

        let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);
        if (!max_exp) {
          max_exp = 1.0;
        }
        layer.addPolygonPoint(range.start, (0 / max_exp) * -1);
        for (let v of rv) {
          if (v === NaN) {
            v = 0;
          }
          layer.addPolygonPoint(v[0], v[1] / max_exp);
          index++;
        }
        layer.addPolygonPoint(range.end, (0 / max_exp) * -1);
        layer.sortPolygonPoints();
        __selectedTrack.addLayer(layer);
      } catch (exception) {
        console.log(" faield to load for " + __selectedTrack.name);
      }
    };

    let loadExonData = async (selectedTrack, element) => {
      let TrackLayer = await exec("baja/bio/track-layer.js");

      let range = {
        start: selectedTrack.xi,
        end: selectedTrack.xf,
      };
      // The track's own selectedRange() rather than the raw marks: it resolves
        // world-coordinate marks and offset marks to the same absolute span.
        {
            const __sel = (selectedTrack.selectedRange && selectedTrack.selectedRange()) || null;
            if (__sel) { range.start = __sel.start; range.end = __sel.end; }
        }
      let em = new EngineMonitor((msg) => {
        log(msg);
      });
      let epath = "/bd/" + element.path;
      epath = epath.replace(/\/+/g, "/");

      let exons = selectedTrack.getExons();
      let index = 1;

      const exonWithLowestGxi = exons.reduce((lowest, exon) => {
        return lowest === null || exon.gxi < lowest.gxi ? exon : lowest;
      }, null);

      function findHighestGxf(exons) {
        const exonWithHighestGxf = exons.reduce((highest, exon) => {
          return highest === null || exon.gxf > highest.gxf ? exon : highest;
        }, null);

        return exonWithHighestGxf ? exonWithHighestGxf.gxf : null;
      }

      const highestGxf = findHighestGxf(exons);
      for (let exon of exons) {
        let color = getColorByNumber(index);
        index++;
        if (index > 10) {
          index = 1;
        }
        exec(
          server + "/py/baja/bigwig/view-bigwig-userdata.py",
          em,
          epath,
          exon.gxi,
          exon.gxf,
          selectedTrack.chr,
        ).then(async (res) => {
          try {
            let rv = JSON.parse(res.values);
            let rs_base = element.path.split(".bw")[0];

            let layer = new TrackLayer(exon.name + rs_base, 0, 0, selectedTrack.sequence.length, 1);
            let index = 0;
            layer.data_type = "RNASeq";
            layer.fillstyle = color;

            let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);

            if (!max_exp) {
              max_exp = 1.0;
            }
            layer.addPolygonPoint(
              convertToLocal(exon.gxi, exon.gxi, exon.gxf, exon.xi, exon.xf),
              (0 / max_exp) * -1,
            );
            for (let v of rv) {
              if (v === NaN) {
                v = 0;
              }

              layer.addPolygonPoint(
                convertToLocal(v[0], exon.gxi, exon.gxf, exon.xi, exon.xf),
                v[1] / max_exp,
              );
              index++;
            }
            layer.addPolygonPoint(
              convertToLocal(exon.gxf, exon.gxi, exon.gxf, exon.xi, exon.xf),
              (0 / max_exp) * -1,
            );
            layer.sortPolygonPoints();
            selectedTrack.addLayer(layer);
          } catch (exception) {
            graph.setMessage(" Failed to load " + selectedTrack.name);
          }
        });
      }
    };

    let fix = (ochr) => {
      console.log(ochr);
      const regex = /^chrx$/i;
      const regey = /^chry$/i;
      if (regex.test(ochr)) {
        return "X";
      } else if (regey.test(ochr)) {
        return "Y";
      } else {
        return ochr;
      }
    };
    menuList.push({
      key: "rnaseq",
      label: "Add RNASeq",
      click: async (xwc, ywc) => {
        let TrackLayer = await exec("baja/bio/track-layer.js");
        let t = selectedTrack;
        if (t.chr === undefined || t.chr === null) {
          graph.setMessage(
            t.name + "track does not have chromosome defined in this track. (" + t.chr + ")",
          );
        } else {
          let range = {
            start: t.xi,
            end: t.xf,
          };

          let columns = 4;
          if (isMobile()) {
            columns = 1;
          }
          log(server);
          let ww = {
            wid: "simple-file-browser",
            width: "100%",
            height: "100%",
            data: {
              width: "100%",
              drive: "user",
              user: getUser(),
              root: "/" + getUser(),
              filetype: ".bw",
              columns: columns,
              "ionfunction.fileClick": createIonFunction(async (element) => {
                let progressBar;
                let w = {
                  wid: "progress",
                  componentRef: "progressBar",
                  data: {
                    progress: 10,
                    progressBar: createIonFunction((progessBar) => {
                      progressBar = progessBar;
                    }),
                  },
                };
                let t_offset = 0.001;
                CurrentLayout.clearComponent("mainPanel");
                CurrentLayout.setComponent("mainPanel", genegraph_panel_layout);
                CurrentLayout.clearComponent("buttonMenuPanel|labelPanel");
                CurrentLayout.setComponent("buttonMenuPanel", w);
                let em = new EngineMonitor((msg) => {
                  log(msg);
                });
                let epath = "/bd/" + element.path;
                epath = epath.replace(/\/+/g, "/");

                if (selectedTrack.isSelected() || selectedTrack.getHighlightedSequence() != null) {
                  if (selectedTrack.track_type === "CDNA") {
                    await loadExonData(selectedTrack, element);
                  } else {
                    await loadData(selectedTrack, element);
                  }
                }
              }),
              "ionfunction.openfile": createIonFunction(async (file, text) => {}),
              "ionfunction.path": createIonFunction(async (path, nodes) => {}),
            },
          };

          let bwpanel = {
            wid: "card",
            data: {
              cards: [
                [
                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: {
                      wid: "html",
                      data: "<hr>",
                    },
                  },

                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: {
                      wid: "mt-button",
                      data: {
                        buttons: [
                          {
                            label: "Cancel",
                            ionFunction: createIonFunction(async () => {
                              CurrentLayout.clearComponent("mainPanel");
                              CurrentLayout.setComponent("mainPanel", genegraph_panel_layout);
                            }),
                          },
                        ],
                      },
                    },
                  },
                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: ww,
                  },
                ],
              ],
            },
          };

          CurrentLayout.clearComponent("mainPanel");
          CurrentLayout.setComponent("mainPanel", bwpanel);
        }
      },
      move: () => {
        log("");
      },
    });
    menuList.push({
      key: "vcf",
      label: "Phased Seq (VCF)",
      click: async (xwc, ywc) => {
        let TrackLayer = await exec("baja/bio/track-layer.js");
        let t = selectedTrack;
        if (t.chr === undefined || t.chr === null) {
          graph.setMessage(
            t.name + "track does not have chromosome defined in this track. (" + t.chr + ")",
          );
        } else {
          let range = {
            start: t.xi,
            end: t.xf,
          };

          let columns = 4;
          if (isMobile()) {
            columns = 1;
          }
          log(server);
          let ww = {
            wid: "simple-file-browser",
            width: "100%",
            height: "100%",
            data: {
              width: "100%",
              drive: "user",
              user: getUser(),
              root: "/" + getUser(),
              filetype: null,
              columns: columns,
              "ionfunction.fileClick": createIonFunction(async (element) => {
                let progressBar;
                let w = {
                  wid: "progress",
                  componentRef: "progressBar",
                  data: {
                    progress: 10,
                    progressBar: createIonFunction((progessBar) => {
                      progressBar = progessBar;
                    }),
                  },
                };
                let t_offset = 0.001;
                CurrentLayout.clearComponent("mainPanel");
                CurrentLayout.setComponent("mainPanel", genegraph_panel_layout);
                CurrentLayout.clearComponent("buttonMenuPanel|labelPanel");
                CurrentLayout.setComponent("buttonMenuPanel", w);
                let em = new EngineMonitor((msg) => {
                  log(msg);
                });
                let epath = element.path;
                epath = epath.replace(/\/+/g, "/");
                let chr = selectedTrack.chr + "";
                let start = selectedTrack.xi;
                let end = selectedTrack.xf;

                if (!chr.startsWith("chr")) {
                  chr = "chr" + chr;
                }

                let r = await exec(
                  `py/bio/lj-phased-vcf.py`,
                  em,
                  element.path,
                  fix(chr),
                  start,
                  end,
                  selectedTrack.strand,
                );

                graph.setMessage(" Loaded " + (r?.results?.length ?? 0));

                let SnpIndel = await exec("flexigraph/snpindel.js");
                let count = 0;

                const safeString = (v, fallback = "") => {
                  if (v === null || v === undefined) return fallback;
                  const s = String(v);
                  return s.length ? s : fallback;
                };

                const safeOneWordQuality = (v) => {
                  const q = safeString(v, "unknown").trim().toLowerCase();
                  if (q === "high" || q === "medium" || q === "low" || q === "unknown") return q;
                  return "unknown";
                };

                const safeOptionalInt = (v) => {
                  if (v === null || v === undefined) return null;
                  const n = Number(v);
                  return Number.isFinite(n) ? n : null;
                };

                const safeOptionalBool = (v) => {
                  if (v === null || v === undefined) return null;
                  if (typeof v === "boolean") return v;
                  if (v === 1 || v === "1" || v === "true") return true;
                  if (v === 0 || v === "0" || v === "false") return false;
                  return null;
                };

                const extractPhaseAndPhasing = (sid) => {
                  const phasingObj =
                    sid && typeof sid.phasing === "object" && sid.phasing
                      ? sid.phasing
                      : sid && typeof sid.phase === "object" && sid.phase
                        ? sid.phase
                        : null;

                  const phasedFlag = phasingObj
                    ? Boolean(safeOptionalBool(phasingObj.phased))
                    : false;

                  let phaseNum = 0;
                  if (Number.isFinite(Number(sid?.phase))) {
                    phaseNum = Number(sid.phase);
                  } else if (phasingObj && Number.isFinite(Number(phasingObj.phase01))) {
                    phaseNum = Number(phasingObj.phase01);
                  } else if (phasingObj && typeof phasingObj.phase_label === "string") {
                    phaseNum = phasingObj.phase_label === "H1" ? 1 : 0;
                  } else {
                    phaseNum = 0;
                  }

                  if (!phasedFlag) {
                    return { phaseNum: 0, phaseset: null, phasing: null, phased: false };
                  }

                  const phaseset =
                    sid?.phaseset ??
                    sid?.phaseSet ??
                    sid?.PS ??
                    phasingObj?.phaseset ??
                    phasingObj?.ps ??
                    null;

                  return { phaseNum, phaseset, phasing: phasingObj, phased: true };
                };

                if (r != null && Array.isArray(r.results)) {
                  for (let sid of r.results) {
                    if (!sid) continue;

                    const xi = Number(sid.xi ?? sid.POS ?? sid.pos ?? sid.position);
                    if (!Number.isFinite(xi)) continue;

                    const type = safeString(sid.type, "snp");
                    const reference = safeString(sid.reference, "");
                    const alternate = safeString(sid.alternate, "");

                    const strand = safeString(sid.strand, selectedTrack?.strand ?? "1");

                    const id = safeString(sid.id, null);

                    const { phaseNum, phaseset, phasing, phased } = extractPhaseAndPhasing(sid);

                    let snp = new SnpIndel(
                      type,
                      xi,
                      reference,
                      alternate,
                      phaseNum,
                      strand,
                      id,
                      phaseset,
                    );

                    snp.name = safeString(sid.name, snp.name);

                    const annStr = safeString(sid.annotations, "");
                    const ant = annStr ? annStr.split(";").filter(Boolean) : [];
                    snp.setAnnotation(ant);

                    snp.quality = safeOneWordQuality(sid.quality);

                    snp.phasing = phased ? phasing : null;
                    snp.isPhased = phased;

                    const gtFromAnywhere =
                      safeString(sid?.phasing?.gt, "") ||
                      safeString(typeof sid?.phase === "object" ? sid?.phase?.gt : "", "") ||
                      safeString(sid?.gt, "");
                    if (gtFromAnywhere) snp.gt = gtFromAnywhere;

                    snp.haplotype = safeOptionalInt(
                      sid.haplotype ?? (snp.phasing ? snp.phasing.haplotype : null) ?? null,
                    );

                    if (
                      (snp.phaseset === null || snp.phaseset === undefined) &&
                      snp.phasing &&
                      snp.phasing.phaseset != null
                    ) {
                      snp.phaseset = snp.phasing.phaseset;
                    }

                    snp.phaseLabel = snp.phasing ? safeString(snp.phasing.phase_label, "") : "";
                    snp.phaseNorm = phased ? phaseNum : null;

                    const ph = snp.phasing || {};

                    selectedTrack.addsnpindel(snp);
                    count++;
                  }
                }
              }),
              "ionfunction.openfile": createIonFunction(async (file, text) => {}),
              "ionfunction.path": createIonFunction(async (path, nodes) => {}),
            },
          };

          let bwpanel = {
            wid: "card",
            data: {
              cards: [
                [
                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: {
                      wid: "html",
                      data: "<hr>",
                    },
                  },

                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: {
                      wid: "mt-button",
                      data: {
                        buttons: [
                          {
                            label: "Cancel",
                            ionFunction: createIonFunction(async () => {
                              CurrentLayout.clearComponent("mainPanel");
                              CurrentLayout.setComponent("mainPanel", genegraph_panel_layout);
                            }),
                          },
                        ],
                      },
                    },
                  },
                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: ww,
                  },
                ],
              ],
            },
          };

          CurrentLayout.clearComponent("mainPanel");
          CurrentLayout.setComponent("mainPanel", bwpanel);
        }
      },
      move: () => {
        log("");
      },
    });
    menuList.push({
      key: "bed",
      label: "Bed",
      click: async (xwc, ywc) => {
        let TrackLayer = await exec("baja/bio/track-layer.js");
        let t = selectedTrack;
        if (t.chr === undefined || t.chr === null) {
          graph.setMessage(
            t.name + "track does not have chromosome defined in this track. (" + t.chr + ")",
          );
        } else {
          function makeBedLabel(bed) {
            let name = bed.name || bed.id || "BED interval";
            let ann = bed.annotations || {};
            let score = ann.score ? ` score=${ann.score}` : "";
            let info = ann.thickStart ? ` ${ann.thickStart}` : "";
            return `${name}${score}${info}`;
          }
          function getBedIntervalColor(bed) {
            let ann = bed.annotations || {};
            let info = String(ann.thickStart || "").toUpperCase();
            if (info.includes("INDEL")) {
              return "rgba(230, 120, 20, 0.45)";
            }
            if (info.includes("SNP")) {
              return "rgba(30, 90, 220, 0.45)";
            }
            if (bed.strand === "-1") {
              return "rgba(160, 60, 180, 0.45)";
            }
            return "rgba(30, 160, 80, 0.45)";
          }

          let range = {
            start: t.xi,
            end: t.xf,
          };

          let columns = 4;
          if (isMobile()) {
            columns = 1;
          }
          log(server);
          let ww = {
            wid: "simple-file-browser",
            width: "100%",
            height: "100%",
            data: {
              width: "100%",
              drive: "user",
              user: getUser(),
              root: "/" + getUser(),
              filetype: ".bed",
              columns: columns,
              "ionfunction.fileClick": createIonFunction(async (element) => {
                let progressBar;
                let w = {
                  wid: "progress",
                  componentRef: "progressBar",
                  data: {
                    progress: 10,
                    progressBar: createIonFunction((progessBar) => {
                      progressBar = progessBar;
                    }),
                  },
                };
                let t_offset = 0.001;
                CurrentLayout.clearComponent("mainPanel");
                CurrentLayout.setComponent("mainPanel", genegraph_panel_layout);
                CurrentLayout.clearComponent("buttonMenuPanel|labelPanel");
                CurrentLayout.setComponent("buttonMenuPanel", w);
                let em = new EngineMonitor((msg) => {
                  log(msg);
                });
                let epath = element.path;
                epath = epath.replace(/\/+/g, "/");
                let chr = selectedTrack.chr + "";
                let start = selectedTrack.xi;
                let end = selectedTrack.xf;

                if (!chr.startsWith("chr")) {
                  chr = "chr" + chr;
                }

                let res = await exec(
                  `py/bio/lj-bed-file-loader.py`,
                  em,
                  element.path,
                  fix(chr),
                  start,
                  end,
                  selectedTrack.strand,
                );


                try {
                  let rv = res;
                  let bedRows = Array.isArray(rv) ? rv : rv.results;
                  if (!Array.isArray(bedRows)) {
                    graph.setMessage("BED loader returned no results array");
                    return;
                  }
                  let rs_base = element.path.split("/").pop();
                  rs_base = rs_base.replace(/\.bed\.gz$/i, "").replace(/\.bed$/i, "");
                  let layer = new TrackLayer(rs_base, selectedTrack.xi, 0, selectedTrack.xf, 1);
                  layer.data_type = "BED";
                  layer.type = "TrackLayer";
                  layer.drawStyle = "interval";
                  layer.color = "rgba(30, 90, 220, 0.35)";
                  layer.fillstyle = "rgba(30, 90, 220, 0.35)";
                  layer.setLabelFont("10px Arial");

                  let count = 0;

                  for (let bed of bedRows) {
                    let x1 = Number(bed.xi);
                    let width = Math.max(Number(bed.xf || 1), 1);
                    let x2 = x1 + width;
                    if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
                      continue;
                    }
                    if (x2 < range.start || x1 > range.end) {
                      continue;
                    }
                    let label = makeBedLabel(bed);
                    let y = layer.getYByOverlapCount(x1, x2);


                    count++;

                    layer.addInterval(
                      x1,
                      x2,
                      y,
                      label,
                    );
                    let color = getBedIntervalColor(bed);
                    layer.setIntervalColor(x1, x2, y, label, color);
                  } 
                  selectedTrack.addLayer(layer);
                  // Toast, so the user sees that the data landed.
                  graph.setResultMessage(" Loaded BED layer: " + rs_base + " with " + count + " items. ");
                } catch (exception) {
                  console.log(exception);
                  graph.setMessage("Failed to load BED data for " + selectedTrack.name);
                }
                // Hand the canvas back to the hover highlight, whether the load worked or not.
                // This file had no restore at all, so after loading here the mouse stayed in
                // whatever mode the picker left it in.
                try { graph.clearMouseListeners(); } catch (e) { }
                try { graph.setMouseMode('navigate'); } catch (e) { }
                try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
              }),
              "ionfunction.openfile": createIonFunction(async (file, text) => {}),
              "ionfunction.path": createIonFunction(async (path, nodes) => {}),
            },
          };

          let bwpanel = {
            wid: "card",
            data: {
              cards: [
                [
                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: {
                      wid: "html",
                      data: "<hr>",
                    },
                  },

                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: {
                      wid: "mt-button",
                      data: {
                        buttons: [
                          {
                            label: "Cancel",
                            ionFunction: createIonFunction(async () => {
                              CurrentLayout.clearComponent("mainPanel");
                              CurrentLayout.setComponent("mainPanel", genegraph_panel_layout);
                            }),
                          },
                        ],
                      },
                    },
                  },
                  {
                    title: " ",
                    body: ``,
                    width: "100%",
                    component: ww,
                  },
                ],
              ],
            },
          };

          CurrentLayout.clearComponent("mainPanel");
          CurrentLayout.setComponent("mainPanel", bwpanel);
        }
      },
      move: () => {
        log("");
      },
    });

    menuList.push({
      key: "layers",
      label: "Edit Layer",
      click: async (xwc, ywc) => {
        let track_layers_panel = await exec(
          "baja/manchester/menu/select-track-action-layers-edit-panel.js",
          selectedTrack,
          genegraph_panel_layout,
        );
        CurrentLayout.clearComponent("mainPanel");
        CurrentLayout.setComponent("mainPanel", track_layers_panel);
      },
      move: () => {
        log("");
      },
    });

    graph.addMouseMoveListener((x, y) => {
      let p_trackIndex = graph.getTrack(x, y);
      if (p_trackIndex >= 0) {
        graph.deselectAllTracks();
        if (graph.track[p_trackIndex]) graph.track[p_trackIndex].showResizeBar = true;
        return;
      }
    });
    graph.addMouseDownListener(async (x, y) => {
      let trackIndex = graph.getTrack(x, y);
      if (trackIndex >= 0) {
        selectedTrack = graph.track[trackIndex];
      }
      let editor;
      let typeAhead;

      if (!selectedTrack) return;
      if (preAction) {
        const item = menuList.find((m) => m && m.key === preAction);
        // An unknown key falls through to the menu rather than doing nothing: a typo in a
        // caller should cost an extra click, not a dead canvas.
        if (item) { try { await item.click(x, y); } catch (e) { } return; }
      }
      graph.showMenu(menuList, x, y);
    });
  });
};
