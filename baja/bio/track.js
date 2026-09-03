return new Promise(async (resolve, reject) => {
  const SnpIndel = await exec("flexigraph/snpindel.js");
  const MGrid = await exec("flexigraph/grid.js");
  const Annotation = await exec("flexigraph/annotation.js");
  const RNASecondaryStructure = await exec("baja/structure/rna-secondary-structure-track.js");
  const Highlighter = await exec("baja/bio/highlighter.js");
  const highlighters = new Highlighter().getTrackHighlighters();
  const TrackPlot = await exec("flexigraph/track-plot.js");
  const codon = await exec("baja/bio/aa/codons.js");
  const codon_colors = await exec("baja/bio/aa/colors.js");
  const Biopolymer = await exec("baja/chem/biopolymer.js");
  const AttributionLayer = await exec("baja/bio/attribution-layer.js");
  const AttributionSushimiLayer = await exec("baja/bio/attribution-sushimi-layer.js");
  const TrackLayer = await exec("baja/bio/track-layer.js");

  let Oligo = await exec("flexigraph/oligo.js");
  let SIRNA = await exec("flexigraph/sirna.js");
  let Barchart = await exec("baja/bio/barchart-track.js");
  let Amplicon = await exec("flexigraph/amplicon.js");

  // --- Genomics browser palette (IGV / Ensembl / UCSC aesthetic) ---
  const GFONT_STACK = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  const GFONT = '13px ' + GFONT_STACK;
  const GFONT_SM = '10px ' + GFONT_STACK;
  const GX_INK = '#0a2540'; // text
  const GX_PAPER = '#ffffff'; // background
  const GX_GUIDE = 'rgb(168, 255, 240)'; // faint guide/tick lines
  const GX_ARROW = 'rgba(120,130,145,0.22)'; // lighter still — track direction arrows
  const GX_GTAG = 'rgba(150,160,175,0.85)';  // light gray for the g. genomic-locus tags
  // Abbreviate a genomic position so the 45deg g. tags aren't a wall of digits:
  // 77576869 -> 77.58M, 3319 -> 3.3k.
  const _abbrevPos = (n) => {
    n = +n;
    if (!isFinite(n)) return '' + n;
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
    return '' + Math.round(n);
  };
  const GX_RING = '#123049'; // outlines
  const GX_EXON = 'rgba(44,90,160,0.85)'; // exon / cds fill
  const GX_EXON_EDGE = '#1b4a7a'; // exon / cds edge

  // ---- TRACK THEMES ---------------------------------------------------------------------
  //
  // The constants above ARE the classic theme. A theme names the same roles with different
  // colours, and GX_T is the palette in force while a track draws itself: Track.draw() points
  // it at that track's theme on entry, so the free helpers below and the class methods all
  // pick it up without threading a palette through every signature.
  //
  // Safe because tracks draw one after another, never interleaved. A track with no theme, or
  // an unknown one, gets 'classic' -- a bad name should cost the user their colours, not
  // their track.
  const GX_THEMES = {
    // classic: { label: 'Classic', ink: '#0a2540', paper: '#ffffff', guide: 'rgb(168, 255, 240)', gtag: 'rgba(150,160,175,0.85)', ring: '#123049', exon: 'rgba(44,90,160,0.85)', exonEdge: '#1b4a7a', arrow: 'rgba(120,130,145,0.22)' },
    paper: { label: 'Paper', ink: '#2b2b2b', paper: '#f6f1e3', guide: '#d8d2c4', gtag: '#8a7f6d', ring: '#5a5348', exon: 'rgba(150,120,70,0.75)', exonEdge: '#7a6647', arrow: 'rgba(120,110,90,0.25)' },
    classic: { label: 'Blueprint', ink: '#dbe9ff', paper: '#0d2b4e', guide: 'rgba(219,233,255,0.30)', gtag: '#9dc0ef', ring: '#5b8ac4', exon: 'rgba(150,200,255,0.55)', exonEdge: '#a8cbf0', arrow: 'rgba(200,225,255,0.25)' },
    blueprint: { label: 'Blueprint', ink: '#dbe9ff', paper: '#0d2b4e', guide: 'rgba(219,233,255,0.30)', gtag: '#9dc0ef', ring: '#5b8ac4', exon: 'rgba(150,200,255,0.55)', exonEdge: '#a8cbf0', arrow: 'rgba(200,225,255,0.25)' },
    midnight: { label: 'Midnight', ink: '#e6edf3', paper: '#0d1117', guide: 'rgba(230,237,243,0.20)', gtag: '#8b949e', ring: '#30363d', exon: 'rgba(88,166,255,0.55)', exonEdge: '#58a6ff', arrow: 'rgba(139,148,158,0.28)' },
    forest: { label: 'Forest', ink: '#12352a', paper: '#f2f7f4', guide: '#c3d8cd', gtag: '#4a6b60', ring: '#14705c', exon: 'rgba(20,112,92,0.70)', exonEdge: '#0d5544', arrow: 'rgba(60,110,95,0.25)' },
    sunset: { label: 'Sunset', ink: '#5c2118', paper: '#fff6f1', guide: '#e8cdbf', gtag: '#96604e', ring: '#a4553f', exon: 'rgba(209,115,79,0.70)', exonEdge: '#8c412c', arrow: 'rgba(160,100,80,0.25)' },
    slate: { label: 'Slate', ink: '#20262c', paper: '#f7f9fa', guide: '#ccd3d9', gtag: '#5a656f', ring: '#8a97a3', exon: 'rgba(90,101,111,0.60)', exonEdge: '#48525b', arrow: 'rgba(90,101,111,0.25)' },
    highvis: { label: 'High contrast', ink: '#000000', paper: '#ffffff', guide: '#000000', gtag: '#000000', ring: '#000000', exon: 'rgba(0,0,0,0.75)', exonEdge: '#000000', arrow: 'rgba(0,0,0,0.45)' },
    mono: { label: 'Mono', ink: '#3f3f3f', paper: '#fafafa', guide: '#dcdcdc', gtag: '#8c8c8c', ring: '#9a9a9a', exon: 'rgba(90,90,90,0.55)', exonEdge: '#6b6b6b', arrow: 'rgba(120,120,120,0.25)' },
    lab: { label: 'Lab notebook', ink: '#1c3f6e', paper: '#f7faff', guide: '#cfd9e6', gtag: '#5b7ea8', ring: '#7d9bc1', exon: 'rgba(28,63,110,0.60)', exonEdge: '#14345c', arrow: 'rgba(90,126,168,0.25)' },
    clinical: { label: 'Clinical', ink: '#101820', paper: '#ffffff', guide: '#dfe4e8', gtag: '#7a1c2b', ring: '#c41230', exon: 'rgba(196,18,48,0.55)', exonEdge: '#8f0d23', arrow: 'rgba(150,60,75,0.25)' }
  };

  let GX_T = GX_THEMES.classic;

  // ---- GENE DRAW CLASSES ----------------------------------------------------------------
  //
  // A theme is not only a palette. These decide HOW a gene body is put on the canvas -- the
  // shape and the stroke -- so two themes with similar colours can still look nothing alike.
  //
  // One method, body(), because that is the mark the eye actually reads on a track. Each
  // subclass overrides it and nothing else; the base is the wash-and-outline the app has
  // always drawn, so 'classic' is the base class unchanged.
  class GeneDraw {
    constructor(T) { this.T = T || GX_THEMES.classic; }
    // Fill colour derived from the theme's exon role, so a subclass need not restate it.
    fill() { return this.T.exon; }
    edge() { return this.T.exonEdge || this.T.ring; }
    body(ctx, x, y, w, h) {
      ctx.save();
      ctx.fillStyle = this.fill();
      ctx.fillRect(x, y, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.edge();
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      ctx.restore();
    }
  }

  // Outline only: the body is a frame, the track shows through it. Reads as a drawing rather
  // than a filled bar, which is the point of a blueprint or a notebook.
  class GeneDrawOutline extends GeneDraw {
    body(ctx, x, y, w, h) {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.edge();
      ctx.strokeRect(x + 0.75, y + 0.75, Math.max(0, w - 1.5), Math.max(0, h - 1.5));
      ctx.restore();
    }
  }

  // Rounded: the same bar with its corners taken off. Softer, and at small widths it reads as
  // a capsule rather than a sliver.
  class GeneDrawRounded extends GeneDraw {
    body(ctx, x, y, w, h) {
      const r = Math.max(0, Math.min(6, h / 2, w / 2));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fillStyle = this.fill();
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.edge();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Ribbon: rounded, with a spine down the middle. The spine gives a long body a direction to
  // read along at zoom levels where the ends are off screen.
  class GeneDrawRibbon extends GeneDrawRounded {
    body(ctx, x, y, w, h) {
      super.body(ctx, x, y, w, h);
      if (w > 6 && h > 6) {
        ctx.save();
        ctx.strokeStyle = this.edge();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h / 2);
        ctx.lineTo(x + w - 2, y + h / 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Hatched: a light fill under diagonal ruling, the way an engraving shades a solid. Gives a
  // print theme texture without another colour.
  class GeneDrawHatch extends GeneDraw {
    body(ctx, x, y, w, h) {
      ctx.save();
      ctx.fillStyle = this.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      if (w > 3 && h > 3) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.strokeStyle = this.edge();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        for (let i = -h; i < w; i += 5) {
          ctx.beginPath();
          ctx.moveTo(x + i, y + h);
          ctx.lineTo(x + i + h, y);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.edge();
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      ctx.restore();
    }
  }

  // Block: solid, hard-edged, heavy border. For the themes whose job is to be unmissable.
  class GeneDrawBlock extends GeneDraw {
    body(ctx, x, y, w, h) {
      ctx.save();
      ctx.fillStyle = this.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.edge();
      ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
      ctx.restore();
    }
  }

  // Which class each theme draws with. A theme not named here falls back to the base, so
  // adding a theme is still one row in GX_THEMES.
  const GX_GENE_DRAW = {
    classic: GeneDraw,
    paper: GeneDrawHatch,
    blueprint: GeneDrawOutline,
    midnight: GeneDrawRounded,
    forest: GeneDrawRibbon,
    sunset: GeneDrawRounded,
    slate: GeneDraw,
    highvis: GeneDrawBlock,
    mono: GeneDrawHatch,
    lab: GeneDrawOutline,
    clinical: GeneDrawBlock
  };

  const geneDrawFor = (themeKey, T) => {
    try {
      const C = GX_GENE_DRAW[themeKey] || GeneDraw;
      return new C(T);
    } catch (e) { return new GeneDraw(T); }
  };
  // ---- ANNOTATION COLOURS ----------------------------------------------------------------
  //
  // The palette every annotation is drawn in: UTRs, introns, TSS and codons, SNPs and indels,
  // oligos, domains, ncRNA classes, the amino-acid row. These were module constants, so a track
  // could be themed to Blueprint or Midnight and its annotations would still be drawn in the
  // one hard-coded scheme -- the gene body changed and everything ON it did not, which on a
  // dark theme also meant dark annotations on a dark ground.
  //
  // `let`, not `const`: draw() assigns them from the active theme, exactly as it already does
  // for GX_T. Same lifetime, same single-track-at-a-time contract.
  let GX_UTR = 'rgba(147,180,216,0.85)', GX_INTRON = '#9fb4c6', GX_GENE = '#16456b', GX_TSS = '#17a39a', GX_START = '#17a39a', GX_STOP = '#9c3350', GX_SNP = '#9c2f45', GX_INS = '#12768f', GX_DEL = '#8c2f42', GX_ASO = '#159a91', GX_SIRNA = '#1897b0', GX_RNABIND = '#b0533f', GX_DOMAIN = '#2bb0bf', GX_ACCENT = '#a86b3e', GX_LNCRNA = '#2bb0bf', GX_MIRNA = '#6e4560', GX_SNRNA = '#9a5f3e', GX_PSEUDO = '#7f96a8', GX_REGION = '#7a4f66', GX_POLYA = '#1aa3bd', GX_AA = 'rgba(176,69,62,0.55)';

  // The scheme above is the DEFAULT set, and the semantic hues in it are load-bearing: teal
  // reads as a start, red as a stop or a deletion, blue as an insertion. A theme should recolour
  // annotations, not relabel them -- so rather than 11 hand-authored sets that would drift apart,
  // each theme keeps these hues and shifts them to sit on its own paper.
  const GX_ANN_DEFAULTS = {
    GX_UTR: 'rgba(147,180,216,0.85)',
    GX_INTRON: '#9fb4c6',
    GX_GENE: '#16456b',
    GX_TSS: '#17a39a',
    GX_START: '#17a39a',
    GX_STOP: '#9c3350',
    GX_SNP: '#9c2f45',
    GX_INS: '#12768f',
    GX_DEL: '#8c2f42',
    GX_ASO: '#159a91',
    GX_SIRNA: '#1897b0',
    GX_RNABIND: '#b0533f',
    GX_DOMAIN: '#2bb0bf',
    GX_ACCENT: '#a86b3e',
    GX_LNCRNA: '#2bb0bf',
    GX_MIRNA: '#6e4560',
    GX_SNRNA: '#9a5f3e',
    GX_PSEUDO: '#7f96a8',
    GX_REGION: '#7a4f66',
    GX_POLYA: '#1aa3bd',
    GX_AA: 'rgba(176,69,62,0.55)',
  };

  // #rrggbb / rgba() -> {r,g,b,a}. Anything unparseable comes back null and is left alone.
  const gxParse = (c) => {
    try {
      const v = ('' + c).trim();
      let m = /^#([0-9a-f]{6})$/i.exec(v);
      if (m) {
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
      }
      m = /^rgba?\(([^)]+)\)$/i.exec(v);
      if (m) {
        const p = m[1].split(',').map((x) => parseFloat(x));
        if (p.length >= 3) return { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0, a: (p.length > 3 ? p[3] : 1) };
      }
    } catch (e) { }
    return null;
  };
  const gxCss = (o) => (o.a >= 1
    ? '#' + [o.r, o.g, o.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
    : 'rgba(' + [o.r, o.g, o.b].map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(',') + ',' + o.a + ')');
  // Perceived lightness, so "is this theme's paper dark?" is answered the way an eye answers it
  // rather than by averaging channels.
  const gxLum = (o) => (0.2126 * o.r + 0.7152 * o.g + 0.0722 * o.b) / 255;
  const gxMix = (a, b, t) => ({
    r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a
  });

  // Fit the default annotation hues to one theme: keep the hue, move it toward the theme's own
  // ink so it stays legible on that theme's paper, and let a theme override any single entry
  // outright via `ann`. The shift is small on purpose -- enough to read, not enough to turn a
  // stop codon into something that is no longer red.
  const gxAnnotationsFor = (T) => {
    const out = {};
    const paper = gxParse((T && T.paper) || '#ffffff');
    const ink = gxParse((T && T.ink) || '#000000');
    const dark = paper ? (gxLum(paper) < 0.5) : false;
    for (const k in GX_ANN_DEFAULTS) {
      let v = GX_ANN_DEFAULTS[k];
      const c = gxParse(v);
      if (c && ink) {
        // On dark paper the default set is too dark to read, so lift it toward the theme's
        // light ink. On light paper a gentler pull keeps the family consistent with the theme
        // without washing the semantics out.
        v = gxCss(gxMix(c, ink, dark ? 0.45 : 0.12));
      }
      out[k] = v;
    }
    // A theme that names a colour outright wins: derivation is a default, not a rule.
    try { if (T && T.ann) { for (const k in T.ann) { if (k in out) out[k] = T.ann[k]; } } } catch (e) { }
    return out;
  };

  // Assign the module-level annotation colours for the theme about to be drawn.
  const gxApplyAnnotations = (T) => {
    const a = gxAnnotationsFor(T);
    GX_UTR = a.GX_UTR;
    GX_INTRON = a.GX_INTRON;
    GX_GENE = a.GX_GENE;
    GX_TSS = a.GX_TSS;
    GX_START = a.GX_START;
    GX_STOP = a.GX_STOP;
    GX_SNP = a.GX_SNP;
    GX_INS = a.GX_INS;
    GX_DEL = a.GX_DEL;
    GX_ASO = a.GX_ASO;
    GX_SIRNA = a.GX_SIRNA;
    GX_RNABIND = a.GX_RNABIND;
    GX_DOMAIN = a.GX_DOMAIN;
    GX_ACCENT = a.GX_ACCENT;
    GX_LNCRNA = a.GX_LNCRNA;
    GX_MIRNA = a.GX_MIRNA;
    GX_SNRNA = a.GX_SNRNA;
    GX_PSEUDO = a.GX_PSEUDO;
    GX_REGION = a.GX_REGION;
    GX_POLYA = a.GX_POLYA;
    GX_AA = a.GX_AA;
  };

  function drawButton(ctx, x, y, w, h, label = "", opts = {}) {
    const r = Math.min(8, h * 0.3);

    const fill = opts.fill || "#9fe0e8";
    const fillTop = opts.fillTop || "#d6f4f7";
    const stroke = opts.stroke || "#1aa3bd";
    const textColor = opts.textColor || "#0a3540";
    const shadow = opts.shadow || "rgba(0,0,0,0.12)";

    ctx.beginPath();
    ctx.moveTo(x + r, y + 1);
    ctx.lineTo(x + w - r, y + 1);
    ctx.quadraticCurveTo(x + w, y + 1, x + w, y + r + 1);
    ctx.lineTo(x + w, y + h - r + 1);
    ctx.quadraticCurveTo(x + w, y + h + 1, x + w - r, y + h + 1);
    ctx.lineTo(x + r, y + h + 1);
    ctx.quadraticCurveTo(x, y + h + 1, x, y + h - r + 1);
    ctx.lineTo(x, y + r + 1);
    ctx.quadraticCurveTo(x, y + 1, x + r, y + 1);
    ctx.closePath();
    ctx.fillStyle = shadow;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    const inset = 2;
    const hiH = Math.max(3, h * 0.42);

    ctx.beginPath();
    ctx.moveTo(x + r, y + inset);
    ctx.lineTo(x + w - r, y + inset);
    ctx.quadraticCurveTo(x + w - inset, y + inset, x + w - inset, y + r);
    ctx.lineTo(x + w - inset, y + hiH);
    ctx.lineTo(x + inset, y + hiH);
    ctx.lineTo(x + inset, y + r);
    ctx.quadraticCurveTo(x + inset, y + inset, x + r, y + inset);
    ctx.closePath();

    ctx.fillStyle = fillTop;
    ctx.fill();

    if (label) {
      ctx.fillStyle = textColor;
      ctx.font = opts.font || "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    }
  }

  function probToColor(p) {
    const hue = Math.max(0, Math.min(120, Math.round(p * 120)));
    return `hsl(${hue}, 95%, 45%)`;
  }

  function drawProbCodingMetrics(graph, tgraph, data, opts = {}) {
    const result = Array.isArray(data.results) ? data.results[0] : data;
    const L = result.length_nt || (result.sequence && result.sequence.length_nt) || 0;
    const orfs = result.orfs || [];

    const colorMap = new Array(L);
    for (const orf of orfs) {
      const p = (orf.pred && orf.pred.prob_coding) || 0;
      const col = probToColor(p);
      const s = Math.max(0, Math.floor(orf.start));
      const e = Math.min(L, Math.floor(orf.end));
      for (let i = s; i < e; i++) colorMap[i] = col;
    }

    const ws = opts.worldStart ?? 0;
    const we = opts.worldEnd ?? L;
    const seqStart = opts.seqStart ?? 0;
    const seqEnd = opts.seqEnd ?? L;
    const xi = opts.xi ?? 0;
    const yFrac = opts.yFrac ?? 0.08;
    const linePx = opts.linePx ?? 4;

    if (typeof drawUnderlineRuns === "function") {
      drawUnderlineRuns(graph, tgraph, ws, we, seqStart, seqEnd, xi, colorMap, yFrac, linePx);
    } else {
      const ctx = graph.ctx;
      ctx.save();
      for (const orf of orfs) {
        const p = (orf.pred && orf.pred.prob_coding) || 0;
        const col = probToColor(p);
        const xs = Math.max(ws, orf.start),
          xe = Math.min(we, orf.end);
        if (xe <= xs) continue;
        const y = tgraph.Y(yFrac);
        ctx.strokeStyle = col;
        ctx.lineWidth = linePx;
        ctx.beginPath();
        ctx.moveTo(tgraph.X(xs), y);
        ctx.lineTo(tgraph.X(xe), y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (opts.labels !== false) {
      const ctx = graph.ctx;
      ctx.save();
      ctx.font = opts.font ?? "10px monospace";
      ctx.fillStyle = opts.textColor ?? GX_T.ink;
      ctx.textBaseline = "bottom";
      const labelY = tgraph.Y(opts.labelYFrac ?? yFrac - 0.01);
      for (const orf of orfs) {
        const p = (orf.pred && orf.pred.prob_coding) || 0;
        const mid = 0.5 * (orf.start + orf.end);
        if (mid < ws || mid > we) continue;
        const text = opts.asPercent === false ? p.toFixed(3) : (p * 100).toFixed(1) + "%";
        const x = tgraph.X(mid);
        const w = ctx.measureText(text).width;
        const xClamped = Math.max(tgraph.X(ws) + w / 2, Math.min(x, tgraph.X(we) - w / 2));
        ctx.fillText(text, xClamped, labelY);
      }
      ctx.restore();
    }
  }




  const drawExonMajorTickAt = (ctx, graph, tgraph, pos, exonIndex, color, font, drawnXs = null, minimumSpacing = 55, track = null) => {
    // The c. ruler. Suppressed when the track asks for it; drawn when it is silent, so a
    // caller that does not pass a track behaves as before.
    try { if (track && track.showCdnaCoords === false) return; } catch (e) { }
    const label = "c." + exonIndex;
    const xWorld = Math.round(tgraph.X(pos));

    const yLabelWorld = tgraph.Y(-0.07);
    const yTickWorld0 = tgraph.Y(-0.05);
    const yTickWorld1 = tgraph.Y(-0.08);

    const screenX = graph.grid.X(xWorld);
    const screenLabelY = graph.grid.Y(yLabelWorld) + 30;

    color = color || GX_T.ink;

    ctx.save();

    ctx.shadowColor = "transparent";
    ctx.font = font || ('15px ' + GFONT_STACK);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    ctx.lineWidth = 1;


    ctx.beginPath();
    ctx.moveTo(
      screenX,
      graph.grid.Y(yTickWorld0)
    );


    ctx.lineTo(
      screenX,
      graph.grid.Y(yTickWorld1)
    );
    ctx.stroke();

    const textWidth = ctx.measureText(label).width;

    const rotatedWidth =
      Math.abs(textWidth * Math.cos(Math.PI / 4)) + 12;

    const requiredSpacing = Math.max(
      minimumSpacing,
      rotatedWidth
    );

    // Suppress this "c." coordinate if it would collide with ANY coordinate already
    // drawn on this same track this frame (drawnXs), not just the previous one.
    const _drawn = Array.isArray(drawnXs) ? drawnXs : (drawnXs == null ? [] : [drawnXs]);
    const labelDrawn = !_drawn.some((px) => Math.abs(screenX - px) < requiredSpacing);

    if (labelDrawn) {
      if (Array.isArray(drawnXs)) drawnXs.push(screenX);
      ctx.translate(screenX, screenLabelY);
      ctx.rotate((-45 * Math.PI) / 180);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, 0, 0);
    }
    ctx.restore();

    return {
      labelDrawn,
      screenX
    };
  }



  function underlineAtWorld(ctx, graph, xWorld, yWorld, text, color, font, offsetPx = 2) {
    const xScreen = Math.round(graph.grid.X(xWorld));
    const yScreen = Math.floor(graph.grid.Y(yWorld)) + offsetPx;

    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(String(text)).width;

    ctx.beginPath();
    ctx.moveTo(xScreen, yScreen);
    ctx.lineTo(xScreen + w, yScreen);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  const IUPAC_DNA = {
    R: "[AG]",
    Y: "[CT]",
    S: "[GC]",
    W: "[AT]",
    K: "[GT]",
    M: "[AC]",
    B: "[CGT]",
    D: "[AGT]",
    H: "[ACT]",
    V: "[ACG]",
    N: "[ACGT]",
  };
  function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return h >>> 0;
  }
  function kmerColor(key) {
    const h = djb2(String(key)) % 360;
    return `hsl(${h} 90% 45% / 0.95)`;
  }
  function paintSpan(cmap, a, b, selStart, selEnd, color) {
    const A = Math.max(selStart, a | 0),
      B = Math.min(selEnd, b | 0);
    for (let i = A; i < B; i++) cmap[i] = color;
  }
  function motifStringToRegex(motif) {
    const m = String(motif).toUpperCase();
    let out = "";
    for (let i = 0; i < m.length;) {
      const ch = m[i];
      if (ch === "*") {
        let j = i;
        while (j < m.length && m[j] === "*") j++;
        const n = j - i;
        out += n === 1 ? "." : `.{${n}}`;
        i = j;
      } else if (IUPAC_DNA[ch]) {
        out += IUPAC_DNA[ch];
        i++;
      } else if ("(){}+?,|".includes(ch)) {
        out += ch;
        i++;
      } else if ("ACGT".includes(ch)) {
        out += ch;
        i++;
      } else {
        out += ch.replace(/[-/\\^$.[\]]/g, "\\$&");
        i++;
      }
    }
    return new RegExp(out, "gi");
  }
  function scanRegexPositions(seq, motif) {
    const s = String(seq).toUpperCase(),
      re = motifStringToRegex(motif),
      spans = [];
    let m;
    while ((m = re.exec(s)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return spans;
  }

  function normalizeAmpliconHits(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === "string") {
      try {
        return normalizeAmpliconHits(JSON.parse(input));
      } catch {
        return [];
      }
    }
    if (typeof input === "object") {
      if (Array.isArray(input.hits)) return input.hits;
      if (Array.isArray(input.results)) return input.results;
    }
    return [];
  }

  function normalizeDiscoveries(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === "string") {
      try {
        return normalizeDiscoveries(JSON.parse(input));
      } catch {
        return [];
      }
    }
    if (typeof input === "object") {
      if (Number.isFinite(input.length)) {
        const out = [];
        for (let i = 0; i < input.length; i++) if (i in input) out.push(input[i]);
        if (out.length) return out;
      }
      const keys = Object.keys(input)
        .filter((k) => String(+k) === k)
        .sort((a, b) => +a - +b);
      if (keys.length) return keys.map((k) => input[k]);
    }
    return [];
  }

  function drawUnderlineRuns(graph, tgraph, worldStart, worldEnd, seqStart, seqEnd, xi, colorMap, yFrac = 0.002, linePx = 4) {
    const offset = Math.floor(xi);
    const startW = Math.floor(worldStart);
    const endW = Math.floor(worldEnd);

    const y = tgraph.Y(yFrac);
    let runColor = null;
    let runStartWorld = null;

    for (let index = startW; index < endW; index++) {
      const seq_index = index - offset;

      const inSel = seq_index >= seqStart && seq_index < seqEnd;
      const col = inSel ? colorMap[seq_index] : null;

      if (col) {
        if (runColor === col) {
        } else {
          if (runColor) {
            graph.drawLine(Math.round(tgraph.X(runStartWorld)), y, Math.round(tgraph.X(index)), y, runColor, linePx);
          }

          runColor = col;
          runStartWorld = index;
        }
      } else {
        if (runColor) {
          graph.drawLine(Math.round(tgraph.X(runStartWorld)), y, Math.round(tgraph.X(index)), y, runColor, linePx);
          runColor = null;
          runStartWorld = null;
        }
      }
    }

    if (runColor) {
      graph.drawLine(Math.round(tgraph.X(runStartWorld)), y, Math.round(tgraph.X(endW)), y, runColor, linePx);
    }
  }

  function generateColorMapFromDiscoveries(sequence, seqStart, seqEnd, discoveries, opts = {}) {
    const seq = Array.isArray(sequence) ? sequence.join("") : String(sequence);
    const n = seq.length;

    let start = Math.max(0, seqStart | 0);
    let end = Math.min(n, seqEnd | 0);
    if (!(end > start)) {
      start = 0;
      end = n;
    }

    const colorMap = new Array(n);
    const items = normalizeDiscoveries(discoveries);
    const typeOrder = ["enriched", "consensus_cluster", "tandem_repeat", "spaced_repeat"];
    let stats = { items: items.length, paintedBases: 0, spansTried: 0, spansPainted: 0 };

    const motifColorer = makeMotifColorer({
      keyFn: opts.motifKeyFn,
      s: opts.paletteS ?? 0.68,
      l: opts.paletteL ?? 0.55,
    });

    const rawSpans = [];

    function paintSpanWithDisc(a, b, color, disc) {
      const i0 = Math.max(start, Math.floor(a));
      const i1 = Math.min(end, Math.floor(b));
      if (i1 <= i0) return;
      for (let i = i0; i < i1; i++) colorMap[i] = color;
      rawSpans.push({ iStart: i0, iEnd: i1, color, disc });
    }

    for (const type of typeOrder) {
      for (const d of items) {
        if (!d || d.type !== type) continue;

        const color = motifColorer.get(d);

        const k = typeof d.k === "number" && d.k > 0 ? d.k : d.details && d.details.seed ? String(d.details.seed).length : 0;

        if (Array.isArray(d.positions) && d.positions.length) {
          for (const p of d.positions) {
            if (Array.isArray(p) && p.length === 2) {
              stats.spansTried++;
              paintSpanWithDisc(p[0], p[1], color, d);
              stats.spansPainted++;
            } else if (Number.isFinite(p) && k > 0) {
              stats.spansTried++;
              paintSpanWithDisc(p, p + k, color, d);
              stats.spansPainted++;
            } else if (p && Number.isFinite(p.start) && Number.isFinite(p.end)) {
              stats.spansTried++;
              paintSpanWithDisc(p.start, p.end, color, d);
              stats.spansPainted++;
            }
          }
        } else if (d.motif) {
          const spans = scanRegexPositions(seq, d.motif);
          for (const [a, b] of spans) {
            stats.spansTried++;
            paintSpanWithDisc(a, b, color, d);
            stats.spansPainted++;
          }
        }
      }
    }

    rawSpans.sort((A, B) => (A.color > B.color) - (A.color < B.color) || A.iStart - B.iStart);

    const hitBoxes = [];
    let cur = null;

    const discKey = (d) => `${d.type ?? ""}|${d.motif ?? ""}|${d.id ?? ""}|${d.k ?? ""}`;
    const toLightDisc = (d) => ({
      type: d.type,
      motif: d.motif,
      k: typeof d.k === "number" ? d.k : d.details && d.details.seed ? String(d.details.seed).length : undefined,
      id: d.id,
      score: d.score,
      details: d.details ? { ...d.details } : undefined,
    });

    function pushOrMerge(span) {
      if (!cur) {
        cur = {
          iStart: span.iStart,
          iEnd: span.iEnd,
          color: span.color,
          discoveries: new Map([[discKey(span.disc), toLightDisc(span.disc)]]),
        };
        return;
      }
      const contiguous = span.iStart <= cur.iEnd;
      const sameColor = span.color === cur.color;
      if (sameColor && contiguous) {
        cur.iEnd = Math.max(cur.iEnd, span.iEnd);
        cur.discoveries.set(discKey(span.disc), toLightDisc(span.disc));
      } else {
        hitBoxes.push({ ...cur, discoveries: Array.from(cur.discoveries.values()) });
        cur = {
          iStart: span.iStart,
          iEnd: span.iEnd,
          color: span.color,
          discoveries: new Map([[discKey(span.disc), toLightDisc(span.disc)]]),
        };
      }
    }

    for (const span of rawSpans) pushOrMerge(span);
    if (cur) hitBoxes.push({ ...cur, discoveries: Array.from(cur.discoveries.values()) });

    let screenBoxes;
    const hasIndexToScreenX = typeof opts.indexToScreenX === "function";
    const hasWorldProject = typeof opts.worldX === "function" && typeof opts.screenX === "function";
    const canProject = (hasIndexToScreenX || hasWorldProject) && Number.isFinite(opts.baseYPixel);

    if (canProject) {
      const y = opts.baseYPixel;
      const w10 = Number.isFinite(opts.segmentWidthPx) ? opts.segmentWidthPx : 10;
      const padY = Number.isFinite(opts.hitboxPadY) ? opts.hitboxPadY : 6;

      const ix2px = (idx) => {
        if (hasIndexToScreenX) return opts.indexToScreenX(idx);
        const xw = opts.worldX(idx);
        return opts.screenX(xw);
      };

      screenBoxes = [];
      for (const hb of hitBoxes) {
        const sx1First = Math.floor(ix2px(hb.iStart));
        const sx1Last = Math.floor(ix2px(hb.iEnd - 1));
        const x1 = sx1First;
        const x2 = sx1Last + w10;
        const y1 = y - padY;
        const y2 = y + padY;
        if (Number.isFinite(x1) && Number.isFinite(x2) && x2 > x1) {
          screenBoxes.push({
            x1,
            y1,
            x2,
            y2,
            color: hb.color,
            iStart: hb.iStart,
            iEnd: hb.iEnd,
            discoveries: hb.discoveries,
          });
        }
      }
    }

    if (opts.debug) {
      const painted = colorMap.slice(start, end).filter(Boolean).length;
      stats.paintedBases = painted;
      console.log("[generateColorMapFromDiscoveries] stats:", stats, "window:", { start, end }, "hitBoxes:", hitBoxes.length, "screenBoxes:", screenBoxes?.length ?? 0, "uniqueMotifs:", motifColorer.map.size);
    }

    return { colorMap, hitBoxes, screenBoxes, motifColorMap: Object.fromEntries(motifColorer.map) };
  }

  function paintSpan(colorMap, a, b, start, end, color) {
    const i0 = Math.max(start, Math.floor(a));
    const i1 = Math.min(end, Math.floor(b));
    for (let i = i0; i < i1; i++) colorMap[i] = color;
  }

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function goldenHue(i) {
    const GOLDEN_ANGLE = 137.50776405003785;
    return (i * GOLDEN_ANGLE) % 360;
  }

  function hslToHex(h, s, l) {
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0,
      g = 0,
      b = 0;
    if (0 <= hp && hp < 1) [r, g, b] = [c, x, 0];
    else if (1 <= hp && hp < 2) [r, g, b] = [x, c, 0];
    else if (2 <= hp && hp < 3) [r, g, b] = [0, c, x];
    else if (3 <= hp && hp < 4) [r, g, b] = [0, x, c];
    else if (4 <= hp && hp < 5) [r, g, b] = [x, 0, c];
    else if (5 <= hp && hp < 6) [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    const R = Math.round((r + m) * 255);
    const G = Math.round((g + m) * 255);
    const B = Math.round((b + m) * 255);
    return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
  }

  function makeMotifColorer({ keyFn, s = 0.68, l = 0.55 } = {}) {
    const map = new Map();
    const order = [];
    const defaultKeyFn = (d) => `${d.type ?? ""}|${d.motif ?? ""}`;
    const getKey = keyFn || defaultKeyFn;

    return {
      get(d) {
        const key = getKey(d);
        if (map.has(key)) return map.get(key);

        const idx = order.push(key) - 1;

        const h = goldenHue(idx);

        const color = hslToHex(h, s, l);
        map.set(key, color);
        return color;
      },
      map,
    };
  }

  // Draw text CENTERED horizontally on a graph-world x position (drawString is only
  // left-anchored). Used to center each amino acid over the middle of its codon.
  // worldXCenter / worldY are graph-world coords (tgraph.X / tgraph.Y outputs).
  function drawCenteredWorldText(graph, text, worldXCenter, worldY, color, font) {
    try {
      const ctx = graph.canvas && graph.canvas.getCTX ? graph.canvas.getCTX() : null;
      if (ctx) {
        ctx.save();
        ctx.shadowBlur = 0;
        if (font) ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, graph.X(worldXCenter), graph.Y(worldY) - 5);
        ctx.restore();
        return;
      }
    } catch (e) { }
    // Fallback: approximate centering with the left-anchored drawString.
    graph.drawString(text, worldXCenter - 0.3, worldY, color, font);
  }

  function proteinFromORF(track, options = {}) {
    const { threeLetter = false } = options;

    const AA3 = {
      A: "Ala",
      R: "Arg",
      N: "Asn",
      D: "Asp",
      C: "Cys",
      E: "Glu",
      Q: "Gln",
      G: "Gly",
      H: "His",
      I: "Ile",
      L: "Leu",
      K: "Lys",
      M: "Met",
      F: "Phe",
      P: "Pro",
      S: "Ser",
      T: "Thr",
      W: "Trp",
      Y: "Tyr",
      V: "Val",
    };

    if (!track.orf || !track.orf.cdsi) {
      if (typeof track.generateORF === "function") {
        track.generateORF();
      }
    }

    const cdsi = track.orf && Array.isArray(track.orf.cdsi) ? track.orf.cdsi : [];
    if (!cdsi.length) return "";

    const codons = cdsi.filter((entry) => entry.ci === 0);
    const peptide = [];
    for (const entry of codons) {
      const aa = entry.aa;

      // Skip START (M) and STOP (*)
      if (aa === "START" || aa === "STOP") continue;

      peptide.push(threeLetter ? AA3[aa] || aa : aa);
    }

    return peptide.join("");
  }

  const getGlowForCharDiff = (charDiff) => {
    if (charDiff > 100) {
      return { color: GX_SNP, strength: 1.0 };
    }
    if (charDiff > 20) {
      return { color: GX_RNABIND, strength: 0.75 };
    }
    if (charDiff > 10) {
      return { color: GX_ACCENT, strength: 0.5 };
    }
    return null;
  };

  function drawSnpLollipopsWide(graph, ctx, selectedTrack) {
    const STYLE = {
      lineWidth: 1.25,
      stroke: GX_T.ring,
      fillFallback: GX_INS,
      highlightStroke: GX_ACCENT,
      shadowColor: "rgba(0,0,0,0.25)",
      shadowBlur: 6,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      dashIndel: [3, 2],
      dashDefault: [],
      baseR: 4,
      maxR: 8,
      pad: 2,
      minStem: 10,

      poorGlowColor: "rgba(192,57,43,0.85)",
      poorGlowBlurMin: 6,
      poorGlowBlurMax: 18,
      poorGlowPeriodMs: 900,
    };

    const screencell = graph.screencell ?? graph.grid?.screencell;
    if (screencell != null && screencell > 5) return;

    const gwcxs = graph.Xwc(0);
    if (gwcxs == null) return;
    const gwcxf = graph.Xwc(graph.grid?.width ?? 0);
    if (gwcxf == null) return;

    const tg = selectedTrack?.tgraph;
    if (!tg) return;

    const twcxs = tg.Xwc(gwcxs - 2 * tg.xi);
    const twcxf = tg.Xwc(gwcxf - 2 * tg.xi);
    if (twcxs == null || twcxf == null) return;

    const snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
    if (!snpsv?.length) return;

    const placedUp = [];
    const placedDown = [];

    const drawCircle = (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    const drawTriangleUp = (x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.lineTo(x + r, y + r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    const drawTriangleDown = (x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.lineTo(x - r, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    const drawGlyphForType = (s, x, y, r) => {
      switch (s.type) {
        case "ins":
          return drawTriangleUp(x, y, r);
        case "del":
          return drawTriangleDown(x, y, r);
        case "snp":
        default:
          return drawCircle(x, y, r);
      }
    };

    const getTypeColor = (s) => {
      switch (s.type) {
        case "ins":
          return GX_INS;
        case "del":
          return GX_DEL;
        case "snp":
        default:
          return GX_SNP;
      }
    };

    const getCharDiff = (s) => {
      const ref = s.reference ?? s.reference0 ?? "";
      const alt = s.alternate ?? s.alternate0 ?? "";
      return Math.abs((ref?.length ?? 0) - (alt?.length ?? 0));
    };

    const getPhaseDirs = (s) => {
      const p = Number.isFinite(+s.phase) ? +s.phase : 0;
      switch (p) {
        case 2:
          return [];
        case 3:
          return [-1];
        case 1:
          return [+1];
        case 0:
        default:
          return [-1];
      }
    };

    const trackYminWorld = tg.ymin != null ? tg.ymin : tg.y0 != null ? tg.y0 : null;

    const trackYminScreen = trackYminWorld != null ? graph.Y(tg.Y(trackYminWorld)) : (graph.grid?.height ?? 0);

    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    const maxStem = Math.min(80, Math.max(40, Math.floor(graph.screenHeight(tg.height) * 0.15)));

    // Track moved off-screen vertically: don't draw its SNPs at all. The per-lollipop
    // edge clamping below (topBound/bottomBound) would otherwise pin every marker to the
    // canvas edge, leaving them stacked at the bottom of an off-screen track.
    const __canvasH = (graph.grid && graph.grid.height != null) ? graph.grid.height : (graph.canvas ? graph.canvas.height : 0);
    if (__canvasH && (trackYminScreen < -2 || trackYminScreen > __canvasH + 2)) return;

    const overlaps = (placedBalls, nx, ny, r) => {
      for (const b of placedBalls) {
        const dx = nx - b.x;
        const dy = ny - b.y;
        const minD = r + b.r + STYLE.pad;
        if (dx * dx + dy * dy < minD * minD) return true;
      }
      return false;
    };

    const isPoorQuality = (s) => {
      const q = s?.quality ?? "unknown";

      if (typeof q === "number") return q <= 0;
      const qs = String(q).trim().toLowerCase();

      return qs === "low" || qs === "poor" || qs === "bad";
    };

    const pulse01 = (tMs, periodMs) => {
      const t = (tMs % periodMs) / periodMs;
      return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    };

    ctx.save();

    ctx.lineWidth = STYLE.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = STYLE.stroke;
    ctx.fillStyle = STYLE.fillFallback;

    // Selection / focus spotlight: when a variant is selected (click / lasso) or focused
    // (tour/menu), fade + gray every OTHER variant so the chosen one pops out. Mirrors
    // snpindel.js draw(). The spotlight state lives on the GENE, but this renderer receives the
    // GRID as `graph` — resolve the gene via its back-reference (set in gene.js).
    const __G = graph.__gene || graph;
    const __focusOn = !!(__G.__focusSnp && __G.__focusUntil && Date.now() < __G.__focusUntil);
    const __selOn = !!__G.__snpSelectionActive;
    const __spotAny = __focusOn || __selOn;

    for (const s of snpsv) {
      // Zoomed-out uses a different lollipop geometry than the zoomed-in marker. Rebuild the
      // screen hit region from the ACTUAL drawn lollipop head(s) below so both click-select
      // (getSNPs -> over -> _hitScreen) and the freehand lasso hit the visible marker, not the
      // world point down at the track baseline (which is nowhere near the raised head).
      s._hitScreen = null;
      // Color by clinical significance (grey / blue / red+glow), same as the zoomed-in
      // marker; fall back to the type color when there's no clinsigStyle.
      const csStyle = (typeof s.clinsigStyle === 'function') ? s.clinsigStyle() : null;
      const baseColor = csStyle ? csStyle.color : getTypeColor(s);

      // Spotlight state for this marker: is it the chosen one, or dimmed background?
      const __inSpot = (__focusOn && __G.__focusSnp === s) || (__selOn && s.highlight);
      const __dimmed = __spotAny && !__inSpot;
      const effColor = __dimmed ? 'rgba(148,163,184,0.95)' : baseColor;   // opaque; fade via globalAlpha only

      ctx.strokeStyle = STYLE.stroke;
      ctx.fillStyle = effColor;

      ctx.setLineDash(s.type === "ins" || s.type === "del" ? STYLE.dashIndel : STYLE.dashDefault);

      const x = graph.X(tg.X(s.xi));
      const y = graph.Y(tg.Y(s.y));
      const cx = x + 1;

      const len = s.type === "snp" ? 1 : Math.abs(s.len ?? 1);
      const r = s.type === "snp" ? STYLE.baseR : Math.min(STYLE.maxR, Math.max(STYLE.baseR, STYLE.baseR + Math.floor(len / 5)));

      const charDiff = getCharDiff(s);
      const glow = getGlowForCharDiff(charDiff);

      const dirs = getPhaseDirs(s);
      if (!dirs.length) continue;

      const poor = isPoorQuality(s);
      const p = poor ? pulse01(now, STYLE.poorGlowPeriodMs) : 0;
      const poorBlur = poor ? STYLE.poorGlowBlurMin + (STYLE.poorGlowBlurMax - STYLE.poorGlowBlurMin) * p : 0;

      for (const dir of dirs) {
        ctx.save();

        // Background variants fade back; the selected/focused one stays fully opaque.
        if (__dimmed) ctx.globalAlpha = 0.3;

        const edir = -dir;
        const cy = trackYminScreen;

        const minLen = STYLE.minStem;
        const maxLen = maxStem;

        const yForLen = edir > 0 ? -s.y : s.y;
        const baseLen = minLen + Math.abs(Math.floor((yForLen * 7) % (maxLen - minLen)));

        let targetLen = Math.max(minLen, Math.min(maxLen, baseLen));
        let bx = cx;
        let by = cy + edir * targetLen;

        const topBound = 0 + r + 1;
        const bottomBound = graph.grid?.height != null ? graph.grid.height - r - 1 : cy + maxLen + r + 1;

        if (edir < 0) {
          if (by - r < topBound) {
            targetLen = Math.min(targetLen, cy - (topBound + r));
            by = cy + edir * targetLen;
          }
        } else {
          if (by + r > bottomBound) {
            targetLen = Math.min(targetLen, bottomBound - r - cy);
            by = cy + edir * targetLen;
          }
        }

        const placedBalls = edir < 0 ? placedUp : placedDown;

        let attempts = 0;
        const step = 2;
        let triedShorten = false,
          triedLengthen = false;
        let preferShorten = true;

        while (overlaps(placedBalls, bx, by, r) && attempts < 400) {
          attempts++;

          if (preferShorten) {
            targetLen = Math.max(minLen, targetLen - step);
            by = cy + edir * targetLen;

            if (targetLen <= minLen) {
              triedShorten = true;
              preferShorten = false;
            }
          } else {
            targetLen = Math.min(maxLen, targetLen + step);
            by = cy + edir * targetLen;

            if (targetLen >= maxLen) {
              triedLengthen = true;
              preferShorten = true;
            }
          }

          if (triedShorten && triedLengthen) break;
        }

        const lineTopY = by - edir * r;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, lineTopY);
        ctx.stroke();

        ctx.setLineDash(STYLE.dashDefault);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";

        if (__dimmed) {
          // Dimmed background variant: no glow, it should recede.
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (__inSpot) {
          // Selected/focused variant pops with a bright accent halo.
          ctx.shadowColor = (csStyle && csStyle.glow) ? csStyle.glow : GX_ACCENT;
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (csStyle && csStyle.glow) {
          // Pathogenic red glow.
          ctx.shadowColor = csStyle.glow;
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (poor) {
          ctx.shadowColor = STYLE.poorGlowColor;
          ctx.shadowBlur = poorBlur;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (glow) {
          ctx.shadowColor = glow.color ?? STYLE.shadowColor;
          ctx.shadowBlur = glow.blur ?? STYLE.shadowBlur;
          ctx.shadowOffsetX = glow.dx ?? STYLE.shadowOffsetX;
          ctx.shadowOffsetY = glow.dy ?? STYLE.shadowOffsetY;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        ctx.fillStyle = effColor;
        // The chosen variant draws a touch larger so it reads as raised above the rest.
        drawGlyphForType(s, bx, by, __inSpot ? r + 1.5 : r);

        if (s.highlight || __inSpot) {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = STYLE.highlightStroke;
          ctx.lineWidth = __inSpot ? 3 : 2;
          ctx.beginPath();
          ctx.arc(bx, by, r + (__inSpot ? 4 : 2), 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = STYLE.lineWidth;
        }

        ctx.restore();
        placedBalls.push({ x: bx, y: by, r });

        // Record the drawn head as this SNP's screen hit region (union across phase dirs), so
        // click-selection and lasso test the visible lollipop head. Includes the highlight ring.
        const __hr = r + 3;
        const __hx0 = bx - __hr, __hy0 = by - __hr, __hx1 = bx + __hr, __hy1 = by + __hr;
        if (!s._hitScreen) {
          s._hitScreen = { x: __hx0, y: __hy0, w: __hr * 2, h: __hr * 2 };
        } else {
          const _x0 = Math.min(s._hitScreen.x, __hx0);
          const _y0 = Math.min(s._hitScreen.y, __hy0);
          const _x1 = Math.max(s._hitScreen.x + s._hitScreen.w, __hx1);
          const _y1 = Math.max(s._hitScreen.y + s._hitScreen.h, __hy1);
          s._hitScreen = { x: _x0, y: _y0, w: _x1 - _x0, h: _y1 - _y0 };
        }
      }
    }

    ctx.restore();
  }

  function drawFolderBackground(ctx, x, y, w, h) {
    const r = Math.min(8, h * 0.3);
    const tabH = h * 0.45;
    const tabW = Math.min(40, w * 0.25);
    const tabLeft = r * 1.5;

    ctx.beginPath();

    ctx.moveTo(x + r, y + tabH);

    ctx.lineTo(x + tabLeft, y + tabH);
    ctx.lineTo(x + tabLeft, y);
    ctx.lineTo(x + tabLeft + tabW, y);
    ctx.lineTo(x + tabLeft + tabW, y + tabH);

    ctx.lineTo(x + w - r, y + tabH);
    ctx.quadraticCurveTo(x + w, y + tabH, x + w, y + tabH + r);

    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);

    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);

    ctx.lineTo(x, y + tabH + r);
    ctx.quadraticCurveTo(x, y + tabH, x + r, y + tabH);

    ctx.closePath();

    ctx.fillStyle = "#9fe0e8";
    ctx.strokeStyle = "#1aa3bd";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#35c6d6";
    ctx.fillRect(x + tabLeft + 2, y + 2, tabW - 4, tabH - 4);
  }

  function drawFolderIcon(ctx, x, y, size) {
    const r = size * 0.15;
    const tabH = size * 0.35;
    const tabW = size * 0.55;
    const tabLeft = size * 0.15;

    ctx.beginPath();

    ctx.moveTo(x + r, y + tabH);
    ctx.lineTo(x + tabLeft, y + tabH);
    ctx.lineTo(x + tabLeft, y);
    ctx.lineTo(x + tabLeft + tabW, y);
    ctx.lineTo(x + tabLeft + tabW, y + tabH);
    ctx.lineTo(x + size - r, y + tabH);
    ctx.quadraticCurveTo(x + size, y + tabH, x + size, y + tabH + r);
    ctx.lineTo(x + size, y + size - r);
    ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
    ctx.lineTo(x + r, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - r);
    ctx.lineTo(x, y + tabH + r);
    ctx.quadraticCurveTo(x, y + tabH, x + r, y + tabH);
    ctx.closePath();

    ctx.fillStyle = "#9fe0e8";
    ctx.strokeStyle = "#1aa3bd";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#35c6d6";
    ctx.fillRect(x + tabLeft + 1, y + 1, tabW - 2, tabH - 2);
  }

  let Track = class Track {
    name = "untitled";
    geneID;
    track_type = null;
    createdBy = null;
    createdDate = null;

    ampliconResults = [];

    xi;
    xf;
    strand;
    color = GX_GENE;
    y = 1;
    annotations = [];
    oligos = [];
    snpindels = [];
    showPlots = true;
    plots = [];
    sequence;
    markstart;
    markend;
    highlightstart;
    highlightend;
    tgraph;
    description;
    genomicsCoord = [];
    showName = false;
    targetPhase = null;
    targetVariant = null;
    hideTrackCoords = true;
    showResizeBar = true;
    trackRef = null;
    showTrackRefMap = false;
    structures = [];
    highlight_features = {};
    track_layers = [];
    track = [];
    chr;
    species;
    showSnpIndels = true;
    showLayers = true;
    showOfftargets = true;
    showOligoMap = false;
    showArc = false;
    orf;
    orfhash;
    id = uuid();
    uid = uuid();
    transcriptID;
    highlightIndex;
    default_track_height = -2;
    showAnnotaions = true;
    icons = [];

    constructor(name, xi, xf, y, strand) {
      this.name = "" + name;
      this.xi = xi;
      this.xf = xf;
      this.y = y;
      this.strand = strand;
      this.tgraph = new MGrid(0, y, xf - xi, -1);
      this.tgraph.xi = 0;
      this.tgraph.setxmax(xf);
      this.tgraph.setymax(1);
      this.tgraph.setxmin(xi);
      this.tgraph.setymin(0);
      this.tgraph.setSize(xf - xi, -1);
      this.tgraph.setInset(0, 0);
      this.tgraph.snapPixels = false;   // tgraph.X returns WORLD coords (intermediate) — never snap these
      this.tgraph.height = this.default_track_height;
      this.tgraph.rescale();
      this.structure = null;

      if (this.name && this.name.startsWith("/")) {
        let lastIndex = this.name.lastIndexOf("/");
        if (lastIndex > 0) this.name = this.name.substring(lastIndex + 1);
      }
    }

    addIcon(glyph) {
      this.icons.push(glyph);
    }

    potential_motifds_in_selected_space = null;
    async findMotifsFromSelectedSequence() {
      try {
        this.potential_motifds_in_selected_space = [];
        if (this.markstart >= 0 && this.markend >= this.markstart) {
          let seq = this.getSequenceRange(this.markstart, this.markend);
          this.potential_motifds_in_selected_space = await exec("py/memphis/motifs/finder.py", seq);

          if (!this.potential_motifds_in_selected_space) {
            this.potential_motifds_in_selected_space = [];
          }
        }
      } catch (exception) {
        this.potential_motifds_in_selected_space = [];
      }
    }

    getY(ygraph) {
      let ycoord = -1 * this.tgraph.Ywc(this.tgraph.height - ygraph);
      return ycoord;
    }

    isSelected() {
      return this.showResizeBar;
    }

    calculatePSIForAllExons(polygons) {
      let exons = this.getExonsBetweenTranslationOrTSSAndSTOP();
      if (!exons || exons.length <= 0) {
        return null;
      }
      let psiPolygon = [];

      let transcriptStart = exons[0].xi;
      let transcriptEnd = exons[exons.length - 1].xf;

      let exonindex = 1;
      for (let exon of exons) {
        let exonStart = exon.xi;
        let exonEnd = exon.xf;

        let inclusionTotal = 0;
        let exclusionTotal = 0;

        for (let polygon of polygons) {
          let position = polygon.x;
          let coverage = polygon.y;

          if (position >= exonStart && position <= exonEnd) {
            inclusionTotal += coverage;
          } else if (position < transcriptStart || position > transcriptEnd) {
            exclusionTotal += coverage;
          }
        }

        let totalCoverage = inclusionTotal + exclusionTotal;
        let psi = totalCoverage === 0 ? null : inclusionTotal / totalCoverage;

        psiPolygon.push({
          xi: exonStart,
          xf: exonEnd,
          psi: psi,
          index: exonindex,
        });
        exonindex++;
      }
      return psiPolygon;
    }
    async cutTrack() {
      let xstart = this.markstart;
      let xend = this.markend;
      if (xend < xstart) {
        return;
      }

      let subTrackLeft = new Track(this.name + "_l", this.xi, xstart - 1, this.y, this.strand);
      let subTrackRight = new Track(this.name + "_r", xend + 1, this.xf, this.y, this.strand);

      const filterSubObjects = (subTrack, start, end) => {
        subTrack.annotations = this.annotations.filter((o) => o.xi >= start && o.xf <= end);
        subTrack.oligos = this.oligos.filter((o) => o.xi >= start && o.xf <= end);
        subTrack.snpindels = this.snpindels.filter((o) => o.xi >= start && o.xf <= end);
        subTrack.structures = this.structures.filter((o) => o.xi >= start && o.xf <= end);
        subTrack.track_layers = this.track_layers.filter((o) => o.xi >= start && o.xf <= end);
      };
      filterSubObjects(subTrackLeft, this.xi, xstart - 1);
      filterSubObjects(subTrackRight, xend + 1, this.xf);

      subTrackRight.tgraph.xi = subTrackLeft.tgraph.xi + subTrackLeft.tgraph.width;

      return [subTrackLeft, subTrackRight];
    }

    cutSequence__(xi, xf) {
      if (xf < this.xf && xi > this.xi) {
        let fsequence = this.sequence.substring(this.tgraph.X(xi), this.tgraph.X(xf));
        let lsequence = this.sequence.substring(this.tgraph.X(xf) + 1);
        this.sequence = fsequence + lsequence;

        let diff = xf - xi;
        this.xf -= diff;
        this.tgraph.setxmax(this.xf);
        this.tgraph.setSize(this.xf - this.xi, -1);
        this.tgraph.rescale();

        const removeWithinRange = (arr) => {
          console.log(" -=== ");
          return arr.filter((o) => {
            console.log(" --> " + o.xi);

            o.xi <= xi || o.xf >= xf;
          });
        };

        this.oligos = removeWithinRange(this.oligos).map((o) => {
          if (o.xi > xf) {
            o.xi -= diff;
            o.xf -= diff;
          } else if (o.xf > xf) {
            o.xf -= diff;
            if (o.xf < o.xi) {
              o.xf = o.xi;
            }
          }
          return o;
        });

        this.annotations = removeWithinRange(this.annotations).map((o) => {
          if (o.xi > xf) {
            o.xi -= diff;
            o.xf -= diff;
          } else if (o.xf > xf) {
            o.xf -= diff;
            if (o.xf < o.xi) {
              o.xf = o.xi;
            }
          }
          return o;
        });

        this.snpindels = removeWithinRange(this.snpindels).map((o) => {
          if (o.xi > xf) {
            o.xi -= diff;
            o.xf -= diff;
          } else if (o.xf > xf) {
            o.xf -= diff;
            if (o.xf < o.xi) {
              o.xf = o.xi;
            }
          }
          return o;
        });

        if (this.structures.length > 0) {
          this.structures = removeWithinRange(this.structures).map((o) => {
            if (o.xi > xf) {
              o.xi -= diff;
              o.xf -= diff;
            } else if (o.xf > xf) {
              o.xf -= diff;
              if (o.xf < o.xi) {
                o.xf = o.xi;
              }
            }
            return o;
          });
        }

        if (this.track_layers && this.track_layers.length > 0) {
          let ntra = [];
          for (let tr of this.track_layers) {
            let tls = tr.copyWithinRange(tr.tgraph.xi, xi);
            let tls2 = tr.copyWithinRange(xf + 1, tr.tgraph.xf);
            ntra.push(tls);
            ntra.push(tls2);
          }
          this.track_layers = ntra.filter((layer) => layer);
        }
      }
    }

    cutSequence(xi, xf) {
      xi = Math.floor(xi);
      xf = Math.floor(xf);
      if (xf < this.xf && xi > this.xi) {
        let cutoutsequence = this.sequence.substring(Math.floor(this.tgraph.X(xi)), Math.floor(this.tgraph.X(xf)));
        let fsequence = this.sequence.substring(0, Math.floor(this.tgraph.X(xf)));
        let lsequence = this.sequence.substring(Math.floor(this.tgraph.X(xf)) + 1);
        this.sequence = fsequence + lsequence;

        let diff = xf - xi;
        this.xf -= diff;
        this.tgraph.setxmax(this.xf);
        this.tgraph.setSize(this.xf - this.xi, this.tgraph.height);
        this.tgraph.rescale();
        for (let o of this.oligos) {
          if (o.xi > xf) {
            o.xi -= diff;
            o.xf -= diff;
          } else if (o.xf > xf) {
            o.xf -= diff;
            if (o.xf < o.xi) {
              o.xf = o.xi;
            }
          }
        }
        for (let o of this.annotations) {
          if (o.xi > xf) {
            o.xi -= diff;
            o.xf -= diff;
          } else if (o.xf > xf) {
            o.xf -= diff;
            if (o.xf < o.xi) {
              o.xf = o.xi;
            }
          }
        }
        for (let o of this.snpindels) {
          if (o.xi > xf) {
            o.xi -= diff;
            o.xf -= diff;
          } else if (o.xf > xf) {
            o.xf -= diff;
            if (o.xf < o.xi) {
              o.xf = o.xi;
            }
          }
        }
        if (this.structures.length > 0) {
        }

        if (this.track_layers && this.track_layers.length > 0) {
          let ntra = [];
          for (let tr of this.track_layers) {
            let tls = tr.copyWithinRange(tr.tgraph.xi, xi);
            let tls2 = tr.copyWithinRange(xf + 1, tr.tgraph.xf);

            ntra.push(tls);
            ntra.push(tls2);
          }
          this.track_layers = [];

          this.track_layers.push(...ntra);
        }

        if (this.orf) {
          this.generateORF();
        }
      }
    }

    getORFPeptide() {
      let aa = "";
      for (let oor of this.orf.cdsi) {
        for (let oor of this.orf.cdsi) {
          aa += oor.aa;
        }
      }
      return aa;
    }

    setTrackCoordinates(start, end) {
      if (end < 0) {
        this.tgraph.height = this.default_track_height;
        this.tgraph.xi = start;
        this.tgraph.rescale();
      } else {
        this.tgraph.height = this.default_track_height;
        this.tgraph.xi = start;
        this.tgraph.width = end - start;
        this.tgraph.rescale();
      }
    }

    addLayer(t) {
      this.track_layers.push(t);
    }

    containsIntrons() {
      let g = this.getIntrons(0);
      if (g && g.length > 0) {
        return true;
      } else {
        return false;
      }
    }

    getIntrons(offset) {
      if (!offset) {
        offset = 0;
      }
      let sorted_annotations = this.annotations;
      if (this.strand > 0) {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      } else {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });
      }
      let exons = [];
      for (let a of sorted_annotations) {
        if (a.type === "Exon") {
          exons.push(a);
        }
      }
      let index = 1;
      let introns = [];
      let prev = null;
      let smatch = [];
      for (let s of exons) {
        if (prev) {
          let ai = prev.xf - offset;
          let af = s.xi + offset;
          if (this.strand < 0) {
            ai = s.xf - offset;
            af = prev.xi + offset;
          }
          let seq = this.getSequenceRange(ai, af);
          introns.push({
            index: index++,
            xi: ai,
            xf: af,
            seq: seq,
          });
          prev = s;
        } else {
          prev = s;
        }
      }
      return introns;
    }

    highlightIntron(x) {
      this.markstart = -1;
      this.markend = -1;
      let pex = null;
      let sorted_annotations = this.annotations;
      sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      for (let a of sorted_annotations) {
        if (a.type === "Exon") {
          if (!pex) {
            pex = a;
          } else {
            if (pex.xf < x && a.xi > x) {
              this.markstart = pex.xf;
              this.markend = a.xi;
            }
          }
          pex = a;
        }
      }
    }

    highlightAnnotation(x) {
      this.markstart = -1;
      this.markend = -1;
      let sorted_annotations = this.annotations;
      sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      for (let a of sorted_annotations) {
        if (a.xi < x && a.xf > x) {
          this.markstart = a.xi;
          this.markend = a.xf;
        }
      }
    }
    flipAnnotationsHorizontal() {
      if (!Array.isArray(this.annotations)) return;

      for (let a of this.annotations) {
        const tmp = a.xi;
        a.xi = a.xf;
        a.xf = tmp;
      }
    }

    // Correctly translate the CDS from the SPLICED cDNA. `this.sequence` is the
    // spliced transcript (coding orientation) while the exon / start_codon (TSS) /
    // stop_codon (STOP) annotations are GENOMIC — so a genomic-offset walk into the
    // cDNA (what generateORF/cdsi do) reads out of frame for multi-exon genes. Here
    // we build an exon map (cDNA index <-> genomic position, in transcript order) and
    // translate the real CDS. Returns { protein, codonPos, cdsStartCdna }, where
    // codonPos[k] is the GENOMIC position of residue k's codon first base (used to
    // place protein-domain / site annotations). Handles + and - strand.
    getCDS() {
      const empty = { protein: '', codonPos: [], cdsStartCdna: -1 };
      const seq = ('' + (this.sequence || '')).toUpperCase();
      if (seq.length < 3) return empty;

      const exons = this.annotations
        .filter((a) => a.type === 'Exon')
        .map((a) => ({ xi: Math.min(a.xi, a.xf), xf: Math.max(a.xi, a.xf) }));
      if (!exons.length) return empty;

      let tss = null, stop = null;
      for (const a of this.annotations) {
        const ty = ('' + a.type).toLowerCase();
        if (ty === 'tss') tss = a;
        else if (ty === 'stop') stop = a;
      }

      const plus = this.strand >= 0;
      exons.sort((a, b) => (plus ? a.xi - b.xi : b.xi - a.xi));

      // g[cdnaIndex] = genomic position, in transcript (5'->3') order.
      const g = [];
      for (const e of exons) {
        if (plus) { for (let p = e.xi; p <= e.xf; p++) g.push(p); }
        else { for (let p = e.xf; p >= e.xi; p--) g.push(p); }
      }
      const gToC = new Map();
      for (let i = 0; i < g.length; i++) if (!gToC.has(g[i])) gToC.set(g[i], i);

      // cDNA index of the start codon's 5' first base. The TSS annotation was widened
      // by +1 at its 3' end when built from the GFF start_codon (createTrackFromLocal).
      let cdsStart = -1;
      if (tss) {
        const scFirst = plus ? Math.min(tss.xi, tss.xf) : Math.max(tss.xi, tss.xf);
        if (gToC.has(scFirst)) cdsStart = gToC.get(scFirst);
      }
      // Fallback: if the annotation didn't land on an ATG, use the ATG that opens the
      // longest ORF in the cDNA.
      if (cdsStart < 0 || seq.substr(cdsStart, 3) !== 'ATG') {
        cdsStart = this._longestOrfStart(seq);
      }
      if (cdsStart < 0) return empty;

      // cDNA index of the stop codon's 5' first base (upper bound), when annotated.
      let stopStart = -1;
      if (stop) {
        const stFirst = plus ? Math.min(stop.xi, stop.xf) : Math.max(stop.xi, stop.xf);
        if (gToC.has(stFirst)) stopStart = gToC.get(stFirst);
      }
      const hardEnd = (stopStart >= cdsStart) ? stopStart + 3 : seq.length;

      const protein = [];
      const codonPos = [];
      // cdsi: one entry per CDS base, matching the shape generateORF produces but with
      // the CORRECT residue/codon — so the drawn amino-acid row can consume it directly.
      const cdsi = [];
      let k = 0;
      for (let i = cdsStart; i + 2 < hardEnd && i + 2 < seq.length; i += 3) {
        const codonStr = seq.substr(i, 3);
        const aa = codon(codonStr);
        if (aa === 'STOP') break;
        const aaOne = aa || 'X';
        protein.push(aaOne);
        codonPos.push(g[i]);
        for (let ci = 0; ci < 3; ci++) {
          cdsi.push({ index: g[i + ci], ci: ci, codon_index: k, aa: aaOne, codon: codonStr });
        }
        k++;
      }
      return { protein: protein.join(''), codonPos, cdsi, cdsStartCdna: cdsStart };
    }

    // cDNA index of the ATG that opens the longest ORF (fallback start finder).
    _longestOrfStart(seq) {
      let best = -1, bestLen = -1;
      for (let i = 0; i + 2 < seq.length; i++) {
        if (seq.substr(i, 3) !== 'ATG') continue;
        let len = 0;
        for (let j = i; j + 2 < seq.length; j += 3) {
          const c = seq.substr(j, 3);
          if (c === 'TAA' || c === 'TAG' || c === 'TGA') break;
          len++;
        }
        if (len > bestLen) { bestLen = len; best = i; }
      }
      return best;
    }

    getProteinSequence() {
      // Correct exon-aware translation (was proteinFromORF, which relies on the
      // genomic-offset cdsi and is wrong for multi-exon transcripts).
      const p = this.getCDS().protein;
      return p || proteinFromORF(this, { threeLetter: false });
    }

    // Auto-generate / refresh the CDS: when the track carries both a start (TSS) and a
    // stop (STOP) codon annotation, (re)build the ORF so the CDS / Translation / codon
    // row stays in sync with the nucleotides. Called after any sequence edit so the CDS
    // updates in real time. Re-entrancy guarded because generateORF() adds annotations
    // (which can route back here).
    updateCDS() {
      if (this._cdsUpdating) return false;
      let hasStart = false, hasStop = false;
      for (const a of (this.annotations || [])) {
        const ty = ('' + (a && a.type)).toLowerCase();
        if (ty === 'tss') hasStart = true;
        else if (ty === 'stop') hasStop = true;
      }
      if (!(hasStart && hasStop) || typeof this.generateORF !== 'function') return false;
      this._cdsUpdating = true;
      try { this.generateORF(); } catch (e) { }
      this._cdsUpdating = false;
      return true;
    }

    // Coalesced CDS refresh, used when annotations are added in bulk (e.g. a track load
    // or a paste). Skips while a CDS update is already running (generateORF adds its own
    // STOP/Translation annotations, which route through add()); a single microtask does
    // the work once the current synchronous batch settles.
    scheduleCDSUpdate() {
      if (this._cdsUpdating || this._cdsUpdateScheduled) return;
      this._cdsUpdateScheduled = true;
      setTimeout(() => {
        this._cdsUpdateScheduled = false;
        try { this.updateCDS(); } catch (e) { }
      }, 0);
    }

    getSequences(annotation) {
      let seq = "";
      let sorted_annotations = this.annotations;
      sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      let seqindex = [];
      let sindex = 0;

      for (let a of sorted_annotations) {
        if (a.type === annotation) {
          let tt = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi) + 1);
          seq += tt;
        }
      }
      return seq;
    }

    findSTOPCodonIndex() {
      let seq = "";
      let sorted_annotations = this.annotations;
      let startIndex = -1;
      let endIndex = -1;

      if (this.strand > 0)
        sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      else
        sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });

      for (let an of sorted_annotations) {
        if (an.type.toLowerCase() === "translation") {
          startIndex = an.xi;
          endIndex = an.xf;
        }
      }
      for (let an of sorted_annotations) {
        if (an.type.toLowerCase() === "translation" || an.type.toLowerCase() === "transcription") {
          startIndex = an.xi;
          endIndex = an.xf;
        }
      }
      if (startIndex < 0) {
        for (let an of sorted_annotations) {
          if (an.type.toLowerCase() === "tss") {
            startIndex = an.xi;
          }
        }
      }

      if (endIndex < 0) {
        for (let an of sorted_annotations) {
          if (an.type.toLowerCase() === "stop") {
            endIndex = an.xf;
          }
        }
      }

      let seqindex = [];
      let cdsIndex = [];
      let sindex = 0;
      let codon_i = 1;
      let codon_ii = 0;
      let base_i = 1;
      let codon_value = "";
      let cds_i = false;

      if (this.strand > 0) {
        sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            let ai = a.xi;
            let af = a.xf;
            if (startIndex >= a.xi && startIndex < a.xf) {
              ai = startIndex;
              cds_i = true;
            }
            if (endIndex >= a.xi && endIndex < a.xf) {
              af = endIndex;
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                codon_value += tt[gene_index];
                let datav = {
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                };
                cdsIndex.push(datav);
                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                    }
                  }
                  codon_ii = 0;
                  codon_i++;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
              cds_i = false;
            }
            if (cds_i) {
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                codon_value += tt[gene_index];
                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });

                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                    }
                  }
                  codon_i++;
                  codon_ii = 0;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
            }
          }
        }
        for (let o of cdsIndex) {
          let aa = codon(o.codon);
          if (aa == "STOP") {
            return o;
          }
          o.aa = aa;
        }
        this.orf = { sequence: seq, cdsi: cdsIndex };
        this.orfhash = compressJson(this.orf);
      } else {
        sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            let ai = a.xi;
            let af = a.xf;

            if (startIndex >= a.xi && startIndex < a.xf) {
              af = startIndex - 1;
              cds_i = true;
            }
            if (endIndex >= a.xi && endIndex < a.xf) {
              ai = endIndex;
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                codon_value += tt[gene_index];
                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });
                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                    }
                  }
                  codon_ii = 0;
                  codon_i++;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
              cds_i = false;
            }
            if (cds_i) {
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                codon_value += tt[gene_index];
                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });

                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                      let aa = codon(codon_value);
                      if (aa === "STOP") {
                        this.add(new Annotation("STOP", "STOP", ci.index, ci.index + 3));
                        this.removeAnnotationByType("translation");
                        this.add(new Annotation("Translation", "Translation", startIndex, ci.index + 3));

                        cds_i = false;
                      }
                    }
                  }
                  codon_i++;
                  codon_ii = 0;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
            }
          }
        }
        for (let o of cdsIndex) {
          let aa = codon(o.codon);
          if (aa == "STOP") {
            return o;
          }
          o.aa = aa;
        }
        this.orf = { sequence: seq, cdsi: cdsIndex };
        this.orfhash = compressJson(this.orf);
      }
    }

    getPeptideFromORF(m_startIndex, m_stopIndex) {
      if (!this.orf || !this.orf.cdsi) {
        console.warn("ORF not generated yet. Run generateORF() first.");
        return "";
      }

      let startIndex = Math.floor(m_startIndex);
      let stopIndex = Math.floor(m_stopIndex);
      let peptide = "";
      for (let c of this.orf.cdsi) {
        if (c.index >= startIndex && c.index <= stopIndex) {
          if (c.ci === 2 && c.aa.length == 1) peptide += c.aa;
        }
      }
      return peptide;
    }

    generateORF() {
      // Annotation-authoritative codons for pre-mRNA / genomic tracks: if a
      // Translation (or CDS) is annotated, place start (TSS) and stop (STOP) from its
      // genomic bounds using the ANNOTATION strand (a pre-mRNA track's this.strand is
      // the '+' genome-slice strand, not the gene strand), and SKIP the genomic-offset
      // ORF walk below — that walk / getCDS use this.strand and put the stop at the
      // wrong (high) end on reverse-strand genes.
      try {
        let _lo, _hi, _have = false;
        const _tr = (this.annotations || []).find(a => ('' + a.type).toLowerCase() === 'translation');
        if (_tr && _tr.xi != null && _tr.xf != null) {
          _lo = Math.min(+_tr.xi, +_tr.xf); _hi = Math.max(+_tr.xi, +_tr.xf); _have = true;
        } else {
          const _cds = (this.annotations || []).filter(a => a.type === 'CDS');
          if (_cds.length) {
            _lo = Infinity; _hi = -Infinity;
            for (const c of _cds) { _lo = Math.min(_lo, +c.xi, +c.xf); _hi = Math.max(_hi, +c.xi, +c.xf); }
            _have = true;
          }
        }
        if (_have && isFinite(_lo) && isFinite(_hi)) {
          const _sSrc = (this.annotations || []).find(a => {
            const s = a && a.strand; return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
          });
          const _plus = _sSrc ? !(String(_sSrc.strand) === '-' || String(_sSrc.strand) === '-1') : (this.strand >= 0);
          const _s = _plus ? [_lo, _lo + 2] : [_hi - 2, _hi];   // start (5')
          const _e = _plus ? [_hi - 2, _hi] : [_lo, _lo + 2];   // stop (3')
          this.removeAnnotationByType('TSS');
          this.removeAnnotationByType('STOP');
          this.removeAnnotationByType('translation');
          const _gs = _plus ? 1 : -1;   // gene strand (this.strand is the +genome-slice strand on pre-mRNA)
          this.add(new Annotation('TSS', 'TSS', _s[0], _s[1], _gs));
          this.add(new Annotation('STOP', 'STOP', _e[0], _e[1], _gs));
          this.add(new Annotation('Translation', 'Translation', _lo, _hi, _gs));

          // Peptide: splice the CDS in transcription order (complement for '-'),
          // translate from the start ATG to the first in-frame stop, and set
          // this.orf.cdsi so the amino-acid row draws each residue at its genomic pos.
          try {
            const _cdsA = (this.annotations || []).filter(a => a.type === 'CDS')
              .map(a => ({ lo: Math.min(+a.xi, +a.xf), hi: Math.max(+a.xi, +a.xf) }))
              .sort((a, b) => _plus ? a.lo - b.lo : b.lo - a.lo);   // 5'->3' transcription order
            if (_cdsA.length) {
              const _comp = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
              const _seq = ('' + (this.sequence || '')).toUpperCase();
              const _xi = this.xi;
              const _gpos = [], _cb = [];
              for (const c of _cdsA) {
                if (_plus) { for (let p = c.lo; p <= c.hi; p++) { _gpos.push(p); _cb.push(_seq[p - _xi] || 'N'); } }
                else { for (let p = c.hi; p >= c.lo; p--) { _gpos.push(p); _cb.push(_comp[_seq[p - _xi]] || 'N'); } }
              }
              const _cseq = _cb.join('');
              const _cdsi = [];
              const _protein = [];
              for (let i = 0; i + 2 < _cseq.length; i += 3) {
                const _codon = _cseq.substr(i, 3);
                const _aa = (typeof codon === 'function') ? codon(_codon) : 'X';
                if (_aa === 'STOP') break;
                _protein.push(_aa || 'X');
                for (let ci = 0; ci < 3; ci++) {
                  _cdsi.push({ index: _gpos[i + ci], ci: ci, codon_index: i / 3, aa: _aa || 'X', codon: _codon });
                }
              }
              this.orf = this.orf || {};
              this.orf.cdsi = _cdsi;
              this.orf.sequence = _protein.join('');
              try { this.orfhash = compressJson(JSON.stringify(this.orf)); } catch (e) { }
            }
          } catch (e) { }
          return this.orf;
        }
      } catch (e) { }

      // Authoritative CDS stop from the GFF/CCDS annotation (stop_codon -> STOP),
      // captured BEFORE it is cleared just below. The codon re-scan further down can
      // otherwise place a PREMATURE stop: the track sequence may be spliced cDNA, so
      // a genomic-offset codon walk lands out of frame and hits an early stop (e.g.
      // FGFR3 showed a stop ~3 residues from the start). When the annotated stop is
      // available we force the ORF's STOP / Translation to it at the end, so the stop
      // matches the CCDS/translation annotation.
      let __gffStop = null;
      for (let an of this.annotations) {
        if (('' + an.type).toLowerCase() === 'stop') { __gffStop = { xi: an.xi, xf: an.xf }; }
      }
      // this.removeAnnotationByType("STOP");
      this.orf = null;
      let seq = "";

      // this.removeAnnotationByType("translation");
      let sorted_annotations = this.annotations;
      if (this.strand >= 0)
        sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      else
        sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });

      let startIndex = -1;
      let endIndex = -1;
      for (let an of sorted_annotations) {
        if (an.type.toLowerCase() === "translation") {
          startIndex = an.xi;
          endIndex = an.xf;
        }
      }

      if (startIndex > 0 && endIndex < 0) {
        let endI = this.findSTOPCodonIndex();
        endIndex = endI.index;
        // this.add(new Annotation("TSS", "TSS", startIndex, startIndex + 2));
        // this.add(new Annotation("STOP", "STOP", endIndex, endIndex + 2));
        // this.add(new Annotation("Translation", "Translation", startIndex, endIndex));
      } else if (startIndex < 0 && endIndex < 0) {
        this.removeAnnotationByType("translation");
        for (let an of sorted_annotations) {
          if (this.strand < 0) {
            if (an.type.toLowerCase() === "tss") {
              startIndex = an.xf;
            } else if (an.type.toLowerCase() === "stop") {
              endIndex = an.xi;
            }
          } else {
            if (an.type.toLowerCase() === "tss") {
              startIndex = an.xi;
            } else if (an.type.toLowerCase() === "stop") {
              endIndex = an.xf;
            }
          }
        }
        this.add(new Annotation("Translation", "Translation", startIndex, endIndex));
      }

      let cdsIndex = [];
      let codon_i = 0;
      let codon_ii = 0;
      let base_i = 1;
      let codon_value = "";
      let cds_i = false;
      if (this.strand >= 0) {
        sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            let ai = a.xi;
            let af = a.xf;

            if (startIndex >= a.xi && startIndex < a.xf) {
              ai = startIndex;
              cds_i = true;
            }
            if (endIndex >= a.xi && endIndex < a.xf) {
              af = endIndex;
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);

              for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                codon_value += tt[gene_index];
                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });
                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                    }
                  }
                  codon_ii = 0;
                  codon_i++;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
              cds_i = false;
            }
            if (cds_i) {
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              let stop = false;
              for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                codon_value += tt[gene_index];
                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });
                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                      let aa = codon(codon_value);
                      if (aa.toLowerCase() === "stop") {
                        this.add(new Annotation("STOP", "STOP", ci.index, ci.index + 3));
                        this.removeAnnotationByType("translation");
                        this.add(new Annotation("Translation", "Translation", startIndex, ci.index + 3));
                        cds_i = false;
                        gene_index = tt.length;
                      }
                    }
                  }
                  codon_i++;
                  codon_ii = 0;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
            }
          }
        }
        for (let o of cdsIndex) {
          let aa = codon(o.codon);
          o.aa = aa;
        }
        this.orf = { sequence: seq, cdsi: cdsIndex };
        this.orfhash = compressJson(JSON.stringify(this.orf));
      } else {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            let ai = a.xi;
            let af = a.xf;
            if (startIndex > a.xi && startIndex <= a.xf) {
              af = startIndex - 1;
              cds_i = true;
            }
            if (endIndex > a.xi && endIndex <= a.xf) {
              ai = endIndex;
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                codon_value += tt[gene_index];

                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });
                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;
                      let aa = codon(codon_value);   // was referenced undefined -> ReferenceError on minus strand
                      if (aa.toLowerCase() === "stop") {
                        this.add(new Annotation("STOP", "STOP", ci.index, ci.index + 3));
                        this.removeAnnotationByType("translation");
                        this.add(new Annotation("Translation", "Translation", startIndex, ci.index + 3));
                        endIndex = ci.index + 3;
                        gene_index = -1;
                        cds_i = false;
                      }
                    }
                  }
                  codon_ii = 0;
                  codon_i++;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
              cds_i = false;
            }
            if (cds_i) {
              let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
              let stop = false;

              for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                codon_value += tt[gene_index];
                cdsIndex.push({
                  codon_index: codon_i,
                  ci: codon_ii,
                  index: gene_index + ai,
                  codon: codon_value,
                });

                codon_ii++;
                if (base_i % 3 === 0) {
                  for (let ci of cdsIndex) {
                    if (ci.codon_index === codon_i) {
                      ci.codon = codon_value;

                      let aa = codon(codon_value);
                      if (aa.toLowerCase() === "stop") {
                        this.add(new Annotation("STOP", "STOP", ci.index, ci.index + 3));
                        this.removeAnnotationByType("translation");
                        this.add(new Annotation("Translation", "Translation", startIndex, ci.index + 3));
                        endIndex = ci.index + 3;
                        gene_index = -1;
                        cds_i = false;
                      }
                    }
                  }
                  codon_i++;
                  codon_ii = 0;
                  codon_value = "";
                }
                base_i++;
              }
              seq += tt;
            }
          }
        }
        for (let o of cdsIndex) {
          let aa = codon(o.codon);
          o.aa = aa;
        }
        this.orf = { sequence: seq, cdsi: cdsIndex };
        this.orfhash = compressJson(JSON.stringify(this.orf));
      }

      let expell = [];
      for (let a of this.annotations) {
        if (a.type.toLowerCase() === "stop") {
          let afound = false;
          let exons = this.getExons();

          for (let e of exons) {
            if (e.xi <= a.xi && e.xf > a.xf) {
              afound = true;
            }
          }
          if (!afound) {
            expell.push(a);
          }
        }
      }
      let isEqual = (obj1, obj2) => {
        return JSON.stringify(obj1) === JSON.stringify(obj2);
      };
      this.annotations = this.annotations.filter((obj) => !expell.find((toRemove) => isEqual(obj, toRemove)));

      // Force the STOP / Translation to the GFF/CCDS-annotated stop codon when we have
      // it, overriding any premature stop the codon re-scan produced above. This keeps
      // the drawn stop aligned with the CCDS/translation annotation regardless of
      // whether the underlying sequence is genomic or spliced cDNA.
      if (__gffStop && startIndex >= 0) {
        const __lo = Math.min(__gffStop.xi, __gffStop.xf);
        const __hi = Math.max(__gffStop.xi, __gffStop.xf);
        this.removeAnnotationByType("STOP");
        this.removeAnnotationByType("translation");
        this.add(new Annotation("STOP", "STOP", __lo, __hi));
        this.add(new Annotation("Translation", "Translation", Math.min(startIndex, __lo), Math.max(startIndex, __hi)));
      }

      // Replace the codon index with the exon-aware translation so the drawn amino-acid
      // row shows the correct residues. The walk above indexes the spliced cDNA by
      // genomic offset, which mis-translates multi-exon genes; getCDS() maps genomic <->
      // cDNA via the exon map and translates the real CDS. Each cdsi entry keeps its
      // genomic `index`, so the per-base rendering (oor.index === base) is unchanged.
      try {
        const __cds = this.getCDS();
        if (__cds && __cds.cdsi && __cds.cdsi.length) {
          this.orf = this.orf || {};
          this.orf.cdsi = __cds.cdsi;
          if (__cds.protein) this.orf.sequence = __cds.protein;
          this.orfhash = compressJson(JSON.stringify(this.orf));
        }
      } catch (e) { }

      // If a Translation is annotated, it is authoritative: define the start (TSS)
      // and stop (STOP) codons from its genomic bounds, taking orientation into
      // account (5'-most base is the start; for '-' strand that is the highest
      // genomic coordinate). Overrides any existing/derived codon annotations.
      try {
        const _tr = (this.annotations || []).find(a => ('' + a.type).toLowerCase() === 'translation');
        if (_tr && _tr.xi != null && _tr.xf != null) {
          const _lo = Math.min(+_tr.xi, +_tr.xf), _hi = Math.max(+_tr.xi, +_tr.xf);
          // Orientation from the ANNOTATIONS' strand, not this.strand: a pre-mRNA
          // track's this.strand is the (+) genome-slice strand, while the exon/CDS
          // annotations carry the real gene strand. Using this.strand mislabeled
          // reverse genes as forward and put the start at the low genomic end.
          const _sSrc = (this.annotations || []).find(a => {
            const s = a && a.strand; return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
          });
          const _plus = _sSrc ? !(String(_sSrc.strand) === '-' || String(_sSrc.strand) === '-1') : (this.strand >= 0);
          const _s = _plus ? [_lo, _lo + 2] : [_hi - 2, _hi];   // start codon (5')
          const _e = _plus ? [_hi - 2, _hi] : [_lo, _lo + 2];   // stop codon (3')
          this.removeAnnotationByType('TSS');
          this.removeAnnotationByType('STOP');
          this.add(new Annotation('TSS', 'TSS', _s[0], _s[1], this.strand));
          this.add(new Annotation('STOP', 'STOP', _e[0], _e[1], this.strand));
        }
      } catch (e) { }

      return this.orf;
    }

    getTranslation() {
      for (let a of this.annotations) {
        if (a.type === "Translation") {
          return a;
        }
      }
      return null;
    }

    // Draw the compounds as a glow instead of individually: bin them across the visible
    // width, then paint each bin at an alpha that follows its share of the busiest bin. Bins
    // rather than a blur so the cost does not grow with the number of compounds -- a track
    // with two thousand oligos paints the same number of rectangles as one with ten.
    __drawCompoundDensity(graph, oligos) {
      const ctx = graph && graph.canvas && graph.canvas.getCTX ? graph.canvas.getCTX() : null;
      if (!ctx || !oligos || !oligos.length) return;

      const BINS = 160;
      const bins = new Array(BINS).fill(0);
      const lo = this.tgraph.xmin, hi = this.tgraph.xmax;
      const span = (hi - lo) || 1;
      let total = 0;
      for (const o of oligos) {
        if (!o) continue;
        const isAmp = (o.type === 'amplicon' && o.left && o.right);
        const a = isAmp ? +o.left.xi : +o.xi;
        const b = isAmp ? +o.right.xf : +o.xf;
        if (!isFinite(a) || !isFinite(b)) continue;
        // Spread an interval across every bin it touches, so a long amplicon reads as wide
        // rather than as a single tall spike at its start.
        const i0 = Math.max(0, Math.min(BINS - 1, Math.floor(((Math.min(a, b) - lo) / span) * BINS)));
        const i1 = Math.max(0, Math.min(BINS - 1, Math.floor(((Math.max(a, b) - lo) / span) * BINS)));
        for (let i = i0; i <= i1; i++) { bins[i]++; }
        total++;
      }
      if (!total) return;

      let peak = 0;
      for (const v of bins) if (v > peak) peak = v;
      if (!peak) return;

      const T = this.themeColors();
      const yTop = graph.Y(this.tgraph.Y(1));
      const yBot = graph.Y(this.tgraph.Y(0));
      const top = Math.min(yTop, yBot), height = Math.abs(yBot - yTop);
      const xLeft = graph.X(this.tgraph.X(lo));
      const xRight = graph.X(this.tgraph.X(hi));
      const width = (xRight - xLeft);
      const bw = width / BINS;

      ctx.save();
      for (let i = 0; i < BINS; i++) {
        if (!bins[i]) continue;
        const f = bins[i] / peak;
        // Floor the alpha so a single compound still registers; the eye should be able to
        // find one outlier, not only the crowd.
        ctx.globalAlpha = 0.14 + 0.55 * f;
        ctx.fillStyle = T.exon;
        ctx.fillRect(xLeft + i * bw, top, Math.max(1, bw + 0.5), height);
      }
      ctx.globalAlpha = 1;
      // Say what is being shown, so a glow is never mistaken for data on the track.
      try {
        ctx.font = '10px Arial, Helvetica, sans-serif';
        ctx.fillStyle = T.gtag;
        ctx.textAlign = 'left';
        ctx.fillText(total + ' compound' + (total === 1 ? '' : 's') + ' · density', xLeft + 4, top + 11);
      } catch (e) { }
      ctx.restore();
    }

    // The themes this track can draw with. On the class so the menu builds itself from the
    // same table the renderer uses -- see baja/manchester/menu/mouse-over-highlight.js.
    static get THEMES() { return GX_THEMES; }

    // This track's palette. Unset or unknown falls back to classic.
    themeColors() {
      try { return GX_THEMES[this.theme] || GX_THEMES.classic; }
      catch (e) { return GX_THEMES.classic; }
    }

    getExons() {
      let temp = [];
      for (let a of this.annotations) {
        if (a.type === "Exon") {
          temp.push(a);
        }
      }
      return temp;
    }
    getAnnotations(annotation_type) {
      let temp = [];
      for (let a of this.annotations) {
        if (a.type === annotation_type) {
          temp.push(a);
        }
      }
      return temp;
    }

    getExonsBetweenTranslationOrTSSAndSTOP() {
      let start = null;
      let end = null;

      let translationAnnotation = this.annotations.find((annotation) => annotation.type === "Translation");

      if (translationAnnotation) {
        start = translationAnnotation.xi;
        end = translationAnnotation.xf;
      } else {
        let tssAnnotation = null;
        let stopAnnotation = null;

        for (let annotation of this.annotations) {
          if (annotation.type === "TSS") {
            tssAnnotation = annotation;
          } else if (annotation.type === "STOP") {
            stopAnnotation = annotation;
          }
        }

        if (!tssAnnotation || !stopAnnotation) {
          console.warn("Translation, TSS, or STOP annotation not found.");
          return [];
        }

        start = tssAnnotation.xi;
        end = stopAnnotation.xf;
      }

      let exons = this.annotations.filter((annotation) => {
        if (annotation.type === "Exon") {
          if (this.strand >= 0) {
            return annotation.xi >= start && annotation.xf <= end;
          } else {
            return annotation.xf <= start && annotation.xi >= end;
          }
        }
        return false;
      });

      return exons;
    }

    getCodon(codon_index) {
      let bindex = +codon_index;
      let sorted_annotations = this.annotations;
      sorted_annotations = sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      let codons = [];
      let codon = "";
      let start = false;
      let index = 0;
      let gstart = -1;
      let gend = -1;

      for (let a of sorted_annotations) {
        if (a.type === "Exon") {
          let tt = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi) + 2);

          let start_index = 0;
          if (!start && tt.indexOf("ATG") >= 0) {
            start = true;
            start_index = tt.indexOf("ATG");
          }

          for (let s = start_index; s < tt.length - 1; s++) {
            codon = codon.trim();
            if (codon.length > 2) {
              codon = "";
              gend = -1;
            }
            codon += tt.substring(s, s + 1);

            if (codon && codon.length === 1) {
              gstart = a.xi + s;
            }
            if (codon.length === 3) {
              gend = a.xi + s;
            }
            if (start) {
              if (codon.length === 3) {
                codons[index++] = { codon: codon, start: gstart, end: gend };
              }
            } else if (codon.length === 3 && (codon === "TAA" || codon === "TAG" || codon === "TGA")) {
              start = false;
            }
          }
        }
      }

      return codons[codon_index];
    }

    getStartCodonIndex() {
      let sorted_annotations = this.annotations;
      if (this.strand < 0) {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });
      } else
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      for (let a of sorted_annotations) {
        if (a.type === "Translation") {
          if (this.strand < 0) return a.xf - 2;
          else return a.xi;
        }
      }
      return -1;
    }

    copyLayers() {
      let copyTrackLayer = (layer) => {
        if (layer instanceof AttributionLayer) {
          let obj = layer;
          let l = new AttributionLayer(obj.name, obj.xmin, obj.ymin, obj.xmax, obj.ymax, obj.attribution_type, obj.attribution_site, obj.window, obj.track);
          Object.assign(l, layer);
          l.name = layer.name + "*";
          return l;
        } else if (layer instanceof AttributionSushimiLayer) {
          let l = Object.assign(new AttributionSushimiLayer(), layer);
          l.name = layer.name + "*";
          return l;
        } else {
          let l = Object.assign(new TrackLayer(), layer);
          l.name = layer.name + "*";
          return l;
        }
      };
      let tl = this.track_layers.map((layer) => copyTrackLayer(layer));
      return tl;
    }
    getNearestAnnotations(type, x, limit = 10) {
      let candidates = [];

      for (let a of this.annotations) {
        if (type != null && a.type !== type) continue;

        let distance;

        if (a.xi <= x && a.xf > x) {
          distance = 0;
        } else {
          const distanceToStart = Math.abs(a.xi - x);
          const distanceToEnd = Math.abs(a.xf - x);
          distance = Math.min(distanceToStart, distanceToEnd);
        }

        candidates.push({
          annotation: a,
          distance,
        });
      }

      candidates.sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }

        if (this.strand > 0) {
          return parseFloat(a.annotation.xi) - parseFloat(b.annotation.xi);
        } else {
          return parseFloat(b.annotation.xi) - parseFloat(a.annotation.xi);
        }
      });

      return candidates.slice(0, limit).map((c) => c.annotation);
    }

    getNearestAnnotation(type, x) {
      let minDistance = Infinity;
      let selected = null;

      let sorted_annotations = [...this.annotations];

      if (this.strand > 0) {
        sorted_annotations.sort((a, b) => parseFloat(a.xi) - parseFloat(b.xi));
      } else {
        sorted_annotations.sort((a, b) => parseFloat(b.xi) - parseFloat(a.xi));
      }

      for (let a of sorted_annotations) {
        if (type != null && a.type !== type) continue;
        if (a.xi <= x && a.xf > x) {
          return a;
        }
        let distanceToStart = Math.abs(a.xi - x);
        let distanceToEnd = Math.abs(a.xf - x);
        let closestDistance = Math.min(distanceToStart, distanceToEnd);

        if (closestDistance < minDistance) {
          minDistance = closestDistance;
          selected = a;
        }
      }

      return selected;
    }

    getNextExon(x) {
      let type = "Exon";
      let a = this.getNearestAnnotation(type, x);
      if (!a) {
        return null;
      }
      let sorted_annotations = this.annotations;
      if (this.strand > 0) {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      } else
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });

      let found = false;
      let index = 0;
      for (let s of sorted_annotations) {
        if (found && s.type == "Exon") {
          return s;
        }
        if (s === a) found = true;
      }
      return null;
    }

    getNearestAA(x) {
      if (this.orf && this.orf.cdsi) {
        for (let oor of this.orf.cdsi) {
          if (Math.abs(oor.index - x) <= 1) {
            return oor;
          }
        }
      } else {
        this.generateORF();
        return this.getNearestAA(x);
      }

      return null;
    }

    ORFIndexToGenomicIndex(orfindex) {
      this.generateORF();
      if (this.orf && this.orf.cdsi) {
        for (let oor of this.orf.cdsi) {
          if (oor.codon_index === orfindex) {
            return oor.index;
          }
        }
      }
      return -1;
    }

    getAllIndexes(arr, val) {
      var indexes = [],
        i = -1;
      while ((i = arr.indexOf(val, i + 1)) != -1) {
        indexes.push(i);
      }
      return indexes;
    }
    getCodingSequences(t) {
      let letc = [];
      let indexes = getAllIndexes(letc, "AUG");
      return index;
    }
    genomicToCodingIndex(c) {
      let annotation = null;
      let sorted_annotations = this.annotations;
      sorted_annotations = sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      for (let a of sorted_annotations) {
        if (a.type === "Translation") {
          annotation = a;
        }
      }
      if (!annotation) throw "The Translation (annotation type == Translation) annotation is not defined. ";

      if (this.strand >= 0) {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
        let totalCount = 0;
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            if (a.xi <= annotation.xi && a.xf > annotation.xi) {
              let increment = Math.floor(a.xf) - Math.floor(annotation.xi);
              totalCount += increment;
              console.log(" start codon difference " + totalCount);
              if (totalCount >= c) {
                return Math.floor(annotation.xi) + c - 1;
              }
            } else if (a.xi <= annotation.xf && a.xf > annotation.xf) {
              let exonCount = Math.floor(annotation.xf) - Math.floor(a.xi);
              let lo = c - totalCount;
              return Math.floor(a.xi) + lo - 1;
            } else if (a.xi > annotation.xi && a.xf < annotation.xf) {
              totalCount += Math.floor(a.xf - a.xi);
            }

            if (totalCount >= c) {
              return Math.floor(a.xf) - (totalCount - c) - 1;
            }
          }
        }
      } else {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });
        let totalCount = 0;

        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            if (a.xf < annotation.xi && a.xi > annotation.xi) {
              let increment = a.xi - annotation.xi;
              if (c <= increment) {
                return Math.floor(annotation.xi) - c;
              } else {
                totalCount += increment;
              }
            } else {
              let increment = Math.abs(Math.floor(a.xi) - Math.floor(a.xf));

              totalCount += increment;
            }
            if (totalCount >= c) {
              return Math.floor(a.xi) - totalCount - c - 1;
            }
          }
        }
      }
      return annotation.xi;
    }

    getCDS() {
      let reverseString = (str) => {
        return str.split("").reverse().join("");
      };
      let annotation = null;
      let sorted_annotations = this.annotations;
      sorted_annotations = sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      let sequence = "";
      for (let a of sorted_annotations) {
        if (a.type === "Translation") {
          annotation = a;
          sequence = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf + 1 - this.xi));
          if (this.strand < 0) {
            sequence = reverseString(sequence);
          }
        }
      }
      let spliced = "";
      let junktions = [];
      if (this.strand >= 0) {
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            if (a.xi < annotation.xi && a.xf > annotation.xi) {
              let si = Math.floor(annotation.xi - this.xi);
              let sf = Math.floor(a.xf + 1 - this.xi);
              spliced += this.sequence.substring(si, sf);
              junktions.push(spliced.length);
            } else if (a.xi < annotation.xf && a.xf > annotation.xf) {
              spliced += this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(annotation.xf + 1 - this.xi));
              junktions.push(spliced.length);
            } else if (a.xi > annotation.xi && a.xf < annotation.xf) {
              spliced += this.sequence.substring(a.xi - this.xi, a.xf + 1 - this.xi);
              junktions.push(spliced.length);
            }
          }
        }
      } else {
        for (let a of sorted_annotations) {
          if (a.type === "Exon") {
            if (a.xi < annotation.xi && a.xf > annotation.xi) {
              spliced += this.sequence.substring(Math.floor(annotation.xi - this.xi), Math.floor(a.xf - this.xi));
              junktions.push(spliced.length);
            } else if (a.xi < annotation.xf && a.xf > annotation.xf) {
              spliced += this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(annotation.xf + 1 - this.xi));
              junktions.push(spliced.length);
            } else if (a.xi > annotation.xi && a.xf < annotation.xf) {
              spliced += this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi));
              junktions.push(spliced.length);
            }
          }
        }
        spliced = reverseString(spliced);
      }

      if (annotation === null) {
        return {};
      }

      return {
        sequence: spliced,
        annotation: annotation,
        junctions: junktions,
      };
    }

    getStopCodonIndex() {
      let sorted_annotations = this.annotations;
      if (this.strand < 0) {
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });
      } else
        sorted_annotations = sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      for (let a of sorted_annotations) {
        if (a.type === "Translation") {
          if (this.strand < 0) return a.xi;
          else return a.xf;
        }
      }
      return -1;
    }

    getStructure(x, y) {
      const slist = [];

      for (let s of this.structures) {
        if (x >= s.tgraph.xi && x < s.tgraph.xi + s.tgraph.width && y <= s.tgraph.yi + s.tgraph.height && y > s.tgraph.yi) {
          slist.push(s);
        }
      }

      const rawHits = this.ampliconResults || this.primerAmpliconResults || this.ctModelAmplicons || this.primer3Hits || this.amplicon_hits;

      const fallbackNormalizeAmpliconHits = (input) => {
        if (!input) return [];
        if (Array.isArray(input)) return input;
        if (typeof input === "string") {
          try {
            return fallbackNormalizeAmpliconHits(JSON.parse(input));
          } catch {
            return [];
          }
        }
        if (typeof input === "object") {
          if (Number.isFinite(input.length)) {
            const out = [];
            for (let i = 0; i < input.length; i++) if (i in input) out.push(input[i]);
            return out;
          }

          const keys = Object.keys(input)
            .filter((k) => String(+k) === k)
            .sort((a, b) => +a - +b);
          if (keys.length) return keys.map((k) => input[k]);
        }
        return [];
      };

      const hits = typeof normalizeAmpliconHits === "function" ? normalizeAmpliconHits(rawHits) : fallbackNormalizeAmpliconHits(rawHits);

      if (hits && hits.length) {
        const boxes = [];
        const maxRows = Math.min(12, hits.length);

        for (let i = 0; i < maxRows; i++) {
          const h = hits[i] || {};
          const a0 = +h.amp_start;
          const a1 = +h.amp_end;
          if (!Number.isFinite(a0) || !Number.isFinite(a1) || a1 <= a0) continue;

          const yRow = this.tgraph.Y(0.1 + i * 0.075);

          const x0 = Math.round(this.tgraph.X(a0));
          const x1 = Math.round(this.tgraph.X(a1));

          const fwdSeq = (h.forward_primer || "").toString();
          const revSeq = (h.reverse_primer || "").toString();
          const probeSeq = (h.probe || "").toString();
          const fLen = fwdSeq.length || 0;
          const rLen = revSeq.length || 0;

          if (fLen > 0) {
            const f0 = a0;
            const f1 = Math.min(a1, a0 + fLen);
            if (f1 > f0) {
              const fx0 = Math.round(this.tgraph.X(f0));
              const fx1 = Math.round(this.tgraph.X(f1));
              boxes.push({
                x1: fx0,
                y1: yRow - 10,
                x2: fx1,
                y2: yRow + 10,
                amp_start: a0,
                amp_end: a1,
                primer_start: f0,
                primer_end: f1,
                hit: h,
                kind: "ct_fwd_primer",
              });
            }
          }

          if (rLen > 0) {
            const r1 = a1;
            const r0 = Math.max(a0, a1 - rLen);
            if (r1 > r0) {
              const rx0 = Math.round(this.tgraph.X(r0));
              const rx1 = Math.round(this.tgraph.X(r1));
              boxes.push({
                x1: rx0,
                y1: yRow - 10,
                x2: rx1,
                y2: yRow + 10,
                amp_start: a0,
                amp_end: a1,
                primer_start: r0,
                primer_end: r1,
                hit: h,
                kind: "ct_rev_primer",
              });
            }
          }

          if (probeSeq && probeSeq.length > 0) {
            let pr0 = a0;
            let pr1 = a0;

            const ampSeq = (h.amplicon || "").toString();
            const idx = ampSeq ? ampSeq.indexOf(probeSeq) : -1;

            if (idx >= 0) {
              pr0 = a0 + idx;
              pr1 = Math.min(a1, pr0 + probeSeq.length);
            } else {
              const mid = Math.floor((a0 + a1) / 2);
              pr0 = Math.max(a0, mid - Math.floor(probeSeq.length / 2));
              pr1 = Math.min(a1, pr0 + probeSeq.length);
            }

            if (pr1 > pr0) {
              const px0 = Math.round(this.tgraph.X(pr0));
              const px1 = Math.round(this.tgraph.X(pr1));
              boxes.push({
                x1: px0,
                y1: yRow - 10,
                x2: px1,
                y2: yRow + 10,
                amp_start: a0,
                amp_end: a1,
                probe_start: pr0,
                probe_end: pr1,
                hit: h,
                kind: "ct_probe",
              });
            }
          }

          boxes.push({
            x1: x0,
            y1: yRow - 10,
            x2: x1,
            y2: yRow + 10,
            amp_start: a0,
            amp_end: a1,
            hit: h,
            kind: "ct_amplicon",
          });
        }
        this.ampliconsResults = boxes;
      } else {
        this.ampliconsResults = [];
      }

      if (Array.isArray(this.ampliconsResults) && this.ampliconsResults.length) {
        for (const b of this.ampliconsResults) {
          if (!b) continue;
          const xMin = Math.min(b.x1, b.x2);
          const xMax = Math.max(b.x1, b.x2);
          const yMin = Math.min(b.y1, b.y2);
          const yMax = Math.max(b.y1, b.y2);

          if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
            slist.push(b);
          }
        }
      }

      return slist;
    }

    getFeaturesWithinPolygon(polygonObj) {
      const polygonInGraph = Array.isArray(polygonObj) ? polygonObj : polygonObj?.points || polygonObj?.polygon || [];

      if (!Array.isArray(polygonInGraph) || polygonInGraph.length < 3) return [];
      if (!this.tgraph) return [];

      const polygon = polygonInGraph
        .map((p) => {
          if (!p) return null;
          let x = this.tgraph.Xwc(p.x - 2 * this.tgraph.xi);
          let y = this.tgraph.Ywc(p.y - 2 * this.tgraph.yi);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x, y };
        })
        .filter(Boolean);

      if (polygon.length < 3) return [];

      const isPointInPolygon = (point, poly) => {
        let inside = false;
        const x = point.x,
          y = point.y;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x,
            yi = poly[i].y;
          const xj = poly[j].x,
            yj = poly[j].y;
          const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
          if (intersect) inside = !inside;
        }
        return inside;
      };

      let minX = Infinity,
        maxX = -Infinity;
      for (const p of polygon) {
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return [];

      const featurePoint = (f) => {
        const x = Number.isFinite(f?.xi) && Number.isFinite(f?.xf) ? (f.xi + f.xf) / 2 : Number.isFinite(f?.x) ? f.x : NaN;

        let y = Number.isFinite(f?.y) ? f.y : this.y;
        if (f && f.phase === 0 && !Number.isFinite(f?.y)) y = -Math.abs(this.y);

        return { x, y };
      };

      const inXRange = (f) => {
        const xi = f?.xi,
          xf = f?.xf;
        if (Number.isFinite(xi) && Number.isFinite(xf)) {
          return !(xf < minX || xi > maxX);
        }
        const x = f?.x;
        return Number.isFinite(x) ? x >= minX && x <= maxX : true;
      };

      const buildAmpliconBoxesTrackCoords = () => {
        const rawHits = this.ampliconResults || this.primerAmpliconResults || this.ctModelAmplicons || this.primer3Hits || this.amplicon_hits;

        const fallbackNormalizeAmpliconHits = (input) => {
          if (!input) return [];
          if (Array.isArray(input)) return input;
          if (typeof input === "string") {
            try {
              return fallbackNormalizeAmpliconHits(JSON.parse(input));
            } catch {
              return [];
            }
          }
          if (typeof input === "object") {
            if (Number.isFinite(input.length)) {
              const out = [];
              for (let i = 0; i < input.length; i++) if (i in input) out.push(input[i]);
              return out;
            }
            const keys = Object.keys(input)
              .filter((k) => String(+k) === k)
              .sort((a, b) => +a - +b);
            if (keys.length) return keys.map((k) => input[k]);
          }
          return [];
        };

        const hits = typeof normalizeAmpliconHits === "function" ? normalizeAmpliconHits(rawHits) : fallbackNormalizeAmpliconHits(rawHits);

        if (!hits || !hits.length) return [];
        const boxes = [];
        const maxRows = Math.min(12, hits.length);
        for (let i = 0; i < maxRows; i++) {
          const h = hits[i] || {};
          const a0 = +h.amp_start;
          const a1 = +h.amp_end;
          const y = this.tgraph.Ywc(this.tgraph.Y(0.1 + i * 0.075) - 2 * this.tgraph.yi);
          const pushBox = (xw1, xw2, extra) => {
            const x1 = Math.min(xw1, xw2);
            const x2 = Math.max(xw1, xw2);
            boxes.push({ x1, x2, y, y, amp_start: a0, amp_end: a1, uid: h.uid, hit: h, ...extra });
          };

          const fwdSeq = (h.forward_primer || "").toString();
          const revSeq = (h.reverse_primer || "").toString();
          const probeSeq = (h.probe || "").toString();
          const fLen = fwdSeq.length || 0;
          const rLen = revSeq.length || 0;

          if (fLen > 0) {
            const f0 = a0;
            const f1 = Math.min(a1, a0 + fLen);
            if (f1 > f0) pushBox(f0, f1, { primer_start: f0, primer_end: f1, kind: "ct_fwd_primer" });
          }

          if (rLen > 0) {
            const r1 = a1;
            const r0 = Math.max(a0, a1 - rLen);
            if (r1 > r0) pushBox(r0, r1, { primer_start: r0, primer_end: r1, kind: "ct_rev_primer" });
          }

          if (probeSeq && probeSeq.length > 0) {
            let pr0 = a0;
            let pr1 = a0;

            const ampSeq = (h.amplicon || "").toString();
            const idx = ampSeq ? ampSeq.indexOf(probeSeq) : -1;

            if (idx >= 0) {
              pr0 = a0 + idx;
              pr1 = Math.min(a1, pr0 + probeSeq.length);
            } else {
              const mid = Math.floor((a0 + a1) / 2);
              pr0 = Math.max(a0, mid - Math.floor(probeSeq.length / 2));
              pr1 = Math.min(a1, pr0 + probeSeq.length);
            }

            if (pr1 > pr0) pushBox(pr0, pr1, { probe_start: pr0, probe_end: pr1, kind: "ct_probe" });
          }

          pushBox(a0, a1, { kind: "ct_amplicon" });
        }

        return boxes;
      };

      const out = [];
      const addIfInside = (arr) => {
        if (!Array.isArray(arr) || !arr.length) return;

        const getXY = (f) => {
          if (!f || typeof f !== "object") return { x: NaN, y: NaN };

          try {
            const pt = featurePoint(f);
            if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) return pt;
          } catch (_) { }

          const pick = (...keys) => {
            for (const k of keys) {
              const v = (f[k] !== undefined ? f[k] : undefined) ?? (f.coords && f.coords[k] !== undefined ? f.coords[k] : undefined);
              const n = typeof v === "string" ? Number(v) : v;
              if (Number.isFinite(n)) return n;
            }
            return NaN;
          };

          let x = pick("x");
          let y = pick("y");
          if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };

          const xA = pick("x1", "xi", "xstart", "xStart", "x0", "start", "x_begin", "xBegin");
          const xB = pick("x2", "xf", "xend", "xEnd", "x1", "end", "x_finish", "xFinish");
          const yA = pick("y1", "yi", "ystart", "yStart", "y0", "y_begin", "yBegin");
          const yB = pick("y2", "yf", "yend", "yEnd", "y1", "y_finish", "yFinish");

          if (Number.isFinite(xA) && Number.isFinite(xB)) x = (xA + xB) / 2;
          else x = pick("x", "xmid", "xMid", "midX");

          if (Number.isFinite(yA) && Number.isFinite(yB)) y = (yA + yB) / 2;
          else y = Number.isFinite(yA) ? yA : pick("y", "ymid", "yMid", "midY");

          return { x, y };
        };

        const inXRangeSmart = (f) => {
          const { x } = getXY(f);
          return Number.isFinite(x) ? inXRange({ ...f, x }) : false;
        };

        for (const f of arr) {
          if (!f) continue;

          if (!inXRangeSmart(f)) continue;

          const pt = getXY(f);
          if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

          if (isPointInPolygon(pt, polygon)) out.push(f);
        }
      };

      addIfInside(this.annotations);
      addIfInside(this.oligos);
      addIfInside(this.snpindels);
      const ampliconBoxes = buildAmpliconBoxesTrackCoords();
      addIfInside(ampliconBoxes);

      return out;
    }
    createSecondaryStructure(xi, s, name, em) {
      let track = new RNASecondaryStructure(name, xi, this.tgraph.screenWidth(s.length), s, this.strand, this);
      track.tgraph.xi = xi;
      track.calculateSecondaryStructure(em);
      this.structures.push(track);
      return track;
    }

    parseMutationSyntax(mutation) {
      const regex = /^c\.(\d+)([-+]\d+)?([A-Z])>([A-Z])$/;
      const match = mutation.match(regex);
      if (match) {
        return {
          type: "SNP",
          position: parseInt(match[1], 10),
          offset: match[2] ? parseInt(match[2], 10) : 0,
          originalNucleotide: match[3],
          newNucleotide: match[4],
        };
      } else {
        const parts = mutation.split("delins");
        if (parts) {
          const positions = parts[0].substring(1).split("_");
          const newSequence = parts[1];
          const startPosition = parseInt(positions[0].substring(1));
          const endPosition = parseInt(positions[1]);
          const originalSequence = this.sequence.substring(startPosition, endPosition - startPosition);
          return {
            type: "delins",
            position: [startPosition, endPosition],
            originalNucleotide: originalSequence,
            newNucleotide: newSequence,
          };
        } else {
          throw new Error("Invalid mutation syntax");
        }
      }
    }

    generateTranslationAnnotation() { }

    codingToGenomic(coding) {
      let exonIndex = 0;
      let stopIndex = 0;
      let cstart = 0;
      let t = null;
      for (let a of this.annotations) {
        if (a.type === "Translation") {
          stopIndex = Math.abs(a.gxf - a.gxi);
          t = a;
        }
      }

      if (!t) {
        generateTranslationAnnotation();
      }

      let sorted_annotations = this.annotations;
      if (this.strand > 0)
        sorted_annotations.sort(function (a, b) {
          return parseFloat(a.xi) - parseFloat(b.xi);
        });
      else
        sorted_annotations.sort(function (a, b) {
          return parseFloat(b.xi) - parseFloat(a.xi);
        });

      for (let a of sorted_annotations) {
        if (a.type === "Exon") {
          a.gxi = Math.floor(a.gxi);
          a.gxf = Math.floor(a.gxf);
          a.xi = Math.floor(a.xi);
          a.xf = Math.floor(a.xf);
          if (this.strand < 0) {
            if (a.xf > t.xi && a.xi < t.xi) {
              cstart = t.xi;
              exonIndex = 1;
              for (let _i = t.xi - 1; _i >= a.xi; _i--) {
                if (exonIndex === coding) return _i;
                exonIndex++;
                if (exonIndex > stopIndex) break;
              }
            } else if (t.xf < a.xf && t.xf > a.xi) {
              for (let _i = a.xf; _i >= t.xf; _i--) {
                if (exonIndex === coding) return _i;

                exonIndex++;
                if (exonIndex > stopIndex) break;
              }
            } else {
              for (let _i = a.xf; _i >= a.xi; _i--) {
                if (exonIndex === coding) return _i;

                exonIndex++;
                if (exonIndex > stopIndex) break;
              }
            }
          } else {
            if (a.xf > t.xi && a.xi < t.xi) {
              exonIndex = 1;
              for (let _i = t.xi; _i <= a.xf; _i++) {
                if (exonIndex === coding) return _i;

                exonIndex++;
                if (exonIndex > stopIndex) break;
              }
            } else if (t.xf < a.xf && t.xf > a.xi) {
              for (let _i = a.xi; _i <= t.xf; _i++) {
                if (exonIndex === coding) return _i;

                exonIndex++;
                if (exonIndex > stopIndex) break;
              }
            } else {
              for (let _i = a.xi; _i <= a.xf; _i++) {
                if (exonIndex === coding) return _i;

                exonIndex++;
                if (exonIndex > stopIndex) break;
              }
            }
          }
        }
      }
    }

    // Genomic coordinate for a local (cDNA) index, computed EXON-ROOTED from the exon
    // annotations (each carries local xi/xf and genomic gxi/gxf). Used by child tracks to
    // label genomic positions. Falls back to trackRef.genomeMap, then a linear estimate.
    genomicAt(localIndex) {
      const anns = this.annotations || [];
      for (const a of anns) {
        if (!a || String(a.type).toLowerCase() !== 'exon') continue;
        if (a.gxi == null || a.xi == null || a.xf == null) continue;
        const lLo = Math.min(+a.xi, +a.xf), lHi = Math.max(+a.xi, +a.xf);
        if (localIndex >= lLo && localIndex <= lHi) {
          const gLo = (a.gxf != null) ? Math.min(+a.gxi, +a.gxf) : +a.gxi;
          return gLo + (localIndex - lLo);
        }
      }
      const gm = this.trackRef && this.trackRef.genomeMap;
      if (gm && gm.length && gm[localIndex] != null) return gm[localIndex];
      return (this.tgraph ? this.tgraph.xmin : this.xi) + localIndex;
    }

    // Inverse of genomicAt(): map a GENOMIC position onto this (child / cDNA / mRNA)
    // track's LOCAL coordinate using the exon annotations (their gxi/gxf genomic span
    // <-> xi/xf local span). Introns are spliced out of the child, so a position that
    // falls between exons returns null (the variant isn't on the mRNA).
    genomicToLocal(G) {
      const anns = this.annotations || [];
      for (const a of anns) {
        if (!a || String(a.type).toLowerCase() !== 'exon') continue;
        if (a.gxi == null || a.xi == null || a.xf == null) continue;
        const gLo = (a.gxf != null) ? Math.min(+a.gxi, +a.gxf) : +a.gxi;
        const gHi = (a.gxf != null) ? Math.max(+a.gxi, +a.gxf) : +a.gxi;
        if (G >= gLo && G <= gHi) {
          const lLo = Math.min(+a.xi, +a.xf);
          return lLo + (G - gLo);   // mirrors genomicAt's forward mapping
        }
      }
      // Fallback: reverse-lookup the genome map (localIndex -> genomic) if present.
      const gm = this.trackRef && this.trackRef.genomeMap;
      if (gm && gm.length) {
        const i = gm.indexOf(G);
        if (i >= 0) return i;
      }
      return null;
    }

    // Is this track a spliced child (cDNA / mRNA) rendered in local coordinates?
    isChildCDNATrack() {
      if (this.track_type === 'CDNA') return true;
      if (this.trackRef && this.trackRef.genomeMap && this.trackRef.genomeMap.length) return true;
      return (this.annotations || []).some(a => a && String(a.type).toLowerCase() === 'exon' && a.gxi != null);
    }

    // Can a variant at chromosome `chr`, 1-based genomic position `G` live on this track,
    // and if so where? Genomic tracks render in genomic world-coordinates (tgraph.X takes a
    // genomic position — see paste-rs-numbers-to-tracks.js), so the SNP's xi IS the genomic
    // position. Returns that xi, or null if the variant does not fall on this track. Failsafe.
    variantWorldX(chr, G) {
      try {
        if (G == null || !isFinite(G)) return null;
        const norm = (c) => ('' + (c == null ? '' : c)).toLowerCase().replace(/^chr/, '');
        if (this.chr != null && chr != null && norm(this.chr) !== norm(chr)) return null;

        // Child (cDNA / mRNA) track: it renders in LOCAL coordinates (0..len) with introns
        // spliced out, so place the variant via the EXON annotations — map its genomic
        // position to a local coordinate. A variant in an intron (no covering exon) is not
        // placed on the mRNA.
        if (this.isChildCDNATrack && this.isChildCDNATrack()) {
          return this.genomicToLocal(G);
        }

        // Genomic (parent) track: world coord == genomic position.
        // Genomic extent: prefer the render graph's world bounds, fall back to xi/xf.
        let lo, hi;
        if (this.tgraph && this.tgraph.xmin != null && this.tgraph.xmax != null) {
          lo = Math.min(this.tgraph.xmin, this.tgraph.xmax);
          hi = Math.max(this.tgraph.xmin, this.tgraph.xmax);
        } else if (this.xi != null && this.xf != null) {
          lo = Math.min(this.xi, this.xf);
          hi = Math.max(this.xi, this.xf);
        } else return null;
        if (G < lo || G > hi) return null;
        return G;
      } catch (e) { return null; }
    }

    // ---- Flanking genomic sequence (display-only reference; NOT part of the track) ----
    // Genomic position for a local index that lies OUTSIDE the track, extended linearly
    // from the boundary base's genomic coordinate in the strand direction. Failsafe.
    flankGenomicAt(seqIndex) {
      try {
        const len = this.sequence ? this.sequence.length : 0;
        if (len < 1) return null;
        if (seqIndex >= 0 && seqIndex < len) return this.genomicAt(seqIndex);
        const gA = this.genomicAt(0);
        const gB = this.genomicAt(len - 1);
        if (gA == null || gB == null) return null;
        const dir = (gB >= gA) ? 1 : -1;
        if (seqIndex < 0) return Math.round(gA + seqIndex * dir);
        return Math.round(gB + (seqIndex - (len - 1)) * dir);
      } catch (e) { return null; }
    }

    // Look up a flanking base from the cached window (or null). Failsafe.
    flankBaseAt(g) {
      try {
        const c = this.__flankCache;
        if (!c || g == null) return null;
        const i = c.revc ? (c.hi - g) : (g - c.lo);
        if (i < 0 || i >= c.seq.length) return null;
        return c.seq[i];
      } catch (e) { return null; }
    }

    // Fetch (and cache) the flanking genomic sequence covering [gLo, gHi]. Entirely
    // best-effort: any failure leaves the cache untouched, never throws, and — crucially —
    // never re-requests a window it already tried, so a miss can't hammer the server.
    ensureFlank(gLo, gHi) {
      try {
        if (this.__flankLoading) return;                                    // one fetch at a time
        if (!this.chr || !this.species || gLo == null || gHi == null) return;
        if (!isFinite(gLo) || !isFinite(gHi)) return;
        // Snap the window to a ~1kb grid so small pans reuse one request/cache entry.
        const GRID = 1000, PAD = 250;
        let lo = Math.floor((Math.min(gLo, gHi) - PAD) / GRID) * GRID;
        let hi = Math.ceil((Math.max(gLo, gHi) + PAD) / GRID) * GRID;
        if (lo < 1) lo = 1;
        if (hi - lo > 200000) return;                                       // sanity cap
        const c = this.__flankCache;
        if (c && c.chr === this.chr && lo >= c.lo && hi <= c.hi) return;   // already covered
        const strand = (this.strand === -1 || this.strand === '-1' || this.strand === '-') ? -1 : 1;
        const region = this.chr + ':' + lo + '..' + hi + ':' + strand;
        if (this.__flankTried === region) return;   // already attempted this exact window (hit or miss)
        this.__flankTried = region;                  // mark BEFORE the request so failures don't retry
        this.__flankLoading = true;
        const sp = ('' + this.species).toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const apiBase = (typeof window !== 'undefined' && window['env'] && window['env']['apiUrl']) ? window['env']['apiUrl'] : '';
        const url = apiBase + '/ensembl/region?species=' + encodeURIComponent(sp) + '&region=' + encodeURIComponent(region);
        const self = this;
        fetch(url).then((r) => (r && r.ok) ? r.text() : '').then((seq) => {
          self.__flankLoading = false;
          try {
            seq = ('' + (seq || '')).trim();
            if (seq && /^[ACGTNacgtn]+$/.test(seq) && Math.abs((hi - lo + 1) - seq.length) < 5) {
              // Ensembl returns strand -1 regions reverse-complemented, so seq[0] aligns to
              // genomic hi for - strand and genomic lo for + strand.
              self.__flankCache = { chr: self.chr, lo: lo, hi: hi, seq: seq, revc: strand === -1 };
            }
          } catch (e) { }
        }).catch(() => { self.__flankLoading = false; });
      } catch (e) { this.__flankLoading = false; }
    }

    getGenomicIndexForCDNAIndex(cdnaIndex) {
      let mut = this.parseMutationSyntax(cdnaIndex);

      if (mut && mut.type === "SNP") {
        mut.position = parseInt(mut.position);
        mut.offset = parseInt(mut.offset);
        let seq = "";
        let sorted_annotations = this.annotations;
        if (this.strand > 0)
          sorted_annotations.sort(function (a, b) {
            return parseFloat(a.xi) - parseFloat(b.xi);
          });
        else
          sorted_annotations.sort(function (a, b) {
            return parseFloat(b.xi) - parseFloat(a.xi);
          });
        let startIndex = -1;
        let endIndex = -1;
        for (let an of sorted_annotations) {
          if (an.type.toLowerCase() === "translation") {
            startIndex = an.xi;
            endIndex = an.xf;
          }
        }
        let cdsIndex = [];
        let codon_i = 0;
        let codon_ii = 0;
        let base_i = 1;
        let codon_value = "";
        let cds_i = false;
        if (this.strand > 0) {
          sorted_annotations.sort(function (a, b) {
            return parseFloat(a.xi) - parseFloat(b.xi);
          });
          for (let a of sorted_annotations) {
            if (a.type === "Exon") {
              let ai = a.xi;
              let af = a.xf;

              if (startIndex >= a.xi && startIndex < a.xf) {
                ai = startIndex;
                cds_i = true;
              }
              if (endIndex >= a.xi && endIndex < a.xf) {
                af = endIndex;
                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                  let geneIndex = gene_index + ai;
                  if (base_i === mut.position) {
                    return geneIndex + mut.offset;
                  }
                  base_i++;
                }
                seq += tt;
                cds_i = false;
              }
              if (cds_i) {
                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                  let geneIndex = gene_index + ai;
                  if (base_i === mut.position) {
                    return geneIndex + mut.offset;
                  }
                  base_i++;
                }
                seq += tt;
              }
            }
          }
        } else {
          sorted_annotations = sorted_annotations.sort(function (a, b) {
            return parseFloat(b.xi) - parseFloat(a.xi);
          });
          for (let a of sorted_annotations) {
            if (a.type === "Exon") {
              let ai = a.xi;
              let af = a.xf;
              if (startIndex > a.xi && startIndex <= a.xf) {
                af = startIndex - 1;
                cds_i = true;
              }
              if (endIndex > a.xi && endIndex <= a.xf) {
                ai = endIndex;
                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                  codon_value += tt[gene_index];
                  let geneIndex = gene_index + ai;
                  if (base_i === mut.position) {
                    return {
                      type: "SNP",
                      start: geneIndex + mut.offset,
                    };
                  }
                  base_i++;
                }
                seq += tt;
                cds_i = false;
              }
              if (cds_i) {
                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                  codon_value += tt[gene_index];
                  let geneIndex = gene_index + ai;
                  if (base_i === mut.position) {
                    return {
                      type: "SNP",
                      start: geneIndex + mut.offset,
                    };
                  }

                  base_i++;
                }
                seq += tt;
              }
            }
          }
        }
      } else if (mut && mut.type === "delins") {
        let positions = mut;
        let g = {
          type: "delins",
          start: this.codingToGenomic(mut.position[0] - 1),
          end: this.codingToGenomic(mut.position[1]),
        };
        return g;
      }
    }

    getGenomicStart() {
      let lowestGxi = Number.POSITIVE_INFINITY;
      this.annotations.forEach((annotation) => {
        const gxi = annotation.gxi;
        if (gxi !== undefined && gxi < lowestGxi) {
          lowestGxi = gxi;
        }
      });
      return lowestGxi;
    }

    getGenmoicEnd() {
      let largestGxf = Number.NEGATIVE_INFINITY;
      this.annotations.forEach((annotation) => {
        const gxf = annotation.gxf;
        if (gxf !== undefined && gxf > largestGxf) {
          largestGxf = gxf;
        }
      });
      return largestGxf;
    }
    createTrackFromAnnotation(annotation) {
      let seq = "";
      let _annotations = [];
      let _annotation_tag = annotation;

      if (annotation === "CDNA") {
        _annotation_tag = "Exon";
      }

      const sorted_annotations = [...this.annotations].sort((a, b) => {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });

      let seqindex = [];
      let genomeIndex = [];
      let sindex = 0;

      const exons = sorted_annotations.filter((a) => a.type === _annotation_tag);

      // this.sequence is either the full (intron-containing) sequence or the
      // exon-collapsed cDNA. If it's the cDNA, exon offsets (a.xi - this.xi) include
      // introns and overshoot after the first exon (only one exon comes through) —
      // detect that and index the cDNA by cumulative exon length instead.
      const totalExonLen = exons.reduce((s, a) => s + Math.max(0, Math.floor(a.xf - a.xi) + 1), 0);
      const spanLen = Math.abs(Math.floor(this.xf - this.xi));
      const isCdna = Math.abs(this.sequence.length - totalExonLen) <= Math.abs(this.sequence.length - spanLen);

      let cum = 0;
      for (let a of exons) {
        const len = Math.max(0, Math.floor(a.xf - a.xi) + 1);   // inclusive -> exclusive
        const start = isCdna ? cum : Math.max(0, Math.floor(a.xi - this.xi));
        let tt = this.sequence.substring(start, start + len);
        cum += len;

        if (tt && tt.length > 0) {
          let tr = new Annotation(a.type, a.name, seq.length, seq.length + tt.length - 1);
          // Carry genomic coords onto the child annotation. On a genomic parent the
          // annotation's own xi/xf are genomic, so fall back to them when gxi/gxf are unset.
          tr.gxi = (a.gxi != null ? a.gxi : a.xi);
          tr.gxf = (a.gxf != null ? a.gxf : a.xf);
          seq += tt;

          const base = Math.floor(a.xi - this.xi);
          for (let i = 0; i < tt.length; i++) {
            seqindex[sindex] = base + i;
            genomeIndex[sindex] = this.xi + base + i;
            sindex++;
          }
          _annotations.push(tr);
        }
      }

      const getx = (annotation, adjusted_aexons) => {
        let tr = new Annotation(annotation.type, annotation.name, annotation.strand);

        for (let a of adjusted_aexons) {
          if (a.type.toLowerCase() === "exon") {
            if (a.gxi <= annotation.xi && a.gxf >= annotation.xi) {
              let xdif = a.gxi - a.xi;
              tr.xi = annotation.xi - xdif;
              tr.gxi = annotation.xi;
            }

            if (a.gxi <= annotation.xf && a.gxf >= annotation.xf) {
              let xdif = a.gxi - a.xi;
              tr.xf = annotation.xf - xdif;
              tr.gxf = annotation.xf;
            }
          }
        }

        return tr;
      };

      // Carry over EVERY non-exon annotation, lifted to cDNA coords, and make sure each
      // one keeps its genomic coordinates (gxi/gxf) so the mRNA annotations can always
      // be related back to the genome (drives child<->parent sync and reporting).
      for (let a of sorted_annotations) {
        if (a.type === _annotation_tag) continue;   // exons already added above
        let liftover = getx(a, _annotations);
        if (liftover && liftover.xi != null && liftover.xf != null) {
          if (liftover.gxi == null) liftover.gxi = (a.gxi != null ? a.gxi : a.xi);
          if (liftover.gxf == null) liftover.gxf = (a.gxf != null ? a.gxf : a.xf);
          _annotations.push(liftover);
        }
      }


      // CDNA or mRNA in ANY case gives _mRNA; any other annotation names itself, so
      // building from Exon and from CDS no longer produces two tracks called the same
      // thing. Matches baja/bio/track-flexi.js, which carries the same method.
      const __ann = ('' + (annotation == null ? '' : annotation)).trim();
      let suf = (/^(cdna|mrna)$/i.test(__ann) || !__ann) ? '_mRNA' : ('_' + __ann);


      let track = new Track(this.name + suf, 0, seq.length - 1, null, this.strand);

      track.sequence = seq;
      track.chr = this.chr;
      track.annotations = _annotations;

      // Identity carried onto the derived track: species for the caption tab, and
      // transcriptID / geneID because the transcript-keyed layers (bed-hits.js,
      // patents.js) look a track up by them and otherwise fall through to the name,
      // which after the _mRNA suffix matches nothing in a BED.
      track.species = this.species;
      track.transcriptID = this.transcriptID;
      track.geneID = this.geneID;
      track.description = this.description;

      // Carry over the genomic span for the mRNA/cDNA track itself. Local xi/xf stay
      // 0..len (cDNA rendering depends on that); gxi/gxf hold the genomic coordinates,
      // taken from the transcript's exon span.
      let gmin = null, gmax = null;
      for (let tr of _annotations) {
        if (tr.gxi != null) gmin = (gmin == null) ? tr.gxi : Math.min(gmin, tr.gxi);
        if (tr.gxf != null) gmax = (gmax == null) ? tr.gxf : Math.max(gmax, tr.gxf);
      }
      track.gxi = (gmin != null ? gmin : (this.gxi != null ? this.gxi : this.xi));
      track.gxf = (gmax != null ? gmax : (this.gxf != null ? this.gxf : this.xf));

      track.tgraph.xi = this.tgraph.xi;
      track.tgraph.yi = this.tgraph.yi + Math.abs(this.tgraph.height) + 2;
      track.track_type = "CDNA";
      track.tgraph.width = seq.length;
      track.tgraph.rescale();

      let trackRef_ = new TrackRef(this, this.xi, this.xf);
      trackRef_.map = seqindex;
      trackRef_.genomeMap = genomeIndex;

      track.trackRef = trackRef_;

      return track;
    }
    setSequence(sequence) {
      this.sequence = sequence;
      // Keep the CDS in sync whenever the nucleotides are (re)set, if start+stop are
      // annotated. No-op during initial load (annotations not added yet).
      try { this.updateCDS(); } catch (e) { }
    }

    async addTrackPlot() {
      let start = -1;
      let end = 0;
      for (let o of this.oligos) {
        if (o.xi < start || start < 0) {
          start = o.xi;
          end = o.xf;
        }
        if (o.xf > end) {
          end = o.xf;
        }
        o.percent_control = Math.random() * 100;
      }
      let tr = new TrackPlot("plot", start, this.y, end - start, 1, start, end, this.oligos);
      this.plots.push(tr);
    }

    getHighlightedSequence() {
      if (this.markstart != null && this.markstart >= 0) {
        // markstart/markend may be WORLD coords (>= xi) or 0-based offsets (< xi) — normalize both
        // to 0-based sequence indices.
        const toIdx = (m) => { m = Math.floor(m); return (m >= this.xi) ? (m - this.xi) : m; };
        let startindex = toIdx(this.markstart);
        let endindex = toIdx(this.markend);

        if (this.sequence) {
          return this.sequence.substring(startindex, endindex);
        }
      }
      return null;
    }

    toggleAnnotations() {
      this.showAnnotaions = !this.showAnnotaions;
    }


    // THE SELECTED SEQUENCE, as one answer every caller can share.
    //
    // markstart/markend are written by several different places, and not all of them in the
    // same space: some set world coordinates, some set an offset from the track origin. On a
    // spliced track xi is 0 and the two are identical, which is why a call site could be wrong
    // for years and look right. Normalised here, once, so no caller has to guess:
    //
    //   selectedRange()     absolute world coords {start, end}, or null when nothing is picked
    //   selectedOffset()    the same start as an index into this.sequence (start - xi)
    //   selectedSequence()  the bases inside it
    //
    // A mark already inside [xi, xf] is taken as absolute; one outside it is read as an offset
    // and xi is added. That is right in both conventions instead of right in one of them.
    selectedRange() {
      try {
        let s = this.markstart, e = this.markend;
        if (s == null || e == null || !isFinite(s) || !isFinite(e)) return null;
        if (s < 0 || !(e > s)) return null;
        const lo = Math.min(this.xi, this.xf), hi = Math.max(this.xi, this.xf);
        const inSpan = (v) => (v >= lo && v <= hi);
        if (!(inSpan(s) && inSpan(e))) { s = this.xi + s; e = this.xi + e; }
        const a = Math.floor(Math.min(s, e)), b = Math.ceil(Math.max(s, e));
        if (!(b > a)) return null;
        // Clamp: a drag past either end must not ask for bases the track does not have.
        return { start: Math.max(lo, a), end: Math.min(hi, b) };
      } catch (err) { return null; }
    }

    selectedOffset() {
      const r = this.selectedRange();
      return r ? Math.max(0, Math.floor(r.start - this.xi)) : 0;
    }

    selectedSequence() {
      const r = this.selectedRange();
      if (!r) return '';
      try { return this.getSequenceRange(r.start, r.end) || ''; } catch (e) { return ''; }
    }

    getSequenceRange(start, end) {
      let seq_index_start = Math.floor(start) - this.xi;
      let seq_index_end = Math.floor(end) - this.xi;
      let s = "";
      for (let i = seq_index_start; i < seq_index_end; i++) {
        if (this.sequence[i]) {
          s += this.sequence[i];
        }
      }
      return s;
    }
    getSequenceForAnnotation(annotation) {
      let seq = "";
      let _annotations = [];
      let _annotation_sequence = [];
      let _annotation_tag = annotation;
      if (annotation == "CDNA") {
        _annotation_tag = "Exon";
      }
      let sorted_annotations = this.annotations;
      sorted_annotations.sort(function (a, b) {
        return parseFloat(a.xi) - parseFloat(b.xi);
      });
      let seqindex = [];
      let sindex = 0;
      let genomeIndex = [];
      for (let a of sorted_annotations) {
        if (a.type === _annotation_tag) {
          let tt = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi));
          if (tt && tt.length > 0) {
            let tr = new Annotation(a.type, a.name, seq.length, seq.length + tt.length);
            tr.gxi = a.gxi;
            tr.gxf = a.gxf;
            seq += tt;
            for (let aindex = a.xi - this.xi; aindex < Math.floor(a.xf - this.xi); aindex++) {
              seqindex[sindex] = aindex;
              genomeIndex[sindex] = this.xi + aindex;
              sindex++;
            }
            _annotation_sequence.push(tt);
            _annotations.push(tr);
          }
        }
      }

      let getx = (annotation, adjusted_aexons) => {
        let tr = new Annotation(annotation.type, annotation.name, annotation.strand);
        for (let a of adjusted_aexons) {
          if (a.type.toLowerCase() === "exon") {
            if (a.gxi < annotation.xi && a.gxf > annotation.xi) {
              let xdif = a.gxi - a.xi;
              tr.xi = annotation.xi - xdif;
              tr.gxi = annotation.xi;
            }
            if (a.gxi < annotation.xf && a.gxf > annotation.xf) {
              let xdif = a.gxi - a.xi;
              tr.xf = annotation.xf - xdif;
              tr.gxi = annotation.xf;
            }
          }
        }
        return tr;
      };

      let gxi = this.xi;
      let gxf = this.xf;
      for (let a of sorted_annotations) {
        if (a.type.toLowerCase() === "translation" || a.type.toLowerCase() === "tss" || a.type.toLowerCase() === "stop") {
          let liftover = getx(a, _annotations);
          if (liftover) {
            _annotations.push(liftover);
          }
        }
      }

      return { _annotations, _annotation_sequence };
    }

    getAttributionScore(x, attribution_type) {
      let sum = 0.0;
      for (let a of this.track_layers) {
        if (a.attribution_type && a.attribution_type === attribution_type) {
          let v = a.getScore(x);
          sum += v.y;
        }
      }
      return -1 * sum;
    }

    getSequenceRange__(start, end) {
      let seq_index_start = Math.floor(start) - this.tgraph.xmin;
      let seq_index_end = Math.floor(end) - this.tgraph.xmin;
      let s = "";
      for (let i = seq_index_start; i < seq_index_end; i++) {
        s += this.sequence[i];
      }
      return s;
    }

    getSequence() {
      return this.sequence;
    }

    doRectanglesOverlap(rect1, rect2) {
      var rect1_x1 = rect1.xi - 1;
      var rect1_y1 = rect1.y;
      var rect2_x1 = rect2.xi;
      var rect2_y1 = rect2.y;

      var rect1_x2 = rect1.xf + 2;
      var rect1_y2 = rect1.y + rect1.getHeight();
      var rect2_x2 = rect2.xf;
      var rect2_y2 = rect2.y + rect2.getHeight();

      if (rect1_x1 < rect2_x2 && rect1_x2 > rect2_x1 && rect1_y1 < rect2_y2 && rect1_y2 > rect2_y1) {
        return true;
      } else {
        return false;
      }
    }

    setColor(color) {
      this.color = color;
    }

    addOligo(oligo) {
      // Wake the graph's redraw loop so newly added oligos paint even while idle.
      if (this.__gg && this.__gg.wake) this.__gg.wake();
      if (oligo === undefined) {
        console.log(" oligo was null so rejecting.... ");
        return;
      }

      if (oligo.synthesisSequence != null && oligo.structure != null && oligo.synthesisSequence.length > 0 && oligo.structure.length > 0) {
        setTimeout(async () => {
          const dbhost = window["env"]["db"];
          if (dbhost) {
            let r = await POSTJSON([oligo], `${dbhost}/verify`);

            const key = `${oligo.synthesisSequence}-${oligo.structure}`;
            if (r[key] && r[key].id) {
              oligo.id = r[key].id;
            }
          }
        }, 1000);
      }

      for (let o of this.oligos) {
        if (o.synthesisSequence === oligo.synthesisSequence && o.structure === oligo.structure && o.name === oligo.name && o.id === oligo.id) {
          console.log(" Oligo was rejected on this track because it is a duplicate ");
          return;
        }
      }
      if (oligo.synthesisSequence && (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0)) {
        if (this.strand < 0) {
          oligo.synthesisSequence = Biopolymer.comp(oligo.sequence);
        } else {
          oligo.synthesisSequence = Biopolymer.reverseComp(oligo.sequence);
        }
      }
      if (oligo.setStrand) {
        oligo.setStrand(this.strand);
      }

      // Stack upward until the new oligo clears EVERY existing one — see track-flexi.js.
      // A single pass could clear o1, then move up for o3 and land back on o1.
      {
        if (oligo.y <= 0.01) oligo.y = 0.1;
        let guard = 0;
        let moved = true;
        while (moved && guard < 2000) {
          moved = false;
          for (const o of this.oligos) {
            while (this.doRectanglesOverlap(o, oligo) && guard < 2000) {
              oligo.setY((oligo.y += 0.01));
              guard++;
              moved = true;
            }
          }
        }
      }
      this.oligos.push(oligo);
      if (oligo.y >= this.tgraph.ymax) {
        this.tgraph.ymax = oligo.y + 0.11;
        this.tgraph.rescale();
      }
    }

    // Shrink the track's vertical (y) extent to the smallest range that still
    // contains every item — so the track is as short as possible while showing
    // all oligos/annotations/SNPs. Also repairs a ymax left inflated by a bad y.
    fitYAxis() {
      if (!this.tgraph) return;
      let maxY = 0;
      const scan = (arr) => {
        if (!arr) return;
        for (const o of arr) {
          let yy = (o && typeof o.y === 'number') ? o.y
            : (o && typeof o.getY === 'function' ? o.getY() : 0);
          if (typeof yy === 'number' && isFinite(yy) && yy > maxY) maxY = yy;
        }
      };
      scan(this.oligos);
      scan(this.annotations);
      scan(this.snpindels);
      const newMax = Math.max(maxY + 0.2, 0.5);   // small padding above the top item
      if (isFinite(newMax) && newMax > 0) {
        this.tgraph.ymax = newMax;
        this.tgraph.rescale();
      }
    }
    addsnpindel(snpindel) {
      this.snpindels.push(snpindel);
    }

    removesnp(snpindel) {
      const index = this.snpindels.indexOf(snpindel);
      if (index > -1) {
        this.snpindels.splice(index, 1);
      }
    }

    gff(g) {
      this.addGFF(g);
    }

    getAnnotationByName(name) {
      for (let annotation of this.annotations) {
        console.log("name " + annotation.name);

        if (annotation.name.toLowerCase() === name.toLowerCase()) {
          return annotation;
        }
      }
    }

    findNearestAnnotation(targetX, annotationType) {
      if (!annotationType || annotationType == null) {
        if (this.annotations.length === 0) return null;
        let nearestObject = this.annotations[0];
        let smallestDifference = Math.abs(this.annotations[0].xi - targetX);
        this.annotations.forEach((obj) => {
          const difference = Math.abs(obj.xi - targetX);
          if (difference < smallestDifference) {
            smallestDifference = difference;
            nearestObject = obj;
          }
        });
        return nearestObject;
      } else {
        const filteredArr = annotationType ? this.annotations.filter((obj) => obj.type === annotationType) : this.annotations;
        if (filteredArr.length === 0) return null;
        let nearestObject = filteredArr[0];
        let smallestDifference = Math.abs(filteredArr[0].xi - targetX);
        filteredArr.forEach((obj) => {
          const difference = Math.abs(obj.xi - targetX);
          if (difference < smallestDifference) {
            smallestDifference = difference;
            nearestObject = obj;
          }
        });
        return nearestObject;
      }
    }

    getAnnotation(x, y) {
      if (y < 0) {
        y = y * -1;
      }
      let selected = [];
      let yv = Math.floor(y);
      let xv = Math.floor(x);
      console.log(" yv " + yv + " y " + this.y);
      if (yv === this.y) {
        for (let annotation of this.annotations) {
          if (annotation.inAnnotation(xv)) {
            selected.push(annotation);
          }
        }
      }
      return selected;
    }

    quickHighlightOligos() {
      for (let o of this.oligos) {
        o.highlight__ = true;
      }

      setTimeout(() => {
        for (let o of this.oligos) {
          o.highlight__ = false;
        }
      }, 15000);
    }

    getAnnotationX(x) {
      let selected = [];
      let xv = Math.floor(x);
      for (let annotation of this.annotations) {
        if (annotation.inAnnotation(xv)) {
          selected.push(annotation);
        }
      }
      return selected;
    }

    removeDuplicateAnnotations() {
      let an = {};
      for (let o of this.annotations) {
        an[o.name] = o;
      }
      let nkey = Object.keys(an);
      this.annotations = [];
      for (let i of nkey) {
        this.annotations.push(an[i]);
      }
      let selected = {};
      for (let sid of this.snpindels) {
        selected[sid.name] = sid;
      }
      this.snpindels = [];
      let keys = Object.keys(selected);
      for (let k of keys) {
        this.snpindels.push(selected[k]);
      }
    }

    removeDuplicateSnps() {
      let selected = {};
      for (let sid of this.snpindels) {
        selected[sid.name] = sid;
      }
      this.snpindels = [];
      let keys = Object.keys(selected);
      for (let k of keys) {
        this.snpindels.push(selected[k]);
      }
    }

    getAnnotationsInRange(xstart, xend) {
      let selected = [];
      for (let o of this.annotations) {
        if (xstart <= o.xi && xend >= o.xf) {
          selected.push(o);
        } else if (o.inAnnotation(xstart) || o.inAnnotation(xend)) {
          selected.push(o);
        }
      }
      return selected;
    }

    getOligosInRange(xstart, xend) {
      let selected = [];
      for (let o of this.oligos) {
        if (xstart <= o.xi && xend >= o.xf) {
          selected.push(o);
        } else if (o.inAnnotation(xstart) || o.inAnnotation(xend)) {
          selected.push(o);
        }
      }
      return selected;
    }

    getClosestSnpindel2D({ xWorld, yScreen, graph, selectedTrack, maxDistPx = 12, mode = "glyph" }) {
      const tg = selectedTrack?.tgraph;
      if (!tg) return null;

      const STYLE = {
        baseR: 4,
        maxR: 8,
        minStem: 10,
      };

      const trackYminWorld = tg.ymin;
      const trackYminScreen = graph.Y(tg.Y(trackYminWorld));

      const maxStem = Math.min(80, Math.max(10, Math.floor(graph.screenHeight(tg.height) * 0.15)));

      const getPhaseDirs = (s) => {
        const p = Number.isFinite(+s.phase) ? +s.phase : 0;
        switch (p) {
          case 2:
            return [];
          case 3:
            return [-1];
          case 1:
            return [+1];
          case 0:
          default:
            return [-1];
        }
      };

      const glyphRadiusPx = (s) => {
        const len = s.type === "snp" ? 1 : Math.abs(s.len ?? 1);
        return s.type === "snp" ? STYLE.baseR : Math.min(STYLE.maxR, Math.max(STYLE.baseR, STYLE.baseR + Math.floor(len / 5)));
      };

      const distPointToSegment = (px, py, ax, ay, bx, by) => {
        const abx = bx - ax,
          aby = by - ay;
        const apx = px - ax,
          apy = py - ay;
        const ab2 = abx * abx + aby * aby;
        const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const cx = ax + t * abx,
          cy = ay + t * aby;
        const dx = px - cx,
          dy = py - cy;
        return Math.sqrt(dx * dx + dy * dy);
      };

      const cursorX = graph.X(tg.X(xWorld));

      let bestDxPx = Infinity;
      const candidates = [];
      const xTieBandPx = 1.0;

      for (const s of this.snpindels || []) {
        const xi = s.xi;
        const xf = s.xf ?? s.xi;

        const inside = xWorld >= xi && xWorld <= xf;

        let dxPx;
        if (inside) {
          dxPx = 0;
        } else {
          const dxWorld = xWorld < xi ? xi - xWorld : xWorld - xf;

          const cursorX = graph.X(tg.X(xWorld));
          const px1 = graph.X(tg.X(xWorld + dxWorld));
          dxPx = Math.abs(px1 - cursorX);
        }

        if (!inside && maxDistPx != null && dxPx > maxDistPx) continue;

        if (dxPx === 0) {
          if (bestDxPx !== 0) {
            bestDxPx = 0;
            candidates.length = 0;
          }
          candidates.push(s);
          continue;
        }

        if (bestDxPx === 0) continue;

        if (dxPx + xTieBandPx < bestDxPx) {
          bestDxPx = dxPx;
          candidates.length = 0;
          candidates.push(s);
        } else if (Math.abs(dxPx - bestDxPx) <= xTieBandPx) {
          candidates.push(s);
        }
      }

      if (!candidates.length) return null;

      const gatePx = 10;

      const yDistToVerticalSegment = (py, ay, by) => {
        const y0 = Math.min(ay, by);
        const y1 = Math.max(ay, by);
        if (py < y0) return y0 - py;
        if (py > y1) return py - y1;
        return 0;
      };

      for (const s of candidates) {
        const sx = graph.X(tg.X(s.xi)) + 1;
        const dx = Math.abs(cursorX - sx);
        if (dx > gatePx) continue;

        const minLen = STYLE.minStem;
        const maxLen = maxStem;

        const dirs = getPhaseDirs(s);
        if (!dirs.length) continue;

        for (const dir of dirs) {
          const edir = -dir;
          const cy = trackYminScreen;

          const minLen = STYLE.minStem;
          const maxLen = maxStem;

          const yForLen = edir > 0 ? -s.y : s.y;

          let targetLen;
          if (Math.abs(yForLen) < 0.5) {
            targetLen = minLen;
          } else {
            const span = Math.max(1, maxLen - minLen);
            const baseLen = minLen + Math.abs(Math.floor((yForLen * 7) % span));
            targetLen = Math.max(minLen, Math.min(maxLen, baseLen));
          }

          const by = cy + edir * targetLen;

          let ok = false;

          if (mode === "glyph") {
            const dy = Math.abs(yScreen - by);
            ok = dy <= gatePx;
          } else if (mode === "stem") {
            const dy = yDistToVerticalSegment(yScreen, cy, by);
            ok = dy <= gatePx;
          } else {
            const dyGlyph = Math.abs(yScreen - by);
            const dyStem = yDistToVerticalSegment(yScreen, cy, by);
            ok = dyGlyph <= gatePx || dyStem <= gatePx;
          }

          if (!ok) continue;

          return s;
        }
      }

      return null;
    }
    getNearestSnpindels(x, graph, limit = 10) {
      const candidates = [];

      const mt = this.getAnnotations("mutation-annotation");
      if (mt && mt.length > 0) {
        for (const m of mt) {
          const xi = Number(m.xi);
          const xf = Number(m.xf);
          const dist = Number.isFinite(xi) && Number.isFinite(xf) ? (x >= xi && x <= xf ? 0 : Math.min(Math.abs(x - xi), Math.abs(x - xf))) : Number.isFinite(xi) ? Math.abs(x - xi) : Infinity;

          candidates.push({ obj: m, dist });
        }
      }

      for (const sid of this.snpindels) {
        const xi = Number(sid.xi);
        const xf = Number(sid.xf);

        if (!Number.isFinite(xi) && !Number.isFinite(xf)) continue;

        let dist;

        if (Number.isFinite(xi) && Number.isFinite(xf) && x >= xi && x <= xf) {
          dist = 0;
        } else if (Number.isFinite(xi) && Number.isFinite(xf)) {
          dist = Math.min(Math.abs(x - xi), Math.abs(x - xf));
        } else if (Number.isFinite(xi)) {
          dist = Math.abs(x - xi);
        } else {
          dist = Math.abs(x - xf);
        }

        if (graph && typeof sid.inAnnotation === "function") {
          try {
            const eps = 0.5;
            if (sid.inAnnotation(x - eps, x + eps, this.tgraph, graph)) {
              dist = 0;
            }
          } catch (e) { }
        }

        candidates.push({ obj: sid, dist });
      }

      candidates.sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist;

        const axi = Number(a.obj.xi);
        const bxi = Number(b.obj.xi);

        if (this.strand > 0) return axi - bxi;
        return bxi - axi;
      });

      return candidates.slice(0, limit).map((c) => c.obj);
    }

    getSnpindelsInRange(xstart, xend, graph) {
      let selected = [];
      let mt = this.getAnnotations("mutation-annotation");

      if (mt && mt.length > 0) {
        selected = mt.slice();
      }

      for (let sid of this.snpindels) {
        const hasPointInside = (sid.xi >= xstart && sid.xi <= xend) || (sid.xf >= xstart && sid.xf <= xend) || (sid.xi < xstart && sid.xf > xstart);

        if (hasPointInside) {
          selected.push(sid);
        } else if (sid.inAnnotation(xstart, xend, this.tgraph, graph)) {
          selected.push(sid);
        }
      }

      return selected;
    }

    getOligo(x, y, graph) {
      let selected = [];

      for (let o of this.oligos) {
        if (o != null && o.over != null && graph != null)
          if (o.over(x, y, graph, this.tgraph)) {
            selected.push(o);
          }
      }
      return selected;
    }

    getSelectedOligos() {
      let selected = [];
      for (let o of this.oligos) {
        if (o.selected) selected.push(o);
      }
      return selected;
    }

    highlightFeature(feature_type, feature) {
      let hl = highlighters[feature_type + "." + feature];
      this.highlight_features[feature_type + "." + feature] = hl;
    }

    clearHighlights() {
      this.markend - 1;
      this.highlight_features = {};
      for (let s of this.snpindels) {
        s.highlight = false;
      }
      for (let o of this.oligos) {
        o.highlight__ = false;
      }
    }

    getSnpindel(x, y) {
      if (y < 0) {
        y = y * -1;
      }
      let selected = [];
      let yv = Math.floor(y);
      let xv = this.xi + x;
      for (let sid of this.snpindels) {
        if (sid.inAnnotation(xv)) {
          selected.push(sid);
        }
      }
      return selected;
    }

    async fetchSnpindel(x, y, range) {
      let phaseSelect = null;
      if (y !== null && y < 0) {
        phaseSelect = 0;
      } else if (y !== null && y >= 0) {
        phaseSelect = 1;
      }

      let closest = null;
      let closestdist = null;
      for (let sid of this.snpindels) {
        if (sid.phase == phaseSelect || phaseSelect === null) {
          let dist = Math.min(Math.abs(sid.xi - x), Math.abs(sid.xf - x));
          if (dist < range) {
            if (closest && closestdist && dist < closestdist) {
              closest = sid;
              closestdist = dist;
            } else if (closest === null) {
              closest = sid;
              closestdist = dist;
            }
          }
        }
      }
      return closest;
    }

    async neighborSnpindel(snpindel, range, phase) {
      let neighbors = [];
      for (let sid of this.snpindels) {
        if (sid.id != snpindel.id && sid.phase == snpindel.phase && phase == 1) {
          let dist = Math.min(Math.abs(sid.xi - snpindel.xf), Math.abs(sid.xf - snpindel.xi), Math.abs(sid.xi - snpindel.xi));
          if (dist < range) {
            neighbors.push(sid);
          }
        } else if (sid.id != snpindel.id && sid.phase != snpindel.phase && phase == 0) {
          let dist = Math.min(Math.abs(sid.xi - snpindel.xf), Math.abs(sid.xf - snpindel.xi), Math.abs(sid.xi - snpindel.xi));
          if (dist < range) {
            neighbors.push(sid);
          }
        }
      }
      return neighbors;
    }

    async phasesnpindels(phase) {
      let variants_phase = [];
      let variants_alt = [];
      let opp = null;

      for (let sid of this.snpindels) {
        if (sid.phase == phase) {
          opp = await this.neighborSnpindel(sid, 30, 0);
          if (opp.length == 0) {
            variants_phase.push(sid);
          } else {
            let hasopp = 0;
            for (let o of opp) {
              if (o.xi == sid.xi && o.alternate0 == sid.alternate0) {
                hasopp = 1;
                break;
              }
            }
            if (!hasopp) {
              variants_phase.push(sid);
            }
          }
        } else if (sid.phase != phase) {
          opp = await this.neighborSnpindel(sid, 30, 0);

          if (opp.length == 0) {
            variants_alt.push(sid);
          } else {
            let hasopp = 0;
            for (let o of opp) {
              if (o.xi == sid.xi && o.alternate0 == sid.alternate0) {
                hasopp = 1;
                break;
              }
            }
            if (!hasopp) {
              variants_alt.push(sid);
            }
          }
        }
      }
      return [variants_phase, variants_alt];
    }

    liftSnpindels() {
      let mapConverter = {};
      if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
        this.trackRef.genomeMap.forEach((element, index) => {
          mapConverter[element] = index;
        });

        if (this.trackRef.track.snpindels && this.trackRef.track.snpindels.length > 0) {
          for (let sid of this.trackRef.track.snpindels) {
            if (this.trackRef.genomeMap.includes(sid.xi)) {
              let _sid = new SnpIndel(sid.type, mapConverter[sid.xi], sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id + "*");

              _sid.name = sid.name;

              this.snpindels.push(_sid);
            } else if (this.trackRef.genomeMap.includes(sid.xf)) {
              let _sid = new SnpIndel(sid.type, mapConverter[sid.xf - sid.reference.length], sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id + "*");
              _sid.name = sid.name;

              this.snpindels.push(_sid);
            }
          }
        }
      }
    }

    liftLayers() {
      let mc = {};
      if (!(this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0)) return;
      this.trackRef.genomeMap.forEach((element, index) => { mc[element] = index; });
      const inMap = (g) => mc[g] !== undefined;
      const rm = (g) => mc[g];
      const layers = this.trackRef.track.track_layers;
      if (!layers || !layers.length) return;
      const childLen = (this.sequence && this.sequence.length) ? this.sequence.length : Math.abs(this.xf - this.xi);
      for (let tl of layers) {
        try {
          let ttl = Object.assign(new TrackLayer(), JSON.parse(JSON.stringify(tl)));
          // intervals (RBP / IP / patents): remap endpoints, accept inclusive or exclusive x2
          let ivs = [];
          for (let iv of (tl.intervals || [])) {
            if (!inMap(iv.x1)) continue;
            let x2m;
            if (inMap(iv.x2)) x2m = rm(iv.x2);
            else if (inMap(iv.x2 - 1)) x2m = rm(iv.x2 - 1) + 1;
            else continue;
            ivs.push(Object.assign({}, iv, { x1: rm(iv.x1), x2: x2m }));
          }
          ttl.intervals = ivs;
          // polygon points (RNASeq / wiggle): remap x to child-local (exon bases only)
          let pts = [];
          for (let pt of (tl.polygonpts || [])) {
            const gx = Math.floor(pt.x);
            if (inMap(gx)) pts.push({ x: rm(gx), y: pt.y });
          }
          ttl.polygonpts = pts;
          // rebuild a real MGrid tgraph for the child coordinate range (JSON clone strips it)
          const src = tl.tgraph || {};
          ttl.tgraph = new MGrid(0, 0, 100, 100);
          ttl.tgraph.xi = 0; ttl.tgraph.yi = 0;
          ttl.tgraph.setxmax(childLen);
          ttl.tgraph.setymax(src.ymax != null ? src.ymax : 1);
          ttl.tgraph.setxmin(0);
          ttl.tgraph.setymin(src.ymin != null ? src.ymin : 0);
          if (ttl.tgraph.setInset) ttl.tgraph.setInset(0, 0);
          ttl.tgraph.rescale();
          if (ivs.length || pts.length) this.addLayer(ttl);
        } catch (e) { }
      }
    }

    liftPlots() {
      let mapConverter = {};
      if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
        this.trackRef.genomeMap.forEach((element, index) => {
          mapConverter[element] = index;
        });
        if (this.trackRef.track.plots && this.trackRef.track.plots.length > 0) {
          for (let sid of this.trackRef.track.plots) {
            if (this.trackRef.genomeMap.includes(sid.x)) {
              if (sid.mg != null) {
                let tp = Object.assign(new TrackPlot(), sid);
                let amg = Object.assign(new MGrid(), sid.mg);
                tp.mg = amg;
                tp.x = mapConverter[tp.x];

                this.plots.push(tp);
              } else {
                let tp = Object.assign(new Barchart(), sid);
                tp.x = mapConverter[tp.x];

                this.plots.push(tp);
              }
            }
          }
        }
      }
    }

    liftCompounds() {
      let mapConverter = {};
      if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
        this.trackRef.genomeMap.forEach((element, index) => {
          mapConverter[element] = index;
        });

        if (this.trackRef.track.oligos && this.trackRef.track.oligos.length > 0) {
          for (let sid of this.trackRef.track.oligos) {
            if (this.trackRef.genomeMap.includes(sid.xi) && this.trackRef.genomeMap.includes(sid.xf)) {
              let ostring = JSON.parse(JSON.stringify(sid));

              let ob = Object.assign(new Oligo(), ostring);
              ob.xi = mapConverter[ob.xi];
              ob.xf = mapConverter[ob.xf];

              this.addOligo(ob);
            }
          }
        }
      }
    }

    // Compact signature of the parent's mirrorable items — changes whenever a parent
    // item is added, removed, or moved, so the child only re-mirrors when the parent
    // actually changed (leaving the child's own items and edits alone in between).
    _parentMirrorSignature(p) {
      let s = '';
      const add = (arr, f) => {
        if (!Array.isArray(arr)) { s += '|0'; return; }
        s += '|' + arr.length;
        for (let o of arr) { if (o) s += ';' + f(o); }
      };
      add(p.oligos, (o) => (o.type || '') + ',' + o.xi + ',' + o.xf + (o.left && o.right ? ',' + o.left.xi + ',' + o.right.xf : ''));
      add(p.snpindels, (o) => o.xi + ',' + o.xf);
      add(p.track_layers, (o) => (o.name || '') + ',' + (o.intervals ? o.intervals.length : 0) + ',' + (o.polygonpts ? o.polygonpts.length : 0));
      add(p.plots, (o) => o.x);
      add(p.structures, (o) => o.xi + ',' + o.xf);
      return s;
    }

    // Mirror in-range items from the parent track (this.trackRef.track) onto this
    // child, remapping genomic coordinates to child-local (genomeMap for a cDNA child,
    // identity-in-range for a genomic child). Mirrored copies are tagged __mirror so a
    // parent change can replace them wholesale; the child's native items are untouched.
    // Child edits to a mirrored item survive until the next parent change (editable,
    // but re-synced). Driven each redraw tick by the engine's syncChildTracks().
    // Hash of a parent object's synced representation — changes when it moves or its
    // content changes, so the per-draw diff can add/remove exactly what differs.
    _syncHash(o, kind) {
      if (kind === 'oligo') return 'O|' + (o.type || '') + '|' + o.xi + '|' + o.xf
        + '|' + (o.left ? o.left.xi + ':' + o.left.xf : '') + '|' + (o.right ? o.right.xi + ':' + o.right.xf : '')
        + '|' + (o.sequence || o.name || '');
      if (kind === 'layer') return 'L|' + (o.name || '') + '|' + (o.data_type || '') + '|' + (o.intervals ? o.intervals.length : 0) + '|' + (o.polygonpts ? o.polygonpts.length : 0);
      if (kind === 'snp') return 'S|' + o.xi + '|' + o.xf + '|' + (o.reference || '') + '|' + (o.alternate || '');
      if (kind === 'plot') return 'P|' + o.x;
      if (kind === 'struct') return 'X|' + o.xi + '|' + o.xf;
      return '';
    }

    // Per-draw diff sync: hash every syncable parent object, remove child mirrors whose
    // source hash is gone, and push a fresh read-only copy for any parent hash not yet
    // present on the child. Driven each redraw tick by the engine's syncChildTracks().
    syncFromParent() {
      if (!this.trackRef || !this.trackRef.track) return;
      const p = this.trackRef.track;
      if (p === this) return;

      // EXON-ROOTED mapping. Match parent exons to child exons (genomic order). Parent
      // oligos/amplicons live in the PARENT's coordinate space, so the map keys on the
      // parent exon's xi/xf (pLo/pHi) -> child-local xi (lLo). This is equivalent to the
      // genomeMap but exon-based, so it handles any position inside an exon. Also refresh
      // (diff-based) the child exon genomic coords + track genomic span for labeling.
      const exonMap = [];
      try {
        const isExon = (a) => a && String(a.type).toLowerCase() === 'exon';
        const pExons = (p.annotations || []).filter(isExon).slice().sort((x, y) => (+x.xi) - (+y.xi));
        const cExons = (this.annotations || []).filter(isExon).slice().sort((x, y) => (+x.xi) - (+y.xi));
        const exonHash = pExons.map(e => (+e.xi) + ':' + (+e.xf)).join('|');
        const refresh = (exonHash !== this.__exonSyncHash);
        if (refresh) this.__exonSyncHash = exonHash;
        for (let i = 0; i < cExons.length && i < pExons.length; i++) {
          const pe = pExons[i], ce = cExons[i];
          if (refresh) {
            ce.gxi = (pe.gxi != null ? pe.gxi : pe.xi);
            ce.gxf = (pe.gxf != null ? pe.gxf : pe.xf);
          }
          if (pe.xi != null && pe.xf != null && ce.xi != null && ce.xf != null) {
            exonMap.push({ pLo: Math.min(+pe.xi, +pe.xf), pHi: Math.max(+pe.xi, +pe.xf), lLo: Math.min(+ce.xi, +ce.xf) });
          }
        }
        if (refresh) {
          let gmin = null, gmax = null;
          for (const ce of cExons) {
            if (ce.gxi != null) gmin = (gmin == null) ? +ce.gxi : Math.min(gmin, +ce.gxi);
            if (ce.gxf != null) gmax = (gmax == null) ? +ce.gxf : Math.max(gmax, +ce.gxf);
          }
          if (gmin != null) this.gxi = gmin;
          if (gmax != null) this.gxf = gmax;
        }
      } catch (e) { }
      const gm = (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) ? this.trackRef.genomeMap : null;
      const mc = {};
      if (gm) gm.forEach((e, i) => { mc[e] = i; });
      const hasMap = exonMap.length > 0 || !!gm;
      const rm = (g) => {
        g = Math.round(g);
        for (const e of exonMap) if (g >= e.pLo && g <= e.pHi) return e.lLo + (g - e.pLo);   // exon-rooted (parent space)
        if (gm && mc[g] !== undefined) return mc[g];            // fallback: exact genomeMap key
        if (!exonMap.length && !gm) return (g >= this.xi && g <= this.xf) ? g : undefined;   // genomic-only child
        return undefined;
      };
      const inMap = (g) => rm(g) !== undefined;
      const childLen = (this.sequence && this.sequence.length) ? this.sequence.length : Math.abs(this.xf - this.xi);

      // Lenient mapper for amplicons/primer-probes: map exon-rooted; if a coordinate falls
      // outside every exon (e.g. a primer overlapping an intron), snap it to the nearest
      // exon-local position so the amplicon still lifts over. Never returns undefined when
      // there is any exon / genomeMap to key on.
      const mapOrSnap = (g) => {
        g = Math.round(g);
        if (exonMap.length) {
          let nearest = null, nd = Infinity;
          for (const e of exonMap) {
            if (g >= e.pLo && g <= e.pHi) return e.lLo + (g - e.pLo);
            const d = (g < e.pLo) ? (e.pLo - g) : (g - e.pHi);
            if (d < nd) { nd = d; nearest = (g < e.pLo) ? e.lLo : (e.lLo + (e.pHi - e.pLo)); }
          }
          return nearest;
        }
        if (gm) {
          if (mc[g] !== undefined) return mc[g];
          // snap to nearest genomeMap key
          let nearest = null, nd = Infinity;
          for (let i = 0; i < gm.length; i++) { const d = Math.abs(gm[i] - g); if (d < nd) { nd = d; nearest = i; } }
          return nearest;
        }
        return (g >= this.xi && g <= this.xf) ? (g - this.xi) : Math.max(0, Math.min(childLen, g - this.xi));
      };

      // Mirrored child data start deselected/dehighlighted but are EDITABLE — a child edit
      // persists (the diff keys on the stored __syncHash) until the parent's item changes.
      const clearSel = (o) => {
        if (!o || typeof o !== 'object') return o;
        o.selected = false;
        o.highlight__ = false;
        o.highlight = false;
        o.readonly = false;
        for (const part of [o.left, o.right, o.mid]) {
          if (part && typeof part === 'object') { part.selected = false; part.highlight__ = false; part.highlight = false; part.readonly = false; }
        }
        return o;
      };

      // All parent object hashes that currently exist.
      const parentHashes = new Set();
      for (const o of (p.oligos || [])) if (o) parentHashes.add(this._syncHash(o, 'oligo'));
      for (const o of (p.track_layers || [])) if (o) parentHashes.add(this._syncHash(o, 'layer'));
      for (const o of (p.snpindels || [])) if (o) parentHashes.add(this._syncHash(o, 'snp'));
      for (const o of (p.plots || [])) if (o) parentHashes.add(this._syncHash(o, 'plot'));
      for (const o of (p.structures || [])) if (o) parentHashes.add(this._syncHash(o, 'struct'));

      // Remove child mirrors whose source object is gone from the parent (moved/deleted).
      const prune = (arr) => Array.isArray(arr) ? arr.filter((o) => !o || !o.__syncHash || parentHashes.has(o.__syncHash)) : arr;
      this.oligos = prune(this.oligos);
      this.snpindels = prune(this.snpindels);
      this.track_layers = prune(this.track_layers);
      this.plots = prune(this.plots);
      if (this.structures) this.structures = prune(this.structures);

      // Hashes already mirrored on the child (unchanged — skipped in the push below).
      const present = new Set();
      const collect = (arr) => { if (Array.isArray(arr)) for (const o of arr) if (o && o.__syncHash) present.add(o.__syncHash); };
      collect(this.oligos); collect(this.snpindels); collect(this.track_layers); collect(this.plots); collect(this.structures);

      // --- oligos, amplicons, siRNAs ---
      if (Array.isArray(p.oligos)) for (let o of p.oligos) {
        try {
          const __h = this._syncHash(o, 'oligo');
          if (present.has(__h)) continue;   // already mirrored, unchanged
          if (o.type === 'amplicon') {
            if (!o.left || !o.right) continue;
            // Build the child amplicon WITHOUT JSON-cloning the whole object (which can hit
            // circular refs and silently fail). Clone each primer/probe as a real Oligo and
            // map every coordinate leniently (snapping out-of-exon coords to the nearest
            // exon-local position) so amplicons/primer-probe sets always lift over.
            const mkPart = (part) => {
              if (!part) return null;
              const ol = Object.assign(new Oligo(), part);
              ol.offtarget = null; ol.showOfftargets = false; ol.offtargetsRun = false;
              return ol;
            };
            const a = new Amplicon();
            a.left = mkPart(o.left);
            a.right = mkPart(o.right);
            a.mid = o.mid ? mkPart(o.mid) : null;
            const mapEnd = (xf) => { const v = mapOrSnap(xf - 1); return (v == null ? mapOrSnap(xf) : v + 1); };
            a.left.xi = mapOrSnap(o.left.xi); a.left.xf = mapEnd(o.left.xf);
            a.right.xi = mapOrSnap(o.right.xi); a.right.xf = mapEnd(o.right.xf);
            if (a.mid) { a.mid.xi = mapOrSnap(o.mid.xi); a.mid.xf = mapEnd(o.mid.xf); }
            if (a.left.xi == null || a.left.xf == null || a.right.xi == null || a.right.xf == null) continue;
            a.xi = Math.min(a.left.xi, a.right.xi);
            a.xf = Math.max(a.left.xf, a.right.xf);
            // carry over the amplicon's vertical position (a track-relative fraction) so it
            // sits at the same relative height on the child; setY syncs the primers too.
            const ay = (o.y != null) ? o.y : ((o.left && o.left.y != null) ? o.left.y : 0.15);
            if (a.setY) a.setY(ay); else { a.y = ay; a.left.y = ay; a.right.y = ay; if (a.mid) a.mid.y = ay; }
            // carry over the amplicon's display fields
            a.type = 'amplicon';
            a.name = o.name; a.size = o.size; a.strand = o.strand; a.info = o.info;
            a.color = o.color; a.ampColor = o.ampColor; a.oligColor = o.oligColor;
            a.synthesisSequence = o.synthesisSequence;
            a.__mirror = true; a.__syncHash = __h;
            this.oligos.push(clearSel(a));
          } else {
            // xf is exclusive (start+length); check/remap the last base (xf-1).
            if (!(inMap(o.xi) && inMap(o.xf - 1))) continue;
            const proto = (o.type === 'siRNA' || o.type === 'sirna') ? new SIRNA() : new Oligo();
            let ob = Object.assign(proto, JSON.parse(JSON.stringify(o)));
            ob.xi = rm(o.xi); ob.xf = rm(o.xf - 1) + 1;
            ob.__mirror = true; ob.__syncHash = __h;
            this.oligos.push(clearSel(ob));
          }
        } catch (e) { }
      }

      // --- snpindels ---
      // Carry annotation/clinical metadata onto a mirrored SNP (the constructor doesn't
      // take these), so clinical significance etc. survive parent -> child mirroring.
      const carrySnpMeta = (dst, src) => {
        try {
          dst.name = src.name;
          dst.clinsig = src.clinsig;
          dst.clindn = src.clindn;
          dst.quality = src.quality;
          dst.source = src.source;
          dst.af = src.af;
          if (src.structure) dst.structure = src.structure;
          if (src.color) dst.color = src.color;
        } catch (e) { }
      };
      if (Array.isArray(p.snpindels)) for (let sid of p.snpindels) {
        try {
          const __h = this._syncHash(sid, 'snp');
          if (present.has(__h)) continue;
          if (inMap(sid.xi)) {
            let _sid = new SnpIndel(sid.type, rm(sid.xi), sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id + '*');
            carrySnpMeta(_sid, sid); _sid.__mirror = true; _sid.__syncHash = __h;
            this.snpindels.push(clearSel(_sid));
          } else if (inMap(sid.xf)) {
            let _sid = new SnpIndel(sid.type, rm(sid.xf - (sid.reference ? sid.reference.length : 0)), sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id + '*');
            carrySnpMeta(_sid, sid); _sid.__mirror = true; _sid.__syncHash = __h;
            this.snpindels.push(clearSel(_sid));
          }
        } catch (e) { }
      }

      // --- track layers: interval endpoints AND polygon points (RNASeq/wiggle) remapped ---
      if (Array.isArray(p.track_layers)) for (let tl of p.track_layers) {
        try {
          const __h = this._syncHash(tl, 'layer');
          if (present.has(__h)) continue;
          let ttl = Object.assign(new TrackLayer(), JSON.parse(JSON.stringify(tl)));
          let ivs = [];
          for (let iv of (tl.intervals || [])) {
            if (!inMap(iv.x1)) continue;
            // x2 may be inclusive or exclusive depending on the source — accept either.
            let x2m;
            if (inMap(iv.x2)) x2m = rm(iv.x2);
            else if (inMap(iv.x2 - 1)) x2m = rm(iv.x2 - 1) + 1;
            else continue;
            ivs.push(Object.assign({}, iv, { x1: rm(iv.x1), x2: x2m }));
          }
          ttl.intervals = ivs;
          // RNASeq / wiggle layers store their signal as polygonpts {x,y} at genomic x —
          // remap each point's x to child-local (exon bases only; introns are collapsed).
          let pts = [];
          for (let pt of (tl.polygonpts || [])) {
            const gx = Math.floor(pt.x);
            if (inMap(gx)) pts.push({ x: rm(gx), y: pt.y });
          }
          ttl.polygonpts = pts;
          // The JSON clone strips the layer's tgraph prototype (a plain object with no
          // rescale()), which crashes TrackLayer.draw. Rebuild a real MGrid for the
          // child's coordinate space (local 0..len), preserving the y bounds.
          const src = tl.tgraph || {};
          ttl.tgraph = new MGrid(0, 0, 100, 100);
          ttl.tgraph.xi = 0; ttl.tgraph.yi = 0;
          ttl.tgraph.setxmax(childLen);
          ttl.tgraph.setymax(src.ymax != null ? src.ymax : 1);
          ttl.tgraph.setxmin(0);
          ttl.tgraph.setymin(src.ymin != null ? src.ymin : 0);
          if (ttl.tgraph.setInset) ttl.tgraph.setInset(0, 0);
          ttl.tgraph.rescale();
          ttl.__mirror = true; ttl.__syncHash = __h;
          if (ivs.length || pts.length) this.track_layers.push(clearSel(ttl));
        } catch (e) { }
      }

      // --- plots ---
      if (Array.isArray(p.plots)) for (let sid of p.plots) {
        try {
          const __h = this._syncHash(sid, 'plot');
          if (present.has(__h)) continue;
          if (!inMap(sid.x)) continue;
          let tp;
          if (sid.mg != null) { tp = Object.assign(new TrackPlot(), sid); tp.mg = Object.assign(new MGrid(), sid.mg); }
          else { tp = Object.assign(new Barchart(), sid); }
          tp.x = rm(sid.x); tp.__mirror = true; tp.__syncHash = __h;
          this.plots.push(clearSel(tp));
        } catch (e) { }
      }

      // --- RNA secondary structures ---
      if (Array.isArray(p.structures) && Array.isArray(this.structures)) for (let st of p.structures) {
        try {
          const __h = this._syncHash(st, 'struct');
          if (present.has(__h)) continue;
          if (!(inMap(st.xi) && inMap(st.xf))) continue;
          let s2 = Object.assign(new RNASecondaryStructure(), JSON.parse(JSON.stringify(st)));
          s2.xi = rm(st.xi); s2.xf = rm(st.xf); s2.__mirror = true; s2.__syncHash = __h;
          this.structures.push(clearSel(s2));
        } catch (e) { }
      }

      if (this.__gg && this.__gg.wake) this.__gg.wake();
    }

    addGFF(gff) {
      let lines = gff.split("\n");
      for (let line of lines) {
        let tabs = line.split(/\s+/g);
        let chrom = tabs[0];
        let source = tabs[1];
        let name = tabs[2];
        let start = +tabs[3];
        let end = +tabs[4];
        let score = tabs[5];
        let strand = tabs[6];
        let phase = tabs[7];
        let attributes = tabs[8];
        let tr = new Annotation(name, name, start, end, strand, attributes);
        this.annotations.push(tr);
      }
    }

    add(annotation) {
      this.annotations.push(annotation);
      // Stack this annotation's label into a free vertical lane so its name doesn't sit on top
      // of a neighbour's label when they're close together on the track's X axis.
      try { this._assignAnnotationLabelLane(annotation); } catch (e) { }
      // When the track gains a start or stop codon, auto-(re)generate the CDS.
      const ty = ('' + (annotation && annotation.type)).toLowerCase();
      if (ty === 'tss' || ty === 'stop') { try { this.scheduleCDSUpdate(); } catch (e) { } }
    }

    // Merge annotations that are the SAME (identical name + type) and sit NEXT TO each other on
    // the track into a single annotation spanning the whole region — e.g. a run of consecutive
    // "active site" residues collapses into one "active site" region. `typeFilter` (optional)
    // restricts the merge to one type (e.g. 'cdd-site'); `gap` is the max nt between two
    // annotations still considered adjacent (default 3 ≈ one codon).
    mergeAdjacentAnnotations(typeFilter, gap = 3) {
      const anns = this.annotations || [];
      if (anns.length < 2) return;
      // Structural annotations drive the CDS/exon model — never merge them.
      const SKIP = { 'Exon': 1, 'TSS': 1, 'STOP': 1, 'Translation': 1, 'CDS': 1 };
      const keep = [];
      const groups = {};
      const order = [];
      for (const a of anns) {
        if (!a || SKIP[a.type] || (typeFilter && ('' + a.type) !== typeFilter)) { keep.push(a); continue; }
        const key = (a.name || '') + ' ' + (a.type || '');
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(a);
      }
      for (const key of order) {
        const g = groups[key].slice().sort((x, y) => (Math.min(+x.xi, +x.xf)) - (Math.min(+y.xi, +y.xf)));
        let cur = null;
        for (const a of g) {
          const axi = Math.min(+a.xi, +a.xf), axf = Math.max(+a.xi, +a.xf);
          if (cur && axi <= cur.__mxf + gap) {
            cur.__mxf = Math.max(cur.__mxf, axf);   // extend the current region
          } else {
            if (cur) { cur.xi = cur.__mxi; cur.xf = cur.__mxf; cur.gxi = cur.__mxi; cur.gxf = cur.__mxf; keep.push(cur); }
            cur = a; cur.__mxi = axi; cur.__mxf = axf;
          }
        }
        if (cur) { cur.xi = cur.__mxi; cur.xf = cur.__mxf; cur.gxi = cur.__mxi; cur.gxf = cur.__mxf; keep.push(cur); }
      }
      this.annotations = keep;
    }

    // Give a newly-added annotation a `labelY` lane (vertical offset) so its label/name does not
    // overlap the labels of other annotations that are nearby ALONG THE TRACK'S X AXIS. Lane 0
    // keeps labelY = 0 (the default position); each overlapping neighbour bumps this one up a row.
    // Footprint is genomic (zoom-independent, as required at creation time): the label spans at
    // least `name.length` bases, centred on the annotation, or the annotation's own width if wider.
    _assignAnnotationLabelLane(ann) {
      if (!ann) return;
      // Structural / auto-CDS annotations are positioned deliberately — leave their labels alone.
      const SKIP = { tss: 1, stop: 1, translation: 1, cds: 1 };
      const ty = ('' + (ann.type || '')).toLowerCase();
      if (SKIP[ty]) return;
      const STEP = 0.5;   // world-Y between label rows
      const footprint = (a) => {
        const lo0 = Math.min(+a.xi, +a.xf), hi0 = Math.max(+a.xi, +a.xf);
        if (!isFinite(lo0) || !isFinite(hi0)) return null;
        const nameLen = ('' + (a.name || '')).length;
        const c = (lo0 + hi0) / 2;
        const half = Math.max((hi0 - lo0) / 2, nameLen / 2, 1);
        return { lo: c - half, hi: c + half };
      };
      const mine = footprint(ann);
      if (!mine) return;
      // Which lanes are already taken by labels that overlap this one on the X axis?
      const occupied = {};
      for (const other of (this.annotations || [])) {
        if (other === ann) continue;
        if (SKIP[('' + (other.type || '')).toLowerCase()]) continue;
        const f = footprint(other);
        if (!f) continue;
        if (f.lo <= mine.hi && f.hi >= mine.lo) {   // X-axis overlap on the track
          const lane = Math.max(0, Math.round((+other.labelY || 0) / STEP));
          occupied[lane] = true;
        }
      }
      let lane = 0;
      while (occupied[lane]) lane++;
      ann.labelY = lane * STEP;
      ann.__labelLane = lane;
    }

    // Draw-time re-lane of THIS track's annotation labels, using their real SCREEN-X footprints
    // (so it adapts to the current zoom). Called every 10th redraw from draw(). Only this track's
    // annotations are considered — labels on other tracks are irrelevant to this track's rows.
    _recheckAnnotationLabelLanes(graph) {
      const anns = this.annotations || [];
      if (!anns.length || !this.tgraph || !graph || !graph.X) return;
      const SKIP = { tss: 1, stop: 1, translation: 1, cds: 1 };
      const STEP = 0.5;
      const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
      if (ctx) { try { ctx.font = '10px system-ui, -apple-system, Roboto, Arial, sans-serif'; } catch (e) { } }
      // Screen-X label span for each labelled annotation on this track.
      const items = [];
      for (const a of anns) {
        if (!a) continue;
        if (SKIP[('' + (a.type || '')).toLowerCase()]) continue;
        let sx;
        try { sx = graph.X(this.tgraph.X((+a.xi + +a.xf) / 2)); } catch (e) { continue; }
        if (!isFinite(sx)) continue;
        const name = '' + (a.name || '');
        let w = 44;
        if (ctx && name) { try { w = ctx.measureText(name).width + 8; } catch (e) { } }
        items.push({ a, lo: sx - w / 2, hi: sx + w / 2, sx });
      }
      if (!items.length) return;
      // Greedy interval partition: sweep left→right, drop each label into the lowest lane whose
      // last label ended before this one starts (+4px gap), so overlapping labels stack instead.
      items.sort((p, q) => p.sx - q.sx);
      const laneRight = [];
      for (const it of items) {
        let lane = 0;
        while (lane < laneRight.length && it.lo <= laneRight[lane] + 4) lane++;
        laneRight[lane] = it.hi;
        it.a.__labelLane = lane;
        it.a.labelY = lane * STEP;
      }
      // Fit every lane's glyph/label WITHIN this track's screen height: derive a per-lane pixel
      // step from the track height and the lane count, so stacked site markers never overflow
      // into the neighbouring track (drawCddSite reads __laneBasePx/__laneStepPx).
      const nLanes = laneRight.length;
      let trackHpx = 46;
      try { trackHpx = Math.abs(graph.screenHeight(this.tgraph.height)) || 46; } catch (e) { }
      const baseMargin = 12, topMargin = 8;
      const usable = Math.max(10, trackHpx - baseMargin - topMargin);
      let stepPx = 18;
      if (nLanes > 1) stepPx = Math.max(7, Math.min(18, usable / (nLanes - 1)));
      for (const it of items) {
        it.a.__laneCount = nLanes;
        it.a.__laneBasePx = baseMargin;
        it.a.__laneStepPx = stepPx;
      }
    }
    setAnnotation(annotation) {
      for (let a of this.annotations) {
        if (a.name.toLowerCase() === annotation.name.toLowerCase()) {
          return;
        }
      }
      this.annotations.push(annotation);
      try { this._assignAnnotationLabelLane(annotation); } catch (e) { }
    }

    setTrackCoordinatesAnimated(__graph, start, end, durationMs = 3000) {
      start = Math.floor(Number(start));
      end = Math.floor(Number(end));

      if (!Number.isFinite(start)) return;
      if (!Number.isFinite(end)) end = -1;

      if (this._trackAnimRaf) {
        cancelAnimationFrame(this._trackAnimRaf);
        this._trackAnimRaf = null;
      }

      const graph = __graph;
      if (!graph) return;

      const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

      let from = this.gitVisibleTrackRange(graph);
      if (!from || from === -1) {
        from = { start: Math.floor(Number(this.tgraph?.xi) || 0), end: -1 };
      }

      const fromStart = Math.floor(Number(from.start) || 0);
      const fromEnd = Number.isFinite(from.end) ? Math.floor(from.end) : -1;

      const toStart = start;
      const toEnd = end;

      const applyVisibleRange = async (s, e) => {
        s = Math.floor(Number(s));
        e = Math.floor(Number(e));
        this.tgraph.rescale();
        let gs = this.tgraph.X(s);
        let ge = this.tgraph.X(e);
        await graph.zoomTo(gs, ge);
      };

      const t0 = performance.now();

      const tick = (now) => {
        const elapsed = now - t0;
        const t = Math.min(1, elapsed / durationMs);
        const e = easeInOutCubic(t);

        const curStart = Math.floor(fromStart + (toStart - fromStart) * e);

        let curEnd;
        if (toEnd < 0 && fromEnd < 0) {
          curEnd = -1;
        } else if (toEnd < 0) {
          curEnd = t < 1 ? fromEnd : -1;
        } else if (fromEnd < 0) {
          curEnd = Math.floor(curStart + (toEnd - curStart) * e);
        } else {
          curEnd = Math.floor(fromEnd + (toEnd - fromEnd) * e);
        }

        applyVisibleRange(curStart, curEnd);

        if (t < 1) {
          this._trackAnimRaf = requestAnimationFrame(tick);
        } else {
          this._trackAnimRaf = null;

          applyVisibleRange(toStart, toEnd);
        }
      };

      this._trackAnimRaf = requestAnimationFrame(tick);
    }

    gitVisibleTrackRange(__graph) {
      let graph = __graph.graph;
      let gwcxs = graph.Xwc(0);
      if (!gwcxs) return -1;

      let gwcxf = graph.Xwc(0 + graph.grid.width);
      if (!gwcxf) return -1;
      let twcxs = this.tgraph.Xwc(gwcxs - 2 * this.tgraph.xi);
      let twcxf = this.tgraph.Xwc(gwcxf - 2 * this.tgraph.xi);
      let startIndex = Math.floor(twcxs);
      let endIndex = Math.floor(twcxf);
      return {
        start: startIndex,
        end: endIndex,
      };
    }

    getVisibleOligos(start, end) {
      let o = [];
      for (let oligo of this.oligos) {
        if (oligo.y >= this.tgraph.ymax) {
          this.tgraph.ymax = oligo.y + 0.111;
        }

        if ((oligo.xi >= start && oligo.xf < end) || (oligo.xf <= end && oligo.xf > start) || (oligo.xi < end && oligo.xi >= start) || (oligo.xi < start && oligo.xf > end)) {
          o.push(oligo);
        }
      }
      return o;
    }

    getVisibleSNPs(start, end) {
      let o = [];
      for (let snp of this.snpindels) {
        if (snp && snp.hidden) continue;   // filtered out via Edit snps
        if ((snp.xi >= start && snp.xi < end) || (snp.xf >= start && snp.xf < end)) {
          o.push(snp);
        }
      }

      return o;
    }

    // Removing SNPs from a parent should clear them from its child tracks too. Children
    // mirror the parent (child.trackRef.track === parent), so we clear each descendant's
    // snpindels; the next syncFromParent() re-mirrors only the parent's REMAINING SNPs,
    // keeping children consistent with the edited parent. Returns how many were cleared.
    clearDescendantSnps(graph) {
      let n = 0;
      try {
        const tracks = (graph && graph.track) || [];
        for (const c of tracks) {
          if (c && c !== this && c.trackRef && c.trackRef.track === this) {
            if (Array.isArray(c.snpindels) && c.snpindels.length) { n += c.snpindels.length; c.snpindels = []; }
            if (typeof c.clearDescendantSnps === 'function') n += c.clearDescendantSnps(graph);   // grandchildren
          }
        }
      } catch (e) { }
      return n;
    }

    removeTracksLayersWhereNameStartsWith(name) {
      this.track_layers = this.track_layers.filter((tt) => {
        if (tt.name) {
          console.log(" ttn ame " + tt.name);
          return !tt.name.toLowerCase().trim().startsWith(name.trim().toLowerCase());
        }
        return true;
      });
    }
    removeTrack(tl) {
      this.track_layers = this.track_layers.filter((tt) => {
        if (tt === tl) {
          return false;
        }
        return true;
      });
    }

    removeTrackLayers() {
      this.track_layers = [];
    }

    getTrackOligosXY(xi, xf, yi, yf) {
      let o = [];
      for (let oligo of this.oligos) {
        if ((this.tgraph.X(oligo.xi) >= xi && this.tgraph.X(oligo.xf) < xf) || (this.tgraph.X(oligo.xf) <= xf && this.tgraph.X(oligo.xf) > xi) || (this.tgraph.X(oligo.xi) < xf && this.tgraph.X(oligo.xi) >= xi) || (this.tgraph.X(oligo.xi) < xi && this.tgraph.X(oligo.xf) > xf)) {
          o.push(oligo);
        }
      }

      let o2 = [];
      for (let oligo of o) {
        let gy = this.tgraph.Y(oligo.y);
        if (gy > yi && gy < yf) {
          o2.push(oligo);
        }
      }
      return o2;
    }

    applySnpIndelsToSequence(options = {}) {
      const { phase = null, inPlace = false, orientation = "transcript", strictRef = false, preferZeroAlleles = true } = options;

      if (!this.sequence || typeof this.sequence !== "string") return this.sequence;

      const comp = (ch) => {
        switch ((ch || "").toUpperCase()) {
          case "A":
            return "T";
          case "T":
            return "A";
          case "C":
            return "G";
          case "G":
            return "C";
          default:
            return ch;
        }
      };

      const reverseComplement = (s) => {
        let out = "";
        for (let i = s.length - 1; i >= 0; i--) out += comp(s[i]);
        return out;
      };

      const seqArr = Array.from(this.sequence);

      const vars = (Array.isArray(this.snpindels) ? this.snpindels : []).filter((sid) => sid && (phase === null || sid.phase === phase));

      vars.sort((a, b) => (b.xi | 0) - (a.xi | 0));

      for (const sid of vars) {
        if (!sid || !Number.isFinite(sid.xi)) continue;

        const xi = Math.floor(sid.xi);

        if (xi < this.xi || xi > this.xf) continue;

        const ref = preferZeroAlleles ? (sid.reference0 ?? sid.reference ?? "") : (sid.reference ?? sid.reference0 ?? "");

        const alt = preferZeroAlleles ? (sid.alternate0 ?? sid.alternate ?? "") : (sid.alternate ?? sid.alternate0 ?? "");

        const type = sid.type;

        const idx = xi - this.xi;

        if (type === "snp") {
          if (idx < 0 || idx >= seqArr.length) continue;

          if (strictRef) {
            const want = (ref && ref.length ? ref[0] : "").toUpperCase();
            const have = (seqArr[idx] || "").toUpperCase();
            if (want && have && want !== have) continue;
          }

          const newBase = (alt && alt.length ? alt[0] : sid.sequence && sid.sequence[0]) || seqArr[idx];
          seqArr[idx] = newBase;
        } else if (type === "ins") {
          const payload = sid.sequence && sid.sequence.length ? String(sid.sequence) : alt.length > 1 ? alt.slice(1) : "";

          if (!payload) continue;

          const insertAt = idx + 1;
          if (insertAt < 0 || insertAt > seqArr.length) continue;

          if (strictRef) {
            const wantAnchor = (ref && ref.length ? ref[0] : "").toUpperCase();
            const haveAnchor = (seqArr[idx] || "").toUpperCase();
            if (wantAnchor && haveAnchor && wantAnchor !== haveAnchor) continue;
          }

          seqArr.splice(insertAt, 0, ...payload.split(""));
        } else if (type === "del") {
          const delLen = sid.sequence && sid.sequence.length ? String(sid.sequence).length : ref.length > 1 ? ref.length - 1 : 0;

          if (delLen <= 0) continue;

          const delAt = idx + 1;
          if (delAt < 0 || delAt >= seqArr.length) continue;

          if (strictRef) {
            const want = String(ref || "").toUpperCase();
            if (want.length >= 1) {
              const haveAnchor = (seqArr[idx] || "").toUpperCase();
              if (haveAnchor && want[0] && haveAnchor !== want[0]) continue;

              if (want.length > 1) {
                const haveRun = seqArr
                  .slice(delAt, delAt + (want.length - 1))
                  .join("")
                  .toUpperCase();
                const wantRun = want.slice(1);
                if (haveRun.length === wantRun.length && haveRun !== wantRun) continue;
              }
            }
          }

          seqArr.splice(delAt, delLen);
        }
      }

      let mutated = seqArr.join("");

      if (orientation === "transcript" && (this.strand === -1 || this.strand === "-1")) {
        mutated = reverseComplement(mutated);
      }

      if (inPlace) {
        this.sequence = mutated;
        // Nucleotides changed -> refresh the CDS in real time.
        try { this.updateCDS(); } catch (e) { }
      }

      return mutated;
    }

    resolveSNP(sid, options = {}) {
      const { strictRef = false, preferZeroAlleles = true, removeApplied = true, shiftOligos = true } = options;

      if (!sid || !Number.isFinite(+sid.xi)) return this.sequence;
      if (!this.sequence || typeof this.sequence !== "string") return this.sequence;

      const xi = Math.floor(+sid.xi);

      if (xi < this.xi || xi > this.xf) return this.sequence;

      const ref = preferZeroAlleles ? (sid.reference0 ?? sid.reference ?? "") : (sid.reference ?? sid.reference0 ?? "");

      const alt = preferZeroAlleles ? (sid.alternate0 ?? sid.alternate ?? "") : (sid.alternate ?? sid.alternate0 ?? "");

      const type = sid.type;

      const idx = xi - this.xi;

      const seqArr = Array.from(this.sequence);

      if (type === "snp") {
        if (idx < 0 || idx >= seqArr.length) return this.sequence;

        if (strictRef) {
          const want = (ref && ref.length ? ref[0] : "").toUpperCase();
          const have = (seqArr[idx] || "").toUpperCase();
          if (want && have && want !== have) return this.sequence;
        }

        const newBase = (alt && alt.length ? alt[0] : sid.sequence && sid.sequence[0]) ?? seqArr[idx];

        seqArr[idx] = newBase;
      } else if (type === "ins") {
        const payload = sid.sequence && String(sid.sequence).length ? String(sid.sequence) : alt.length > 1 ? alt.slice(1) : "";

        if (!payload) return this.sequence;

        const insertAt = idx + 1;
        if (insertAt < 0 || insertAt > seqArr.length) return this.sequence;

        if (strictRef) {
          const wantAnchor = (ref && ref.length ? ref[0] : "").toUpperCase();
          const haveAnchor = (seqArr[idx] || "").toUpperCase();
          if (wantAnchor && haveAnchor && wantAnchor !== haveAnchor) return this.sequence;
        }

        seqArr.splice(insertAt, 0, ...payload.split(""));
      } else if (type === "del") {
        const delLen = sid.sequence && String(sid.sequence).length ? String(sid.sequence).length : ref.length > 1 ? ref.length - 1 : 0;

        if (delLen <= 0) return this.sequence;

        const delAt = idx + 1;
        if (delAt < 0 || delAt >= seqArr.length) return this.sequence;

        if (strictRef) {
          const want = String(ref || "").toUpperCase();
          if (want.length >= 1) {
            const haveAnchor = (seqArr[idx] || "").toUpperCase();
            if (haveAnchor && want[0] && haveAnchor !== want[0]) return this.sequence;

            if (want.length > 1) {
              const haveRun = seqArr
                .slice(delAt, delAt + (want.length - 1))
                .join("")
                .toUpperCase();
              const wantRun = want.slice(1);
              if (haveRun.length === wantRun.length && haveRun !== wantRun) return this.sequence;
            }
          }
        }

        seqArr.splice(delAt, delLen);
      } else {
        return this.sequence;
      }

      this.sequence = seqArr.join("");

      const delta = (alt?.length ?? 0) - (ref?.length ?? 0);

      if (delta !== 0) {
        const xf = Number.isFinite(+sid.xf) ? Math.floor(+sid.xf) : xi + (ref?.length ?? 0);

        this.adjustDownstreamAnnotations(xi, xf, delta);

        if (shiftOligos && Array.isArray(this.oligos) && this.oligos.length) {
          const start = Math.min(xi, xf);
          const end = Math.max(xi, xf);
          const isFwd = this.strand >= 0;

          const adjustSpan = (feat) => {
            const origForward = feat.xi <= feat.xf;
            let a0 = Math.min(feat.xi, feat.xf);
            let a1 = Math.max(feat.xi, feat.xf);

            const downstream = isFwd ? a0 >= end : a1 <= start;

            if (downstream) {
              a0 += delta;
              a1 += delta;
            } else {
              if (isFwd) {
                if (a0 < end && a1 >= end) a1 += delta;
              } else {
                if (a0 <= start && a1 > start) a0 += delta;
              }
            }

            if (origForward) {
              feat.xi = a0;
              feat.xf = a1;
            } else {
              feat.xi = a1;
              feat.xf = a0;
            }
          };

          for (const o of this.oligos) {
            if (!o || !Number.isFinite(o.xi) || !Number.isFinite(o.xf)) continue;
            adjustSpan(o);
          }
        }
      }

      if (removeApplied && Array.isArray(this.snpindels)) {
        const i = this.snpindels.indexOf(sid);
        if (i >= 0) this.snpindels.splice(i, 1);
      }

      // Nucleotides changed -> refresh the CDS in real time.
      try { this.updateCDS(); } catch (e) { }
      return this.sequence;
    }

    mutateTrackWithSingleMutation(mutation) {
      if (this.strand < 0) {
        if (mutation.sequence != null && mutation.sequence != undefined) {
          if (mutation.xi <= mutation.xf) {
            this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.sequence + this.sequence.substring(mutation.xf - this.xi);
          } else {
            this.sequence = this.sequence.substring(0, mutation.xi) + mutation.sequence + this.sequence.substring(mutation.xi - this.xi);
          }
          if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
            this.markend = this.markstart + mutation.sequence.length;
            this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length);
          }
        } else if (mutation.alternate) {
          if (mutation.xi <= mutation.xf) {
            this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
          } else {
            this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
            if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
              this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length);
            }
          }
        }
      } else {
        if (mutation.alternate != null && mutation.alternate != undefined) {
          if (mutation.xi <= mutation.xf) {
            this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
          } else {
            this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
          }
          if (Math.abs(mutation.reference.length - mutation.alternate.length) != 0) {
            this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.alternate.length - mutation.reference.length);
          }
        }
      }
      // Nucleotides changed -> refresh the CDS in real time.
      try { this.updateCDS(); } catch (e) { }
    }

    mutateTrack(phase) {
      let mutations = this.snpindels.filter((snp) => snp.phase === phase);
      mutations.sort((a, b) => b.xi - a.xi);
      mutations.forEach((mutation) => {
        if (this.strand < 0 && mutation.transcriptStrand < 0) {
          if (mutation.sequence != null && mutation.sequence != undefined) {
            if (mutation.xi <= mutation.xf) {
              this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.sequence + this.sequence.substring(mutation.xf - this.xi);
            } else {
              this.sequence = this.sequence.substring(0, mutation.xi) + mutation.sequence + this.sequence.substring(mutation.xi - this.xi);
            }
            if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
              this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length);
            }
          } else if (mutation.alternate) {
            if (mutation.xi <= mutation.xf) {
              this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
            } else {
              this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
              if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
                this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length);
              }
            }
          }
        } else {
          if (mutation.alternate != null && mutation.alternate != undefined) {
            if (mutation.xi <= mutation.xf) {
              this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
            } else {
              this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
            }
            if (Math.abs(mutation.reference.length - mutation.alternate.length) != 0) {
              this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.alternate.length - mutation.reference.length);
            }
          }
        }
      });
      this.snpindels = [];
      // Nucleotides changed -> refresh the CDS in real time.
      try { this.updateCDS(); } catch (e) { }
    }
    adjustDownstreamAnnotations(xi, xf, delta) {
      if (!delta) return;

      const start = Math.min(xi, xf);
      const end = Math.max(xi, xf);
      const isFwd = this.strand >= 0;

      const toRemove = [];

      const adjustFeature = (feat) => {
        const origForward = feat.xi <= feat.xf;
        let a0 = Math.min(feat.xi, feat.xf);
        let a1 = Math.max(feat.xi, feat.xf);

        const overlaps = a0 < end && a1 > start;
        const fullyInside = a0 >= start && a1 <= end;

        if (delta < 0) {
          if (fullyInside) return { remove: true };

          if (overlaps) {
            if (a0 < start && a1 > start && a1 <= end) {
              a1 = start;
            } else if (a0 >= start && a0 < end && a1 > end) {
              a0 = start;
              a1 += delta;
            } else if (a0 < start && a1 > end) {
              a1 += delta;
            }
          }
        } else if (delta > 0) {
          const insertionPoint = start;
          if (a0 < insertionPoint && a1 > insertionPoint) {
            a1 += delta;
          }
        }

        const downstream = isFwd ? a0 >= end : a1 <= start;

        if (downstream) {
          a0 += delta;
          a1 += delta;
        } else {
          if (isFwd) {
            if (a0 < end && a1 >= end) a1 += delta;
          } else {
            if (a0 <= start && a1 > start) a0 += delta;
          }
        }

        if (origForward) {
          feat.xi = a0;
          feat.xf = a1;
        } else {
          feat.xi = a1;
          feat.xf = a0;
        }

        return { remove: false };
      };

      for (const ann of this.annotations) {
        const res = adjustFeature(ann);
        if (res.remove) toRemove.push(ann);
      }

      for (const ann of toRemove) {
        this.removeAnnotation(ann);
      }

      for (const o of this.snpindels) {
        adjustFeature(o);

        if (o.xi <= o.xf) {
          if (o.xf < o.xi) o.xf = o.xi;
        } else {
          if (o.xi < o.xf) o.xi = o.xf;
        }
      }

      let newMin = this.xi;
      let newMax = this.xf;

      for (const a of this.annotations) {
        newMin = Math.min(newMin, a.xi, a.xf);
        newMax = Math.max(newMax, a.xi, a.xf);
      }
      for (const o of this.snpindels) {
        newMin = Math.min(newMin, o.xi, o.xf);
        newMax = Math.max(newMax, o.xi, o.xf);
      }

      this.xi = newMin;
      this.xf = newMax;

      this.tgraph.xmin = this.xi - 1;
      this.tgraph.xmax = this.xf + 1;

      this.tgraph.width = this.sequence.length + 1;
      this.tgraph.rescale();
    }

    getVisibleOligosXY(start, end, ymin, ymax) {
      let o = [];
      start = +start;
      end = +end;
      for (let oligo of this.oligos) {
        if ((oligo.xi >= start && oligo.xf < end) || (oligo.xf <= end && oligo.xf > start) || (oligo.xi < end && oligo.xi >= start) || (oligo.xi < start && oligo.xf > end)) {
          o.push(oligo);
        }
      }

      let o2 = [];
      for (let oligo of o) {
        let gy = oligo.y;

        if (gy >= ymin && gy < ymax) {
          o2.push(oligo);
        }
      }
      return o2;
    }

    select() {
      this.showResizeBar = true;
    }
    selectTrackAndSeq() {
      this.select();
      this.markstart = this.tgraph.xmin;
      this.markend = this.tgraph.xmax;
    }
    deselect() {
      this.showResizeBar = false;
      this.markend = null;
      this.markstart = null;
      // Deselecting a track also deselects every variant on it.
      try {
        for (const s of (this.snpindels || [])) {
          if (s) { s.highlight = false; if (s.deselect) { try { s.deselect(); } catch (e) { } } }
        }
      } catch (e) { }
    }

    removeAnnotationsByCount(count) {
      const nameCounts = {};
      console.log("debubg");
      this.annotations.forEach((annotation) => {
        if (nameCounts[annotation.name]) {
          nameCounts[annotation.name]++;
        } else {
          nameCounts[annotation.name] = 1;
        }
      });

      this.annotations = this.annotations.filter((annotation) => nameCounts[annotation.name] != count);
    }

    removeAnnotation(annotation) {
      const index = this.annotations.indexOf(annotation);
      if (index > -1) {
        this.annotations.splice(index, 1);
      }
    }
    removeStructure(structure) {
      const index = this.structures.indexOf(structure);
      if (index > -1) {
        this.structures.splice(index, 1);
      }
    }
    removeAnnotationByType(type) {
      let nannotations = [];
      for (let a of this.annotations) {
        if (a.type.toLowerCase() === type.toLowerCase()) {
        } else {
          nannotations.push(a);
        }
      }
      this.annotations = nannotations;
    }

    setORFColor(mode) {
      codon_colors.mode = mode;
    }

    removeOligos(oligosToRemove, comparator) {
      if (!comparator) {
        comparator = (a, b) => a.id === b.id;
      }
      this.oligos = this.oligos.filter((oligo) => {
        return !oligosToRemove.some((oligoToRemove) => comparator(oligo, oligoToRemove));
      });
    }

    removeOligo(oligo) {
      const index = this.oligos.indexOf(oligo);
      if (index >= 0) this.oligos.splice(index, 1);
    }
    removeOligosOfType(typeToRemove) {
      this.oligos = this.oligos.filter((obj) => obj.type !== typeToRemove);
    }
    countOligosOfType(typeValue) {
      return this.oligos.reduce((count, obj) => {
        if (obj.type === typeValue) {
          return count + 1;
        }
        return count;
      }, 0);
    }
    getExonCountVisible() {
      for (let a of this.annotations) {
        if (a.showIndex) {
          return true;
        }
      }
      return false;
    }

    showExonIndicies() {
      for (let a of this.annotations) {
        if (a.showIndex != null) {
          a.showIndex = true;
        }
      }
    }
    hideExonIndicies() {
      for (let a of this.annotations) {
        if (a.showIndex != null) {
          a.showIndex = false;
        }
      }
    }

    getKB() {
      if (this.sequence) {
        const lengthInBP = this.sequence.length;
        const lengthInKB = Math.floor(lengthInBP / 1000);
        return lengthInKB;
      } else {
        return 0;
      }
    }

    highlight(xi, xf) {
      if (this.markstart < 0) {
        this.markstart = 0;
      }
      this.markstart = xi;
      if (xf > this.xf) {
        this.markend - 1;
      } else {
        this.markend = xf;
      }
    }

    ffont = "11px system-ui, -apple-system, Roboto, Arial, sans-serif";
    marktime = null;
    detail_ffont = "16px system-ui, -apple-system, Roboto, Arial, sans-serif";
    detail_ffont_large = "26px system-ui, -apple-system, Roboto, Arial, sans-serif";
    detail_ffont4 = "18px system-ui, -apple-system, Roboto, Arial, sans-serif";
    detail_ffont2 = "15px system-ui, -apple-system, Roboto, Arial, sans-serif";
    detail_ffont3 = "13px system-ui, -apple-system, Roboto, Arial, sans-serif";
    detail_ffont6 = "11px system-ui, -apple-system, Roboto, Arial, sans-serif";
    detail_ffont7 = "9px system-ui, -apple-system, Roboto, Arial, sans-serif";
    hitSegments = null;

    async draw(graph) {
      const ctx = graph.canvas.getCTX();
      if (!ctx) return;
      // Every 10th redraw (at ANY zoom), collapse identical annotations that sit next to each
      // other into one region spanning the whole run. Genomic + cheap, so it runs here at the
      // top of draw rather than only inside the zoomed-in detail block.
      this.__mergeFrame = (this.__mergeFrame | 0) + 1;
      if (this.__mergeFrame % 10 === 0) { try { this.mergeAdjacentAnnotations(); } catch (e) { } }

      // The palette in force for the rest of this method and every helper it calls. Set per
      // track, on entry, because tracks draw one after another -- never interleaved -- so the
      // one assignment covers the whole of this track's drawing without a palette argument on
      // every signature.
      GX_T = this.themeColors();
      // The annotations too, not only the gene body. A theme that recoloured the exons and left
      // every UTR, codon, SNP and domain in the default scheme was half a theme -- and on the
      // dark ones it drew dark annotations on dark paper.
      try { gxApplyAnnotations(GX_T); } catch (e) { }
      // Publish both for flexigraph/gene-draw.js, which draws the codon cylinders, the CDD
      // domain marks and the exon badges. It is handed the graph and never the track, so the
      // theme has to travel the same way __trackDisplay already does.
      try {
        graph.__trackTheme = GX_T;
        graph.__trackAnn = {
          GX_UTR: GX_UTR, GX_INTRON: GX_INTRON, GX_GENE: GX_GENE, GX_TSS: GX_TSS,
          GX_START: GX_START, GX_STOP: GX_STOP, GX_SNP: GX_SNP, GX_INS: GX_INS, GX_DEL: GX_DEL,
          GX_ASO: GX_ASO, GX_SIRNA: GX_SIRNA, GX_RNABIND: GX_RNABIND, GX_DOMAIN: GX_DOMAIN,
          GX_ACCENT: GX_ACCENT, GX_LNCRNA: GX_LNCRNA, GX_MIRNA: GX_MIRNA, GX_SNRNA: GX_SNRNA,
          GX_PSEUDO: GX_PSEUDO, GX_REGION: GX_REGION, GX_POLYA: GX_POLYA, GX_AA: GX_AA
        };
      } catch (e) { }
      // The gene-draw class that goes with it: the theme decides the SHAPE of a gene body,
      // not only its colour.
      this.__geneDraw = geneDrawFor(this.theme, GX_T);

      // Display flags published on the GRAPH, because the annotation shapes in
      // flexigraph/gene-draw.js receive the graph and never the track. Set per track on entry
      // to its draw, the same way GX_T is, so each track's shapes read that track's settings.
      try {
        graph.__trackDisplay = {
          exonNumbers: this.showExonNumbers !== false,
          genomicCoords: this.showGenomicCoords !== false,
          cdnaCoords: this.showCdnaCoords !== false,
          domains: this.showDomains !== false,
          tssStop: this.showTssStop !== false
        };
      } catch (e) { }

      ctx.save();
      ctx.beginPath();

      const clipX = 0;
      const clipY = 0;
      const clipW = graph.grid.width;
      const clipH = graph.grid.height;

      ctx.rect(clipX, clipY, clipW, clipH);
      ctx.clip();

      // THE SELECTED BASES, marked on the track.
      //
      // Drawn HERE, first, so the sequence letters and every layer land on top of it. The
      // earlier version of this rectangle was removed because it obscured the bases -- it was
      // painted late, over them. Underneath and faint, it marks the region without competing
      // with what is written in it.
      //
      // No border, and a very light fill. The edge lines were there so the exact first and
      // last base stayed readable at low opacity, but they made the region read as a box
      // drawn ON the track rather than as the track's own bases being lit.
      try {
        const __sel = this.selectedRange ? this.selectedRange() : null;
        if (__sel) {
          const __x0 = graph.X(this.tgraph.X(__sel.start));
          const __x1 = graph.X(this.tgraph.X(__sel.end));
          const __sy = graph.Y(this.tgraph.yi);
          const __sh = graph.screenHeight(-1 * this.tgraph.height);
          const __sx = Math.min(__x0, __x1);
          const __sw = Math.abs(__x1 - __x0);
          if (__sw >= 1) {
            ctx.save();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,205,45,0.055)';
            ctx.fillRect(__sx, __sy, __sw, __sh);
            ctx.restore();
          }
        }
      } catch (e) { }

      try {
        let deg = 0;
        if (this.strand === -1 || this.strand === "-1") {
          deg = 3.14159;
        }
        let y = 0;
        if (this.tgraph.xi == NaN) {
          this.tgraph.xi = 0;
          this.tgraph.yi = 0;
          this.tgraph.height = this.default_track_height;

          this.tgraph.xmin = this.xi;
          this.tgraph.xmax = this.xf;
          this.tgraph.setInset(0, 0);
          this.tgraph.yi = this.y + 1;
          this.tgraph.setymin(-100);
          this.tgraph.setymax(10000);
        }

        graph.rescale();
        this.tgraph.rescale();
        if (this.showLayers) {
          for (let l of this.track_layers) {
            l.setXi(graph.X(this.tgraph.xi));
            l.setYi(graph.Y(this.tgraph.yi));
            l.setHeight(graph.screenHeight(this.tgraph.height));
            l.setWidth(graph.screenWidth(this.tgraph.width));
          }
          let highlighted = null;
          for (let l of this.track_layers) {
            let xi = l.getXi();
            let w = l.getWidth();
            let yi = l.getYi();
            let h = l.getHeight();
            if ((xi > 0 && xi < graph.grid.width) || (xi + w > 0 && xi + w < graph.grid.width) || (xi < 0 && xi + w > graph.grid.width) || (xi > 0 && xi + w < graph.grid.width) || (yi > 0 && yi < graph.grid.height) || (yi + h > 0 && yi + h < graph.grid.height) || (yi < 0 && yi + h > graph.grid.height) || (yi > 0 && yi + h < graph.grid.height)) {
              // Guard each layer's draw so one bad layer can't abort the rest of the loop.
              try {
                if (!l.highlight) await l.draw(this.tgraph, graph, this);
                else {
                  highlighted = l;
                }
              } catch (e) { }
            }
          }
          if (highlighted != null) {
            try { await highlighted.draw(this.tgraph, graph, this); } catch (e) { }
          }
        }

        let screencell = Math.abs(graph.screenWidth(this.tgraph.screenWidth(1)));
        // Clinical-compound tracks (from the Clinical Library): a bare sequence with the compound's
        // chemistry on top — no strand-direction arrows, no genomic/cDNA coordinate tags, no annotations.
        const __clinical = (this.track_type === 'clincial_compound' || this.track_type === 'clinical_compound');
        let ystart = graph.Y(this.tgraph.yi);
        let yend = graph.screenHeight(this.tgraph.height);

        let trackScreenWidth = graph.screenWidth(this.tgraph.width);
        let gwcxs = graph.Xwc(0);
        if (!gwcxs) {
          return;
        }
        let gwcxf = graph.Xwc(0 + graph.grid.width);
        if (!gwcxf) return;
        let twcxs = this.tgraph.Xwc(gwcxs - 2 * this.tgraph.xi);
        let twcxf = this.tgraph.Xwc(gwcxf - 2 * this.tgraph.xi);
        graph.rescale();
        this.tgraph.rescale();

        const gw0 = graph.Xwc(0);
        const gw1 = graph.Xwc(graph.grid.width);
        if (!isFinite(gw0) || !isFinite(gw1)) return;

        let tw0 = this.tgraph.Xwc(gw0 - 2 * this.tgraph.xi);
        let tw1 = this.tgraph.Xwc(gw1 - 2 * this.tgraph.xi);
        if (!isFinite(tw0) || !isFinite(tw1)) return;

        const twMin = Math.min(tw0, tw1);
        const twMax = Math.max(tw0, tw1);

        const xMin = Math.min(this.xi, this.xf);
        const xMax = Math.max(this.xi, this.xf);

        const visMin = Math.max(twMin, xMin);
        const visMax = Math.min(twMax, xMax);
        if (visMax <= visMin) return;

        let visOligos = this.getVisibleOligos(twcxs, twcxf);

        // COMPOUND DENSITY MAP.
        //
        // With many compounds on a track the individual marks stop telling you anything: they
        // overlap into a solid band and the question you actually have -- WHERE are they
        // concentrated -- gets harder to answer, not easier. This replaces them with a glow
        // whose brightness follows how many fall in each column.
        //
        // Emptying visOligos is what hides them: both draw loops below iterate it, so one
        // assignment covers each without a flag threaded into either.
        if (this.compoundDensity && visOligos && visOligos.length) {
          try { this.__drawCompoundDensity(graph, visOligos); } catch (e) { }
          visOligos = [];
        }

        let snpsv = [];
        if (this.showSnpIndels) snpsv = this.getVisibleSNPs(twcxs, twcxf);

        if (this.trackRef && this.trackRef.track && this.trackRef.track.tgraph && this.trackRef.track.tgraph.X && this.trackRef.track.tgraph.Y) {
          graph.drawDashedLine(this.tgraph.xi, this.tgraph.Y(0), this.trackRef.track.tgraph.X(this.trackRef.xi), this.trackRef.track.tgraph.Y(0), GX_T.guide, 1, "round");
          graph.drawDashedLine(this.tgraph.xi + this.tgraph.width, this.tgraph.Y(0), this.trackRef.track.tgraph.X(this.trackRef.xf), this.trackRef.track.tgraph.Y(0), GX_T.guide, 1, "round");
        }
        if (this.highlightstart != null && this.highlightstart >= 0 && this.highlightend != null && this.highlightend > this.highlightstart) {
          const xCenter = (graph.X(this.tgraph.X(this.highlightstart)) + graph.X(this.tgraph.X(this.highlightend))) / 2;
          const yCenter = graph.Y(this.tgraph.yi + this.tgraph.height);
          const radius = (graph.X(this.tgraph.X(this.highlightend)) - graph.X(this.tgraph.X(this.highlightstart))) / 2;
          ctx.beginPath();
          ctx.strokeStyle = GX_ASO;
          ctx.lineWidth = 15;
          ctx.arc(xCenter, yCenter, radius, 0, Math.PI, true);
          ctx.stroke();
        }
        if (screencell > 5) {
          if (!gwcxs) return;
          if (!gwcxf) return;
          let twcxs = this.tgraph.Xwc(gwcxs - 2 * this.tgraph.xi);
          let twcxf = this.tgraph.Xwc(gwcxf - 2 * this.tgraph.xi);
          const i0 = Math.floor(visMin);
          const i1 = Math.floor(visMax);

          for (let index = i0; index < i1; index++) {
            let color = GX_INTRON;
            if (this.sequence && index < this.sequence.length) {
              let ch1 = this.sequence[index];

              if (this.trackRef) {
                let ch2 = this.trackRef.track.sequence[index];
                if (ch1 == "-" || ch2 === "-") {
                  color = GX_T.guide;
                } else if (ch1 != ch2) {
                  color = GX_SNP;
                }
              }
            }
          }
        } else if (screencell > 0.005) {
          if (this.trackRef && this.trackRef.map && this.showTrackRefMap) {
            let j = this.trackRef.map;

            for (let index = i0; index < i1; index++) {
              let jindex = j[index];
              graph.drawDashedLine(this.tgraph.X(index), this.tgraph.Y(0), this.trackRef.track.tgraph.X(jindex + this.trackRef.track.tgraph.getxmin()), this.trackRef.track.tgraph.Y(0), GX_T.guide);
            }
          }

          // for (let index = Math.floor(twcxs); index < Math.floor(twcxf); index++) {
          //   if (index % 1000 === 0) {
          //     const is10kb = index % 10000 === 0;
          //     const is5kb = !is10kb && index % 5000 === 0;

          //     const baseY = -0.04;
          //     const minorLen = 0.012;
          //     const mediumLen = 0.02;
          //     const majorLen = 0.03;

          //     const tickLen = is10kb ? majorLen : is5kb ? mediumLen : minorLen;
          //     const tickClr = is10kb ? "dimGray" : is5kb ? "gray" : "lightGray";

          //     if (is10kb) {
          //       const kbLabel = index / 1000 + " kb";
          //       graph.drawString(kbLabel, this.tgraph.X(index), this.tgraph.Y(0.5 - majorLen - 0.02), "gray", this.detail_ffont6);
          //     }
          //   }
          // }

          for (let index = Math.floor(twcxs); index < Math.floor(twcxf); index++) {
            let color = GX_INTRON;
            if (this.sequence != null && index < this.sequence.length) {
              let ch1 = this.sequence[index];

              if (this.trackRef && this.trackRef.map && this.trackRef.map.length >= 0) {
                let j = this.trackRef.map;
                let jindex = j[index];
                let ch2 = this.trackRef.track.sequence[index];
                if (ch1 == "-" || ch2 === "-") {
                  color = GX_DEL;
                  graph.drawLine(this.tgraph.X(index), this.tgraph.Y(0), this.trackRef.track.tgraph.X(jindex), this.trackRef.track.tgraph.Y(0), color);
                } else if (ch1 != ch2) {
                }
              } else if (this.trackRef && this.trackRef.showMismatches) {
                let ch2 = this.trackRef.track.sequence[index];
                if (ch1 == "-" || ch2 === "-") {
                  color = GX_T.ring;
                  graph.drawLine(this.tgraph.X(index), this.tgraph.Y(0), this.trackRef.track.tgraph.X(index + this.trackRef.track.tgraph.getxmin()), this.trackRef.track.tgraph.Y(0), color);
                } else if (ch1 != ch2) {
                  color = GX_SNP;
                  let xstart = this.tgraph.X(this.tgraph.getxmin() + index);
                  let xend = this.trackRef.track.tgraph.X(index + this.trackRef.track.tgraph.getxmin());
                  graph.drawLine(xstart, this.tgraph.Y(0), xend, this.trackRef.track.tgraph.Y(0), color);
                }
              }
            }
          }
        }

        await graph.drawLine(this.tgraph.X(this.xi), this.tgraph.Y(0), this.tgraph.X(this.xf), this.tgraph.Y(0), GX_INTRON, 1, "round");
        if (trackScreenWidth > 10 && screencell > 0.0) {
          let deg = 0;
          if (this.strand && !__clinical) {   // clinical-compound tracks show no direction arrows
            if (this.strand === -1 || this.strand === "-1") {
              deg = 3.14159;
            }
            let increment = (this.xf - this.xi) / 15;
            for (let incr = this.xi; incr < this.xf - increment; incr += increment) {
              graph.drawArrowhead(graph.X(this.tgraph.X(incr)) + 10, graph.Y(this.tgraph.yi + this.tgraph.height), deg, 6, 4, GX_T.arrow);
            }
          }
          if (this.strand >= 0) {
            this.annotations = this.annotations.sort(function (a, b) {
              return parseFloat(a.xi) - parseFloat(b.xi);
            });
          } else {
            this.annotations = this.annotations.sort(function (a, b) {
              return parseFloat(b.xi) - parseFloat(a.xi);
            });
          }

          let i = 1;
          let exonIndex = 0;
          let stopIndex = 0;
          let cstart = 0;
          let t = null;
          for (let a of this.annotations) {
            a.xf = Math.floor(a.xf);
            a.xi = Math.floor(a.xi);

            if (a.type === "Translation") {
              stopIndex = Math.abs(Math.floor(a.gxf) - Math.floor(a.gxi));
              t = a;
            }
          }
          if (this.showAnnotaions && !__clinical) {   // clinical-compound tracks show no annotations
            const drawVIntron = (x1World, x2World) => {
              if (!isFinite(x1World) || !isFinite(x2World)) return;
              const x1w = Math.min(x1World, x2World);
              const x2w = Math.max(x1World, x2World);
              if (x2w <= x1w) return;
              const yBase = this.tgraph.Y(0);
              const depth = Math.max(0.03, Math.min(0.6, 0.9 * (screencell / 10 + 1)));
              const yApex = this.tgraph.Y(-depth);
              const x1 = this.tgraph.X(x1w);
              const x2 = this.tgraph.X(x2w);
              const xm = this.tgraph.X((x1w + x2w) / 2);
              const inView = (x1 <= graph.grid.xmax && x2 >= graph.grid.xmin) || (graph.X(x1) <= graph.grid.width && graph.X(x2) >= 0);
              if (!inView) return;

              // Exon-to-exon bridge: lighter + dashed so it reads as a connector, not a feature.
              const __bctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
              if (__bctx) {
                __bctx.save();
                __bctx.strokeStyle = 'rgba(176,83,63,0.4)';
                __bctx.lineWidth = 1;
                __bctx.lineCap = 'round';
                try { __bctx.setLineDash([4, 3]); } catch (e) { }
                __bctx.beginPath();
                __bctx.moveTo(graph.X(x1), graph.Y(yBase));
                __bctx.lineTo(graph.X(xm), graph.Y(yApex));
                __bctx.lineTo(graph.X(x2), graph.Y(yBase));
                __bctx.stroke();
                try { __bctx.setLineDash([]); } catch (e) { }
                __bctx.restore();
              } else {
                graph.drawLine(x1, yBase, xm, yApex, GX_INTRON, 1, "round");
                graph.drawLine(xm, yApex, x2, yBase, GX_INTRON, 1, "round");
              }
            };

            const exons = this.annotations
              .filter((a) => a && a.type === "Exon")
              .map((a) => {
                const xi = Math.min(Math.floor(a.xi - 1), Math.floor(a.xf - 1));
                const xf = Math.max(Math.floor(a.xi), Math.floor(a.xf));
                return { xi, xf };
              });

            if (exons.length >= 2) {
              if (this.strand >= 0) {
                exons.sort((a, b) => a.xi - b.xi);
              } else {
                exons.sort((a, b) => b.xi - a.xi);
              }

              const gwcxs2 = graph.Xwc(0);
              const gwcxf2 = graph.Xwc(graph.grid.width);
              if (gwcxs2 != null && gwcxf2 != null) {
                const twcxs2 = this.tgraph.Xwc(gwcxs2 - 2 * this.tgraph.xi);
                const twcxf2 = this.tgraph.Xwc(gwcxf2 - 2 * this.tgraph.xi);
                const xminView = Math.min(twcxs2, twcxf2) - 100;
                const xmaxView = Math.max(twcxs2, twcxf2) + 100;

                for (let i = 0; i < exons.length - 1; i++) {
                  const left = exons[i];
                  const right = exons[i + 1];

                  let rawA, rawB;
                  if (this.strand >= 0) {
                    rawA = left.xf;
                    rawB = right.xi;
                  } else {
                    rawA = right.xf;
                    rawB = left.xi;
                  }

                  const x1World = Math.min(rawA, rawB);
                  const x2World = Math.max(rawA, rawB);
                  if (!isFinite(x1World) || !isFinite(x2World) || x2World - x1World < 1) continue;

                  if (x2World < xminView || x1World > xmaxView) continue;

                  drawVIntron.call(this, x1World, x2World);
                }
              }
            }

            // Reset the exon-index badge overlap anchor for this track/frame so the
            // Exon shape (gene-draw.js) can drop badges whose circles/numbers would
            // overlap the previous one, without the anchor leaking across frames.
            graph.__exonBadgeLastX = null;
            graph.__exonBadgeXs = [];   // exon-index badges kept on THIS track this frame (collision list)
            // Track-level coordinate-label declutter: a "c." tick or exon-index number is
            // suppressed if it would collide with ANY coordinate already drawn on this SAME
            // track this frame — the anchor must span all exon annotations, not reset per exon.
            const _trackNumXs = [];
            const _trackMajorXs = [];
            // Visible track-world range (screen edges → this track's local coords). Zoomed in,
            // an exon can span thousands of bases while only a handful are on screen — skip the
            // off-screen ones so we don't compute an X()/draw per base across the whole exon.
            let _viewLo = -Infinity, _viewHi = Infinity;
            try {
              const _gL = graph.Xwc(0), _gR = graph.Xwc(graph.grid.width);
              const _tL = this.tgraph.Xwc(_gL - 2 * this.tgraph.xi);
              const _tR = this.tgraph.Xwc(_gR - 2 * this.tgraph.xi);
              _viewLo = Math.min(_tL, _tR) - 2;
              _viewHi = Math.max(_tL, _tR) + 2;
            } catch (e) { }
            // Every 10th redraw, re-lane THIS track's annotation labels (screen-space) so labels
            // that have drifted into collision as the user pans/zooms get re-stacked. Scoped to
            // this track only — it never considers annotations on other tracks.
            this.__annLabelFrame = (this.__annLabelFrame | 0) + 1;
            if (this.__annLabelFrame % 10 === 0) {
              // Re-lane the labels (merging already ran at the top of draw()). Scoped to this track.
              try { this._recheckAnnotationLabelLanes(graph); } catch (e) { }
            }
            // Per-frame list of drawn annotation-name rectangles (screen space). A name whose box
            // would overlap one already drawn this frame is skipped (annotation.js / drawCddSite),
            // so cluttered regions simply drop the colliding labels instead of stacking forever.
            this.tgraph.__labelRects = [];
            // Background 5'/3' UTR labels: when zoomed OUT (screencell <= 5), draw a light-gray,
            // centered label over each untranslated region. Drawn BEFORE the annotation loop and all
            // later feature passes, so it sits behind everything and never overwrites other content.
            try {
              if (screencell <= 5 && t) {
                const __minus = (this.strand === -1 || this.strand === '-1' || this.strand === '-');
                let __f0, __f1, __t0, __t1;
                if (!__minus) { __f0 = this.xi; __f1 = t.xi; __t0 = t.xf; __t1 = this.xf; }
                else { __f0 = t.xf; __f1 = this.xf; __t0 = this.xi; __t1 = t.xi; }
                const __sy = graph.Y(this.tgraph.Y(0.5));
                const __utrLabel = (label, a, b) => {
                  const lo = Math.min(a, b), hi = Math.max(a, b);
                  if (hi - lo < 1) return;
                  const sxLo = graph.X(this.tgraph.X(lo)), sxHi = graph.X(this.tgraph.X(hi));
                  if (Math.abs(sxHi - sxLo) < 40) return;   // region too narrow for a legible label
                  try { graph.drawScreenText(label, (sxLo + sxHi) / 2, __sy, 'rgba(150,160,175,0.5)', 13, 'center'); } catch (e) { }
                };
                __utrLabel("5' UTR", __f0, __f1);
                __utrLabel("3' UTR", __t0, __t1);
              }
            } catch (e) { }
            for (let a of this.annotations) {
              a.gxi = Math.floor(a.gxi);
              a.gxf = Math.floor(a.gxf);
              a.xi = Math.floor(a.xi);
              a.xf = Math.floor(a.xf);

              if (a.type === "Exon") {
                a.index = i++;
                a.draw(graph, this);

                const hasT = t && Number.isFinite(t.xi) && Number.isFinite(t.xf);
                const t_xi = hasT ? Math.floor(t.xi) : null;
                const t_xf = hasT ? Math.floor(t.xf) : null;

                const getSpan = () => {
                  if (!hasT) return { start: a.xi, end: a.xf };

                  if (a.xf > t_xi && a.xi < t_xi) return { start: t_xi, end: a.xf };

                  if (t_xf < a.xf && t_xf > a.xi) return { start: a.xi, end: t_xf };

                  return { start: a.xi, end: a.xf };
                };

                const { start, end } = getSpan();

                // The per-base index numbers along the sequence -- drawn bare, without the "c."
                // prefix, at high zoom. Hidden with Exon numbers.
                //
                // The flag gates the DRAWING inside this branch, not the branch itself. Putting
                // it in the condition sent a hidden-numbers track down the else, which draws the
                // "c." major ticks -- so turning the numbers off would have turned a different
                // set of labels on.
                if (screencell > 30 && exonIndex < stopIndex) {
                  if (this.showExonNumbers === false) {
                    // Nothing to draw, and deliberately nothing pushed to _trackNumXs either:
                    // that list is the overlap reservation, and holding space for numbers
                    // nobody draws would push the remaining labels apart for no reason.
                  } else if (this.strand < 0) {
                    const lo = Math.min(start, end);
                    const hi = Math.max(start, end);

                    if (hasT && a.xf > t_xi && a.xi < t_xi) {
                      cstart = t_xi;
                      exonIndex = 1;
                    }

                    for (let _i = hi; _i >= lo; _i--) {
                      if (_i < _viewLo || _i > _viewHi) { exonIndex++; if (exonIndex > stopIndex) break; continue; }   // off-screen: advance c-index, skip draw
                      const _px = graph.grid.X(Math.round(this.tgraph.X(_i)));
                      if (!_trackNumXs.some((px) => Math.abs(_px - px) < 22)) {   // hide numbers overlapping any on this track
                        graph.drawString("  " + exonIndex + "  ", Math.round(this.tgraph.X(_i)), this.tgraph.Y(-0.05), GX_DEL, this.detail_ffont6);
                        _trackNumXs.push(_px);
                      }
                      exonIndex++;
                      if (exonIndex > stopIndex) break;
                    }
                  } else {
                    const lo = Math.min(start, end);
                    const hi = Math.max(start, end);

                    if (hasT && a.xf > t_xi && a.xi < t_xi) {
                      exonIndex = 1;
                    }

                    for (let _i = lo; _i <= hi; _i++) {
                      if (_i < _viewLo || _i > _viewHi) { exonIndex++; if (exonIndex > stopIndex) break; continue; }   // off-screen: advance c-index, skip draw
                      const _px = graph.grid.X(Math.round(this.tgraph.X(_i)));
                      if (!_trackNumXs.some((px) => Math.abs(_px - px) < 22)) {   // hide numbers overlapping any on this track
                        graph.drawString("  " + exonIndex + "  ", Math.round(this.tgraph.X(_i)), this.tgraph.Y(-0.1), GX_INS, this.detail_ffont6);
                        _trackNumXs.push(_px);
                      }
                      exonIndex++;
                      if (exonIndex > stopIndex) break;
                    }
                  }
                } else {


                  const lo = Math.min(start, end);
                  const hi = Math.max(start, end);

                  const minimumLabelSpacing = 55; // pixels between labels

                  if (this.strand < 0) {
                    if (hasT && a.xf > t_xi && a.xi < t_xi) {
                      cstart = t_xi;
                      exonIndex = 1;
                    }

                    for (let _i = hi; _i >= lo; _i--) {
                      if (exonIndex % 200 === 0 && _i >= _viewLo && _i <= _viewHi) {
                        drawExonMajorTickAt(
                          ctx,
                          graph,
                          this.tgraph,
                          _i,
                          exonIndex,
                          GX_T.ink,
                          this.detail_ffont6,
                          _trackMajorXs,
                          minimumLabelSpacing
                          , this
                        );
                      }

                      exonIndex++;

                      if (exonIndex > stopIndex) {
                        break;
                      }
                    }
                  } else {
                    if (hasT && a.xf > t_xi && a.xi < t_xi) {
                      cstart = t_xi;
                      exonIndex = 1;
                    }

                    for (let _i = lo; _i <= hi; _i++) {
                      if (exonIndex % 200 === 0 && _i >= _viewLo && _i <= _viewHi) {
                        drawExonMajorTickAt(
                          ctx,
                          graph,
                          this.tgraph,
                          _i,
                          exonIndex,
                          GX_T.ink,
                          this.detail_ffont6,
                          _trackMajorXs,
                          minimumLabelSpacing
                          , this
                        );
                      }

                      exonIndex++;

                      if (exonIndex > stopIndex) {
                        break;
                      }
                    }
                  }

                }

                let offset = 0;
                const totalPoints = 3;
                const interval = Math.abs(a.xf - a.xi) / (totalPoints - 1);
                if (screencell > 0.5) {
                  for (let i = 1; i < totalPoints - 1; i++) {
                    let xvalue = a.xi + offset + i * interval;
                    graph.drawArrowhead(graph.X(this.tgraph.X(xvalue)) + 20, graph.Y(this.tgraph.yi + this.tgraph.height), deg, 6, 4, GX_T.arrow);
                    graph.drawArrowhead(graph.X(this.tgraph.X(xvalue)) - 20, graph.Y(this.tgraph.yi + this.tgraph.height), deg, 6, 4, GX_T.arrow);
                  }
                }
              } else {
                a.draw(graph, this);
              }
            }
          }
          const groups = {};
          let annot = this.getAnnotationsInRange(twcxs - 10000, twcxf + 10000);
          annot.forEach((annotation) => {
            if (!groups[annotation.name]) {
              groups[annotation.name] = [];
            }
            groups[annotation.name].push(annotation.xi);
          });
          if (this.showArc && typeof groups === "object" && groups !== null && ctx && graph && this.tgraph) {
            const groupNames = Object.keys(groups);
            groupNames.forEach((name, index) => {
              const xis = (Array.isArray(groups[name]) ? groups[name].slice() : []).sort((a, b) => a - b);
              if (xis.length < 2) return;

              const color = `hsl(${(360 * index) / groupNames.length}, 100%, 50%, 0.2)`;
              let randy = 10;

              for (let i = 0; i < xis.length - 1; i++) {
                try {
                  const x1Raw = this.tgraph.X?.(xis[i]);
                  const x2Raw = this.tgraph.X?.(xis[i + 1]);
                  if (typeof x1Raw !== "number" || typeof x2Raw !== "number") continue;

                  const x1 = graph.X(x1Raw);
                  const x2 = graph.X(x2Raw);
                  const radius = (x2 - x1) / 2;

                  if (!isFinite(radius) || radius <= 0) continue;

                  const xCenter = (x1 + x2) / 2;
                  const yBase = this.tgraph.yi + this.tgraph.height;
                  const yCenter = graph.Y(yBase);

                  if (!isFinite(xCenter) || !isFinite(yCenter)) continue;

                  ctx.beginPath();
                  ctx.strokeStyle = color;
                  ctx.lineWidth = 1;
                  ctx.arc(xCenter, yCenter, radius, 0, Math.PI, true);
                  ctx.stroke();
                } catch (err) {
                  console.warn(`Failed to draw arc for group "${name}" at index ${i}:`, err);
                }
              }
            });
          }

          if (this.showPlots) {
            for (let p of this.plots) {
              p.draw(graph, this.tgraph);
            }
          }
          let y = 0;

          if (ctx) ctx.font = this.detail_ffont7;

          // Flag oligos whose sequence is duplicated on this track so draw() can
          // render them distinctively (a maroon stick with a yellow glow).
          try {
            // Key by sequence AND position: two copies of the same compound mapped to DIFFERENT
            // loci are legitimate (e.g. off-target mapping) — only same-sequence oligos at the SAME
            // position are truly redundant duplicates and get the maroon-stick warning.
            const __dupKey = (o) => { const s = (o.sequence || o.synthesisSequence || ''); return s ? (s + '@' + Math.round(o.xi)) : ''; };
            const __seqCount = {};
            for (const o of this.oligos) {
              if (!o) continue;
              const k = __dupKey(o);
              if (k) __seqCount[k] = (__seqCount[k] || 0) + 1;
            }
            for (const o of this.oligos) {
              if (!o) continue;
              const k = __dupKey(o);
              o.__dupSeq = !!(k && __seqCount[k] > 1);
            }
          } catch (e) { }

          // Flag oligos that overlap an amplicon on this track so draw() can render
          // them magenta with a warning label. Amplicons live in this.oligos as
          // Amplicon objects (type 'amplicon' / left+right primers), so they share
          // the oligos' coordinate space and overlap can be compared directly.
          try {
            const __ampSpans = [];
            for (const a of this.oligos) {
              if (!a) continue;
              const isAmp = a.type === 'amplicon' || (a.left && a.right);
              if (!isAmp) continue;
              // Amplicon.xf is (right.xi + right.xf); prefer the right primer's true end.
              const s = Number.isFinite(a.xi) ? a.xi : (a.left && a.left.xi);
              const e = (a.right && Number.isFinite(a.right.xf)) ? a.right.xf : a.xf;
              if (Number.isFinite(s) && Number.isFinite(e) && e > s) __ampSpans.push([Math.min(s, e), Math.max(s, e)]);
            }
            for (const o of this.oligos) {
              if (!o) continue;
              // An amplicon never flags itself.
              if (o.type === 'amplicon' || (o.left && o.right)) { o.__overlapsAmplicon = false; continue; }
              let over = false;
              if (__ampSpans.length && Number.isFinite(o.xi) && Number.isFinite(o.xf)) {
                const oi = Math.min(o.xi, o.xf), of = Math.max(o.xi, o.xf);
                for (const sp of __ampSpans) { if (oi < sp[1] && of > sp[0]) { over = true; break; } }
              }
              o.__overlapsAmplicon = over;
            }
          } catch (e) { }

          if (screencell > 1) {
            for (let o of visOligos) {
              try {
                o.showOfftargets = this.showOfftargets;

                o.draw(graph, this.tgraph, y);
              } catch (e) { }
            }
          } else {
            for (let o of visOligos) {
              if (o.highlight__) {
                graph.drawVerticalLineScreen(graph.X(this.tgraph.X(o.xi)), graph.Y(this.tgraph.Y(o.y)), 2, o.highlight__, 1);
                graph.drawVerticalLineScreen(graph.X(this.tgraph.X(o.xf)), graph.Y(this.tgraph.Y(o.y)), 2, o.highlight__, 1);
              }
              if (o.drawIcon) o.drawIcon(graph, this.tgraph);
              else graph.drawLine(this.tgraph.X(o.xi), this.tgraph.Y(o.y), this.tgraph.X(o.xf), this.tgraph.Y(o.y), o.__overlapsAmplicon ? 'magenta' : GX_INTRON, 1, "round");
            }
          }
        }
        let seq_font = this.detail_ffont;
        if (screencell > 5 && graph.canvas) {
          let x_world_start = graph.Xwc(0);
          let x_world_end = graph.Xwc(graph.canvas.width);
          let tx_world_start = Math.floor(this.tgraph.Xwc(x_world_start - this.tgraph.xi * 2)) - 100;
          let tx_world_end = Math.floor(this.tgraph.Xwc(x_world_end - this.tgraph.xi * 2)) + 100;
          if (tx_world_end < tx_world_start) {
            let t = tx_world_end;
            tx_world_end = tx_world_start;
            tx_world_start = t;
          }

          if (this.sequence) {
            let pseq = -1;
            // Track the genomic span of any flanking (out-of-track) bases in view so we can
            // load the reference sequence for it. Display-only; failsafe.
            let __flankLo = Infinity, __flankHi = -Infinity;
            // Track sequence letters: dark navy, and the glyph size grows as you zoom in
            // (wider base cell => larger font), clamped so it always fits the cell.
            const SEQ_INK = '#0a2540';                 // in-track bases (dark navy)
            const SEQ_FLANK = 'rgba(10,37,64,0.72)';   // flanking reference bases (muted navy)
            // Also cap the glyph height to the vertical gap between the sequence row and the
            // g./index coordinate rows above it, so the larger letters never grow up into
            // those rows — the coordinate labels stay exactly where/how they were.
            let __seqPxFit = 44;
            try {
              const rowGapPx = Math.abs(graph.Y(this.tgraph.Y(0.012)) - graph.Y(this.tgraph.Y(-0.068)));
              if (rowGapPx > 4) __seqPxFit = Math.max(11, Math.floor(rowGapPx / 0.6));
            } catch (e) { }
            // Nucleotide cell font FIRST, so the peptide row can be offset by its height.
            const seqPx = Math.max(11, Math.min(Math.round(screencell * 0.8), 44, __seqPxFit));
            const dynSeqFont = seqPx + "px system-ui, -apple-system, Roboto, Arial, sans-serif";
            const dynSeqFontLarge = Math.min(Math.round(seqPx * 1.25), __seqPxFit) + "px system-ui, -apple-system, Roboto, Arial, sans-serif";
            // Nucleotide sequence row: <=20px above the track bottom. Peptide row: pinned
            // just ABOVE the nucleotide row, offset by the LIVE nucleotide font height
            // (seqPx) + a gap, so it scales with the font and never overlaps.
            // graph.Y(worldY) -> screen pixels; the track bottom is tgraph.Y(0).
            let _seqRowY = this.tgraph.Y(0.012);
            let _pepRowY = this.tgraph.Y(-0.038);
            try {
              const _botY = this.tgraph.Y(0), _botPx = graph.Y(_botY);
              const _ppw = (graph.Y(this.tgraph.Y(0.012)) - _botPx) / (this.tgraph.Y(0.012) - _botY);
              if (_ppw) {
                const _clampRow = (worldY, maxPx) => {
                  const distPx = _botPx - graph.Y(worldY);   // px above the track bottom
                  return distPx > maxPx ? (_botY - maxPx / _ppw) : worldY;
                };
                _seqRowY = _clampRow(this.tgraph.Y(0.012), 20);
                // Peptide baseline sits (seqPx + gap) px above the nucleotide baseline,
                // so it clears the nucleotide letters however large the font grows.
                _pepRowY = _seqRowY - (seqPx + 8) / _ppw;
              }
            } catch (e) { }
            // Expose the peptide row's SCREEN y so annotation leaders (gene-draw.js drawCddSite /
            // annotation.js) stop just ABOVE the amino-acid letters instead of running down through
            // them or all the way to the track baseline. __pepTopPx = top edge of the AA letters.
            try {
              this.tgraph.__pepMidPx = graph.Y(_pepRowY);
              this.tgraph.__pepTopPx = graph.Y(_pepRowY) - seqPx * 0.7;
              // ...and in TRACK space, which is the coordinate a compound's y is expressed in.
              // The design routines place oligos above whatever this row occupies (see
              // __peptideFloorY in baja/manchester/menu/track-design-menu.js), and screen pixels
              // are no use to them: they run before the frame that would convert one.
              //
              // Inverted through the same two reference points the row itself was built from,
              // so a peptide row that moves takes the compound floor with it.
              const _t0 = this.tgraph.Y(0), _t1 = this.tgraph.Y(1);
              if (_t1 !== _t0) this.tgraph.__pepTrackY = (_pepRowY - _t0) / (_t1 - _t0);
            } catch (e) { }
            // Genomic position is computed exon-rooted (genomicAt) for child tracks.
            for (let index = Math.floor(tx_world_start); index < Math.floor(tx_world_end); index++) {
              let seq_index = Math.floor(index - Math.floor(this.xi));
              if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                if (screencell > 30 && screencell > 0.05) {
                  if (!__clinical) {   // clinical-compound tracks show no genomic (g.) / cDNA (c.) coordinates
                    graph.drawString(this.genomicAt(seq_index), Math.round(this.tgraph.X(index)), this.tgraph.Y(-0.09), GX_INTRON, this.detail_ffont6);
                    graph.drawString(" " + (seq_index + 1) + " ", this.tgraph.X(index), this.tgraph.Y(-0.068), GX_START, this.detail_ffont6);
                  }
                  if (this.orf && this.orf.cdsi) {
                    for (let oor of this.orf.cdsi) {
                      if (oor.index === index && oor.ci === 1) {
                        let color = codon_colors(oor.aa);
                        // Codon center = middle of the 3-base cell span [cellX-1, cellX+2].
                        const cellX = Math.round(this.tgraph.X(index));
                        // Peptide letter CENTERED over its codon, just above the nucleotide row.
                        drawCenteredWorldText(graph, oor.aa, cellX + 0.5, _pepRowY, "#" + color, this.detail_ffont4);
                        // Codon bracket: a line under the residue spanning the codon's 3 bases
                        // (small gap between codons so each triplet reads as a group).
                        graph.drawLine(cellX - 1 + 0.12, this.tgraph.Y(-0.012), cellX + 2 - 0.12, this.tgraph.Y(-0.012), "#" + color, 1.5, "round");
                        // Codon number, below the track (also centered on the codon).
                        drawCenteredWorldText(graph, oor.codon_index + 1 + "", cellX + 0.5, this.tgraph.Y(0.3), "#" + color, this.detail_ffont6);
                      }
                    }
                  }
                  if (this.highlightIndex > 0 && this.highlightIndex === index) {
                    graph.drawString(this.sequence[seq_index], Math.round(this.tgraph.X(index)) + 0.2, _seqRowY, SEQ_INK, dynSeqFontLarge);
                  } else {
                    graph.drawString(this.sequence[seq_index], Math.round(this.tgraph.X(index)) + 0.2, _seqRowY, SEQ_INK, dynSeqFont);
                  }

                  let deg = 0;
                  if (this.strand === -1 || this.strand === "-1") {
                    deg = 3.14159;
                  }
                } else {
                  if (this.orf && this.orf.cdsi) {
                    for (let oor of this.orf.cdsi) {
                      if (oor.index === index && oor.ci === 1) {
                        let color = codon_colors(oor.aa);
                        // Peptide centered over its codon, just above the nucleotides (see above).
                        const cellX = Math.round(this.tgraph.X(index));
                        drawCenteredWorldText(graph, oor.aa, cellX + 0.5, _pepRowY, "#" + color, this.font);
                        graph.drawLine(cellX - 1 + 0.12, this.tgraph.Y(-0.012), cellX + 2 - 0.12, this.tgraph.Y(-0.012), "#" + color, 1.5, "round");
                        drawCenteredWorldText(graph, oor.codon_index + 1 + "", cellX + 0.5, this.tgraph.Y(0.3), "#" + color, this.detail_ffont6);
                      }
                    }
                  }
                  let deg = 0;
                  if (this.strand === -1 || this.strand === "-1") {
                    deg = 3.14159;
                  }
                  if (!__clinical && seq_index % 100 === 0) graph.drawArrowhead(graph.X(this.tgraph.X(seq_index)), graph.Y(this.tgraph.yi + this.tgraph.height), deg, 6, 4, GX_T.arrow);

                  graph.drawString(this.sequence[seq_index], Math.round(this.tgraph.X(index)) + 0.2, _seqRowY, SEQ_INK, dynSeqFont);
                }
              } else {
                // Outside the track: draw flanking GENOMIC sequence for visual reference
                // (display-only, muted). Failsafe — a placeholder if it isn't loaded yet.
                let __gp = null, __fb = null;
                try { __gp = this.flankGenomicAt(seq_index); __fb = this.flankBaseAt(__gp); } catch (e) { }
                if (__fb) {
                  try {
                    graph.drawString(__fb, Math.round(this.tgraph.X(index)) + 0.2, _seqRowY, SEQ_FLANK, dynSeqFont);
                    if (screencell > 30 && !__clinical && this.showGenomicCoords !== false) graph.drawString('g.' + _abbrevPos(__gp), Math.round(this.tgraph.X(index)), this.tgraph.Y(-0.09), GX_T.gtag, this.detail_ffont6);
                  } catch (e) { }
                } else {
                  graph.drawString("-", this.tgraph.X(index), this.tgraph.Y(0), GX_INTRON);
                }
                if (__gp != null && isFinite(__gp)) { if (__gp < __flankLo) __flankLo = __gp; if (__gp > __flankHi) __flankHi = __gp; }
              }
              for (let o of visOligos) {
                o.showOfftargets = this.showOfftargets;
                o.drawDetail(graph, this.tgraph, index, y + 0.15);
              }
            }
            // Draw each visible SNP/indel ONCE — not once per visible base. The old loop
            // sat inside the per-index loop and sid.draw() (the full lollipop) has no index
            // guard, so every SNP's marker was redrawn for every base in view
            // (O(bases × SNPs) of redundant canvas work). Now it's O(SNPs).
            {
              // Lane-pack the lollipops so a CLUSTER doesn't step on itself: each marker
              // (plus its ref>alt label) claims a horizontal screen-pixel footprint; a new
              // marker takes the lowest lane whose previous occupant has already ended (in X),
              // otherwise it opens a new lane above. draw()/drawDetail turn the lane index into
              // a stem length, so overlapping variants fan outward in Y instead of colliding.
              const __gapPx = 6;      // min horizontal gap between two markers in the same lane
              const __charPx = 7;     // approx label glyph width
              const __MAX_LANES = 12; // safety cap for very dense pileups
              graph.__topAnnos = [];   // snp annotation callouts, flushed on top after all markers
              const __entries = [];
              for (let sid of snpsv) {
                const __leftSX = graph.X(this.tgraph.X(sid.xi));
                const __ref = (sid.reference0 != null ? sid.reference0 : (sid.reference || ''));
                const __alt = (sid.alternate0 != null ? sid.alternate0 : (sid.alternate || ''));
                const __labelLen = ('' + __ref).length + 1 + ('' + __alt).length;   // "ref>alt"
                const __footPx = 20 + __labelLen * __charPx;
                __entries.push({ sid, left: __leftSX - 4, right: __leftSX + __footPx });
              }
              __entries.sort((a, b) => a.left - b.left);
              const __laneRight = [];   // rightmost occupied screen-X per lane
              for (let e of __entries) {
                let __lane = -1;
                for (let i = 0; i < __laneRight.length; i++) {
                  if (e.left > __laneRight[i] + __gapPx) { __lane = i; break; }
                }
                if (__lane === -1) __lane = __laneRight.length;
                __laneRight[__lane] = e.right;
                const __drawLane = __lane % __MAX_LANES;
                // Show the ref>alt label as soon as the sequence letters are visible (>5,
                // same threshold as the base-letter rendering above).
                if (screencell > 5) e.sid.drawDetail(graph, this.tgraph, e.sid.xi, 0.05 + y, __drawLane);
                e.sid.draw(graph, this.tgraph, 0.15 + y, __drawLane);
              }
            }
            // Load any flanking reference sequence now visible (best-effort, failsafe).
            try { if (__flankHi >= __flankLo) this.ensureFlank(__flankLo, __flankHi); } catch (e) { }

            // (The translucent rectangle over the selected bases is drawn at the TOP of
            // draw(), under the letters, rather than here on top of them -- which is why the
            // earlier version of it obscured the bases and was taken out.)
            // Draw the deferred snp annotation callouts LAST — so the annotation text window is
            // never painted over. Selected/highlighted ones last, so a selected snp's annotation
            // sits above the others.
            try {
              const __ta = graph.__topAnnos || [];
              __ta.sort((a, b) => (a.sel === b.sel) ? 0 : (a.sel ? 1 : -1));
              for (const __a of __ta) SnpIndel._drawAnnotationLeader(graph, __a.hx, __a.hy, __a.text);
              graph.__topAnnos = [];
            } catch (e) { }
          }
        } else {
          let ctx = graph.canvas.getCTX();
          drawSnpLollipopsWide(graph, ctx, this);
          if (trackScreenWidth > 40 && screencell > 0.05) {
            let increment = (this.tgraph.xmax - this.tgraph.xmin) / 4;
            for (let idx = this.tgraph.xmin; idx < this.tgraph.xmax; idx += increment) {
              graph.drawVerticalLine(Math.round(this.tgraph.X(idx)), this.tgraph.Y(0), this.tgraph.height, GX_T.guide, 1);
              graph.drawString(Math.floor(idx) + "", this.tgraph.X(idx), this.tgraph.Y(this.tgraph.ymin), GX_INTRON);
            }

            if (this.highlight_features) {
              for (let a of this.annotations) {
                if (this.highlight_features && this.highlight_features["annotations." + a.type] != null) {
                  let hl = this.highlight_features["annotations." + a.type];
                  if (hl) {
                    hl(graph, this.tgraph.X(a.xi), this.tgraph.X(a.xf), this.tgraph.Y(0));
                  }
                }
              }
            }
            if (this.showPlots) {
              for (let p of this.plots) {
                p.draw(graph, this.tgraph);
              }
            }
            let oin = 0;
            let y = 0;
            if (ctx) ctx.font = this.detail_ffont7;
            if (screencell > 0.3) {
              for (let o of visOligos) {
                if (o) {
                  try {
                    o.showOfftargets = this.showOfftargets;
                    o.draw(graph, this.tgraph, y);
                  } catch (e) { }
                }
              }
            }
          }
        }

        let x_world_start = graph.Xwc(0);
        let x_world_end = graph.Xwc(graph.canvas.width);

        let tx_world_start = Math.floor(this.tgraph.Xwc(x_world_start - this.tgraph.xi * 2)) - 100;
        let tx_world_end = Math.floor(this.tgraph.Xwc(x_world_end - this.tgraph.xi * 2)) + 100;

        if (tx_world_end < tx_world_start) [tx_world_start, tx_world_end] = [tx_world_end, tx_world_start];

        const visibleSpan = Math.max(1, tx_world_end - tx_world_start);

        const targetLabels = 12;
        const roughStep = visibleSpan / targetLabels;

        function niceStep(x) {
          const pow = Math.pow(10, Math.floor(Math.log10(x)));
          const n = x / pow;
          if (n <= 1) return 1 * pow;
          if (n <= 2) return 2 * pow;
          if (n <= 5) return 5 * pow;
          return 10 * pow;
        }

        let step = niceStep(roughStep);
        const xiInt = Math.floor(this.xi);

        let first = Math.ceil(tx_world_start / step) * step;

        // Non-linear genomic mapping for cDNA/derived children (introns removed / region
        // cut out) via trackRef.genomeMap; linear fallback for a plain genomic track.
        // Clinical-compound tracks show NO genomic ruler (ticks / direction arrows / g. tags).
        for (let index = first; index <= tx_world_end && !__clinical; index += step) {
          // Don't draw genomic indexes / direction arrows past the ends of the track — only
          // between the track's own start and end (in track-world coords).
          if (index < this.xi || index > this.xf) continue;
          const seq_index = Math.floor(index - xiInt);
          const genomicPos = this.genomicAt(seq_index);

          const sx = Math.round(graph.grid.X(this.tgraph.X(index)));
          const syTick = graph.grid.Y(this.tgraph.Y(y + this.tgraph.ymax)) + 15;

          ctx.strokeStyle = GX_T.ring;
          ctx.beginPath();
          ctx.moveTo(sx, syTick);
          ctx.lineTo(sx, syTick + 6);
          ctx.stroke();

          // Small triangle at each tick showing the transcript's direction (strand):
          // points right for + strand, left for - strand.
          {
            // A clear arrow (shaft + chevron head) instead of a small triangle, so the
            // track's direction (strand) is obvious. Points right for +, left for -.
            const dir = (this.strand === -1 || this.strand === "-1" || this.strand === '-') ? -1 : 1;
            const shaft = 12;         // shaft length (px)
            const head = 5;           // arrowhead length (px)
            const hh = 4;             // arrowhead half-height (px)
            const ay = syTick + 3;    // vertically centered on the tick
            const tipx = sx + dir * shaft;
            ctx.save();
            ctx.strokeStyle = GX_T.ink;
            ctx.lineWidth = 1.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(sx, ay);                       // shaft outward from the tick
            ctx.lineTo(tipx, ay);
            ctx.moveTo(tipx, ay);                     // chevron head at the tip
            ctx.lineTo(tipx - dir * head, ay - hh);
            ctx.moveTo(tipx, ay);
            ctx.lineTo(tipx - dir * head, ay + hh);
            ctx.stroke();
            ctx.restore();
          }

          // ctx.save();

          // ctx.translate(sx + 2, syTick - 10);
          // ctx.rotate((-45 * Math.PI) / 180);

          // ctx.fillStyle = GX_T.gtag;
          // ctx.textAlign = "left";
          // ctx.textBaseline = "alphabetic";
          // if (screencell > 5 && graph.canvas) {
          //   if (this.showGenomicCoords !== false) ctx.fillText("g." + (genomicPos), 0, 0);

          // } else
          //   if (this.showGenomicCoords !== false) ctx.fillText("g." + _abbrevPos(genomicPos), 0, 0);

          // ctx.restore();
        }
        let stepPx = Math.abs(graph.grid.X(this.tgraph.X(first + step)) - graph.grid.X(this.tgraph.X(first)));

        while (stepPx < 60) {
          const next = niceStep(step * 1.01 + step);
          if (next === step) break;
          step = next;
          stepPx = Math.abs(graph.grid.X(this.tgraph.X(first + step)) - graph.grid.X(this.tgraph.X(first)));
        }

        try {
          const hits = normalizeAmpliconHits(this.ampliconResults || this.primerAmpliconResults || this.ctModelAmplicons || this.primer3Hits || this.amplicon_hits);
          if (hits && hits.length) {
            const x_world_start = graph.Xwc(0);
            const x_world_end = graph.Xwc(graph.canvas.width);
            const tx_world_start = this.tgraph.Xwc(x_world_start - this.tgraph.xi * 2);
            const tx_world_end = this.tgraph.Xwc(x_world_end - this.tgraph.xi * 2);
            const vx0 = Math.floor(tx_world_start);
            const vx1 = Math.floor(tx_world_end);

            const boxes = [];
            const showPrimerText = !!this.sequence && screencell > 5;

            const truncSeq = (s, n = 28) => {
              s = (s || "").toString();
              if (s.length <= n) return s;
              const k = Math.max(8, Math.floor((n - 1) / 2));
              return s.slice(0, k) + "…" + s.slice(-k);
            };

            const drawSegmentWithHalo = (x0, x1, y, mainColor, haloColor, mainW, haloW) => {
              graph.drawLine(x0, y, x1, y, haloColor, haloW);

              graph.drawLine(x0, y, x1, y, mainColor, mainW);
            };

            const drawBox = (x0, x1, yCenter, heightPx, color, edgeW = 2) => {
              const yTop = yCenter - heightPx / 2;
              const yBot = yCenter + heightPx / 2;
              graph.drawLine(x0, yTop, x1, yTop, color, edgeW);
              graph.drawLine(x0, yBot, x1, yBot, color, edgeW);
              graph.drawLine(x0, yTop, x0, yBot, color, edgeW);
              graph.drawLine(x1, yTop, x1, yBot, color, edgeW);
            };

            const maxRows = Math.min(12, hits.length);
            for (let i = 0; i < maxRows; i++) {
              const h = hits[i] || {};
              const a0 = +h.amp_start;
              const a1 = +h.amp_end;
              if (!Number.isFinite(a0) || !Number.isFinite(a1) || a1 <= a0) continue;
              if (a1 < vx0 || a0 > vx1) continue;

              const p = Math.max(0, Math.min(1, +h.prob_good_ct_lt_threshold || 0));

              const hue = Math.round(120 * p);
              const color = `hsl(${hue} 90% 45% / 0.90)`;
              const halo = `hsl(${hue} 90% 45% / 0.25)`;

              const fwdColor = `hsl(210 90% 55% / 0.95)`;
              const fwdHalo = `hsl(210 90% 55% / 0.25)`;
              const revColor = `hsl(285 85% 60% / 0.95)`;
              const revHalo = `hsl(285 85% 60% / 0.25)`;
              const probeColor = `hsl(45 95% 55% / 0.95)`;
              const probeHalo = `hsl(45 95% 55% / 0.25)`;

              const yRow = this.tgraph.Y(0.1 + i * 0.075);

              const x0 = Math.round(this.tgraph.X(a0));
              const x1 = Math.round(this.tgraph.X(a1));

              drawSegmentWithHalo(x0, x1, yRow, color, halo, 6, 14);

              // Lasso-selection highlight outline. x0/x1/yRow are WORLD coords
              // (drawLine applies grid.X/Y), so convert to screen for strokeRect.
              if (h.__lassoHi) {
                try {
                  const _hc = graph.canvas.getCTX();
                  const _sx0 = graph.grid.X(x0), _sx1 = graph.grid.X(x1), _sy = graph.grid.Y(yRow);
                  _hc.save();
                  _hc.strokeStyle = h.__lassoHi;
                  _hc.lineWidth = 3;
                  _hc.strokeRect(_sx0 - 3, _sy - 12, (_sx1 - _sx0) + 6, 24);
                  _hc.restore();
                } catch (e) { }
              }

              const fwdSeq = (h.forward_primer || "").toString();
              const revSeq = (h.reverse_primer || "").toString();
              const probeSeq = (h.probe || "").toString();
              const fLen = fwdSeq.length || 0;
              const rLen = revSeq.length || 0;

              const f0 = a0;
              const f1 = Math.min(a1, a0 + fLen);
              const r1 = a1;
              const r0 = Math.max(a0, a1 - rLen);

              if (fLen > 0 && f1 > f0) {
                const fx0 = Math.round(this.tgraph.X(f0));
                const fx1 = Math.round(this.tgraph.X(f1));
                drawSegmentWithHalo(fx0, fx1, yRow, fwdColor, fwdHalo, 10, 18);
                drawBox(fx0, fx1, yRow, 0.01, fwdColor, 2);

                boxes.push({
                  x1: fx0,
                  y1: yRow - 10,
                  x2: fx1,
                  y2: yRow + 10,
                  color: fwdColor,
                  amp_start: a0,
                  amp_end: a1,
                  primer_start: f0,
                  primer_end: f1,
                  hit: h,
                  kind: "ct_fwd_primer",
                });
              }

              if (rLen > 0 && r1 > r0) {
                const rx0 = Math.round(this.tgraph.X(r0));
                const rx1 = Math.round(this.tgraph.X(r1));
                drawSegmentWithHalo(rx0, rx1, yRow, revColor, revHalo, 10, 18);
                drawBox(rx0, rx1, yRow, 0.01, revColor, 2);

                boxes.push({
                  x1: rx0,
                  y1: yRow - 10,
                  x2: rx1,
                  y2: yRow + 10,
                  color: revColor,
                  amp_start: a0,
                  amp_end: a1,
                  primer_start: r0,
                  primer_end: r1,
                  hit: h,
                  kind: "ct_rev_primer",
                });
              }

              if (probeSeq && probeSeq.length > 0) {
                let pr0 = a0;
                let pr1 = a0;

                const ampSeq = (h.amplicon || "").toString();
                const idx = ampSeq ? ampSeq.indexOf(probeSeq) : -1;

                if (idx >= 0) {
                  pr0 = a0 + idx;
                  pr1 = Math.min(a1, pr0 + probeSeq.length);
                } else {
                  const mid = Math.floor((a0 + a1) / 2);
                  pr0 = Math.max(a0, mid - Math.floor(probeSeq.length / 2));
                  pr1 = Math.min(a1, pr0 + probeSeq.length);
                }

                if (pr1 > pr0) {
                  const px0 = Math.round(this.tgraph.X(pr0));
                  const px1 = Math.round(this.tgraph.X(pr1));
                  drawSegmentWithHalo(px0, px1, yRow, probeColor, probeHalo, 10, 18);
                  drawBox(px0, px1, yRow, 0.01, probeColor, 2);

                  boxes.push({
                    x1: px0,
                    y1: yRow - 10,
                    x2: px1,
                    y2: yRow + 10,
                    color: probeColor,
                    amp_start: a0,
                    amp_end: a1,
                    probe_start: pr0,
                    probe_end: pr1,
                    hit: h,
                    kind: "ct_probe",
                  });
                }
              }

              const yoffset = graph.grid.worldHeight(20);

              const fwd = (h.forward_primer || "").toString();
              const rev = (h.reverse_primer || "").toString();
              const probe = (h.probe || "").toString();

              // Score label is hidden by default; enable per-track via showScore.
              if (this.showScore) {
                const scoreLabel = `Score: ${p.toFixed(3)}`;
                graph.drawString(scoreLabel, (x0 + x1) / 2, yRow - yoffset, GX_T.ink, '15px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif');
              }
              if (screencell > 0.5) {
                const label = `#${i + 1} p=${p.toFixed(3)} len=${a1 - a0}`;
              }
              if (showPrimerText) {
                if (fwd && Number.isFinite(f0) && Number.isFinite(f1) && f1 > f0) {
                  const fx0 = Math.round(this.tgraph.X(f0));
                  const fx1 = Math.round(this.tgraph.X(f1));
                  graph.drawString(`F: ${truncSeq(fwd)}`, fx0, yRow - yoffset, GX_T.ink, '15px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif');
                }

                if (rev && Number.isFinite(r0) && Number.isFinite(r1) && r1 > r0) {
                  const rx0 = Math.round(this.tgraph.X(r0));
                  const rx1 = Math.round(this.tgraph.X(r1));
                  graph.drawString(`R: ${truncSeq(rev)}`, rx0, yRow - yoffset, GX_T.ink, '15px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif');
                }

                if (probe) {
                  graph.drawString(`P: ${truncSeq(probe)}`, (x0 + x1) / 2, yRow - yoffset, "#0a2540", '15px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif');
                }
              }

              boxes.push({
                x1: x0,
                y1: yRow - 10,
                x2: x1,
                y2: yRow + 10,
                color,
                amp_start: a0,
                amp_end: a1,
                hit: h,
                kind: "ct_amplicon",
              });
            }

            if (boxes.length) this.hitSegments = boxes;
          }
        } catch (e) { }
        if (this.sequence) {
          if (!this.markstart || this.markstart < 0) {
            this.potential_motifds_in_selected_space = null;
          }
          if (this.markstart != null && this.markstart >= 0 && this.markend != null && this.markend > this.markstart) {
            let x_world_start = graph.Xwc(0);
            let x_world_end = graph.Xwc(graph.canvas.width);
            let tx_world_start = this.tgraph.Xwc(x_world_start - this.tgraph.xi * 2);

            let tx_world_end = this.tgraph.Xwc(x_world_end - this.tgraph.xi * 2);

            const wxStart = Math.floor(tx_world_start);
            const wxEnd = Math.floor(tx_world_end);
            const useTx = screencell > 30;
            const drawEndWorld = useTx ? wxEnd : Math.floor(this.markend);
            let seq_index_start = Math.floor(this.markstart) - this.xi;
            let seq_index_end = Math.floor(this.markend) - this.xi;

            if (!this.potential_motifds_in_selected_space) {
            }
            let seqq = this.getSequenceRange(this.markstart, this.markend);

            let colorMap = null;
            if (this.potential_motifds_in_selected_space) {
              let res = generateColorMapFromDiscoveries(seqq, 0, seqq.length, this.potential_motifds_in_selected_space, {
                indexToScreenX: (i) => Math.round(graph.grid.X(this.tgraph.X(i + this.markstart))),
                baseYPixel: graph.grid.Y(this.tgraph.Y(y)) + 15,
                segmentWidthPx: 10,
                hitboxPadY: 6,
              });

              colorMap = res.colorMap;

              this.hitSegments = res.screenBoxes ?? [];
            }
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";

            let font = this.detail_ffont6 || '15px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
            ctx.shadowBlur = 0;
            ctx.shadowColor = "black";
            ctx.font = font;
            ctx.lineWidth = 10;

            if (screencell > 10) {
              let start_select_index = Math.floor(this.markstart) - this.xi;
              let end_select_index = Math.floor(this.markend) - this.xi;
              const anchorsByColor = new Map();
              const ctx = graph.canvas.getCTX();
              if (!ctx) return;

              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.font = this.detail_ffont6 || '12px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

              const angle = (0 * Math.PI) / 180;
              const __clin2 = (this.track_type === 'clincial_compound' || this.track_type === 'clinical_compound');

              // True genomic coordinate per local index. For a cDNA/derived child the
              // mapping is non-linear (introns removed / a region cut out), so read it
              // from trackRef.genomeMap; fall back to the linear map for a genomic track.
              for (let index = Math.floor(tx_world_start); index < Math.floor(tx_world_end) && !__clin2; index++) {
                const seq_index = Math.floor(index - Math.floor(this.xi));
                const genomicPos = this.genomicAt(seq_index);

                if (genomicPos % 100 !== 0) continue;

                {
                  const sx = graph.grid.X(Math.round(this.tgraph.X(index)));
                  const sy = 100 + graph.grid.Y(this.tgraph.Y(-0.09)) - 5;
                  ctx.save();
                  ctx.translate(sx, sy);
                  ctx.rotate(angle);
                  ctx.fillStyle = GX_T.gtag;
                  if (this.showGenomicCoords !== false) ctx.fillText("g." + _abbrevPos(genomicPos), 0, 0);
                  ctx.restore();
                }

                {
                  const sx = graph.grid.X(this.tgraph.X(index));
                  const sy = 100 + graph.grid.Y(this.tgraph.Y(-0.068)) - 5;
                  ctx.save();
                  ctx.translate(sx, sy);
                  ctx.rotate(angle);
                  ctx.fillStyle = GX_START;
                  ctx.fillText(" " + (seq_index + 1) + " ", 0, 0);
                  ctx.restore();
                }
              }

              for (let seq_index = 0; seq_index < end_select_index - start_select_index; seq_index++) {
                const _w = seq_index + seq_index_start;
                if (_w < tx_world_start || _w > tx_world_end) continue;   // off-screen selected base — skip
                if (colorMap && seq_index < seqq.length && seqq[seq_index]) {
                  const col = colorMap[seq_index] || GX_INTRON;
                  graph.drawString(seqq[seq_index], Math.round(this.tgraph.X(seq_index + seq_index_start)) + 0.2, this.tgraph.Y(0.012), col, seq_font);

                  const sx = Math.round(graph.grid.X(this.tgraph.X(seq_index + this.markstart)));
                  const sy = graph.grid.Y(this.tgraph.Y(y)) + 15;

                  ctx.fillStyle = col;
                  ctx.strokeStyle = col;
                  ctx.beginPath();
                  ctx.moveTo(sx, sy);
                  ctx.lineTo(sx + 10, sy);
                  ctx.stroke();

                  const ax = sx + 5;
                  const ay = sy;
                  if (!anchorsByColor.has(col)) anchorsByColor.set(col, []);
                  anchorsByColor.get(col).push({ x: ax, y: ay });
                }
              }

              ctx.save();
              ctx.lineWidth = 1.5;
              ctx.globalAlpha = 0.9;

              for (const [col, pts] of anchorsByColor.entries()) {
                if (pts.length < 2) continue;

                pts.sort((a, b) => a.x - b.x);
                ctx.strokeStyle = col;

                for (let i = 0; i < pts.length - 1; i++) {
                  const p1 = pts[i];
                  const p2 = pts[i + 1];

                  const dx = Math.abs(p2.x - p1.x);
                  const midX = (p1.x + p2.x) / 2;

                  const arcHeight = Math.max(30, dx * 0.25);

                  ctx.beginPath();
                  ctx.moveTo(p1.x, p1.y);
                  ctx.quadraticCurveTo(midX, p1.y + arcHeight, p2.x, p2.y);
                  ctx.stroke();
                }
              }

              ctx.restore();
            } else {
            }
          }
        }

        if (this.markstart != null && this.markend != null && this.markstart >= 0 && this.markend > this.markstart) {
          const yMin = this.tgraph.getymin();
          const yMax = this.tgraph.getymax();
          const yMid = (yMax + yMin) / 2;

          // markstart/markend may be WORLD coords (>= xi) or 0-based offsets from track start
          // (< xi). tgraph.X() maps a WORLD coord to screen, so normalize offsets to world first —
          // otherwise a small offset (e.g. 100) maps far to the left of a genomic track (xi ≈ 1e7)
          // and the selection window is drawn off-screen.
          const __toWorld = (m) => (m != null && m < this.xi) ? (this.xi + m) : m;
          const xStart = Math.round(this.tgraph.X(__toWorld(this.markstart)));
          const xEnd = Math.round(this.tgraph.X(__toWorld(this.markend)));

          const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

          const fmtBp = (n) => {
            const v = Math.abs(n);
            if (v >= 1e6) return `${(n / 1e6).toFixed(v >= 1e7 ? 0 : 1)} MB`;
            if (v >= 1e3) return `${(n / 1e3).toFixed(v >= 1e4 ? 0 : 1)} KB`;
            return `${Math.round(n)} bp`;
          };

          const fmtInt = (n) => {
            const s = Math.round(n).toString();
            return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          };

          const screenStartX = graph.X(xStart);
          const screenEndX = graph.X(xEnd);

          const yPosition = graph.Y(this.tgraph.Y(yMin + (yMax - yMin) * 0.25));

          const lineColor = GX_GENE;
          const fillColor = GX_T.exon;
          const guideColor = GX_T.guide;
          const textColor = GX_T.ink;
          const badgeFill = GX_T.paper;
          const badgeStroke = GX_T.guide;

          const pxDist = Math.abs(screenEndX - screenStartX);
          const minDist = 40;
          const headLen = clamp(pxDist * 0.06, 10, 18);
          const headWid = clamp(pxDist * 0.03, 5, 10);
          const barInset = headLen + 2;

          // Translucent marked-region rectangle (shown together with the arrows/guides).
          {
            const rTop = graph.Y(this.tgraph.Y(yMax));
            const rBot = graph.Y(this.tgraph.Y(yMin));
            const rx = Math.min(screenStartX, screenEndX);
            const rw = Math.abs(screenEndX - screenStartX);
            const ry = Math.min(rTop, rBot);
            const rh = Math.abs(rBot - rTop);
            if (rw > 1 && rh > 1) {
              // Through the theme's gene-draw class. Classic reproduces the cyan wash and
              // outline this drew before; the others change the mark itself.
              try { (this.__geneDraw || geneDrawFor(this.theme, GX_T)).body(ctx, rx, ry, rw, rh); } catch (e) { }
              ctx.save();
              ctx.fillStyle = 'rgba(18,194,224,0.00)';    // the wash is the draw class's job now
              ctx.fillRect(rx, ry, rw, rh);
              ctx.lineWidth = 1;
              ctx.strokeStyle = 'rgba(18,194,224,0.00)';
              ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
              ctx.restore();
            }
          }

          ctx.save();
          ctx.lineWidth = 2;
          ctx.strokeStyle = guideColor;
          ctx.shadowColor = "rgba(0,0,0,0.25)";
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;

          const guideTopY = this.tgraph.Y(yMax);
          const guideBottomY = this.tgraph.Y(yMin);
          graph.drawVerticalLine(xStart, guideTopY, this.tgraph.screenHeight(yMax - yMin), GX_T.guide, 2);
          graph.drawVerticalLine(xEnd, guideTopY, this.tgraph.screenHeight(yMax - yMin), GX_T.guide, 2);
          ctx.restore();

          ctx.save();
          ctx.lineWidth = 4;
          ctx.strokeStyle = lineColor;
          ctx.fillStyle = fillColor;

          ctx.shadowColor = "rgba(0,0,0,0.30)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;

          // Arrow HEADS ONLY — one at markstart, one at markend, no connecting shaft. The
          // selected span is already shown by the translucent wash above, so a bar between
          // the heads only added a line across the track.
          // Each head is a grab handle for resizing that edge, so it is drawn to read as a
          // raised physical control: cast shadow for lift, a vertical gradient lit from above
          // for curvature, a dark edge to stay crisp on pale tracks, and a specular streak.
          // Orange rather than the theme gene/exon colours so the handles never blend into the
          // features underneath them. Identical treatment to track-flexi.js.
          // Heads keep a floor size so a very short selection still shows two marks rather
          // than collapsing to nothing (the old code drew a min-width bar for that case).
          {
            const hL = Math.max(headLen, 9);
            const hW = Math.max(headWid, 6);
            const drawGrabHead = (tipX, dir) => {
              ctx.save();
              ctx.shadowColor = 'rgba(120,52,0,0.50)';
              ctx.shadowBlur = 9;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 3;
              const g = ctx.createLinearGradient(0, yPosition - hW, 0, yPosition + hW);
              g.addColorStop(0, '#ffc07a');
              g.addColorStop(0.45, '#ff8c2f');
              g.addColorStop(1, '#dd5f14');
              ctx.beginPath();
              ctx.moveTo(tipX, yPosition);
              ctx.lineTo(tipX + dir * hL, yPosition - hW);
              ctx.lineTo(tipX + dir * hL, yPosition + hW);
              ctx.closePath();
              ctx.fillStyle = g;
              ctx.fill();
              // Edge and highlight must not inherit the cast shadow or they smear.
              ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
              ctx.lineJoin = 'round';
              ctx.lineWidth = 1.25;
              ctx.strokeStyle = '#9c4409';
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(tipX + dir * (hL * 0.20), yPosition - hW * 0.26);
              ctx.lineTo(tipX + dir * (hL * 0.84), yPosition - hW * 0.70);
              ctx.lineWidth = 1.5;
              ctx.lineCap = 'round';
              ctx.strokeStyle = 'rgba(255,255,255,0.60)';
              ctx.stroke();
              ctx.restore();
            };
            drawGrabHead(screenStartX, 1);
            drawGrabHead(screenEndX, -1);
          }
          ctx.restore();

          const dist = this.markend - this.markstart;
          const distLabel = fmtBp(dist);

          // c. (cDNA index) + g. (genomic) at each arrow — computed EXACTLY as the ruler
          // does: seq_index = Math.floor(index) - Math.floor(xi), where markstart/markend
          // are the world `index` values (the input to tgraph.X). c. = seq_index + 1,
          // g. = genomicAt(seq_index).
          const idxStart = Math.floor(this.markstart) - Math.floor(this.xi);
          const idxEnd = Math.floor(this.markend) - Math.floor(this.xi);
          const gStart = this.genomicAt(idxStart);
          const gEnd = this.genomicAt(idxEnd);
          // c. (cDNA) counts with the transcript's orientation: + strand = seq_index + 1,
          // - strand counts from the other end (tgraph.xmax - worldIndex + 1), matching
          // the hover base index.
          const __minus = (this.strand === -1 || this.strand === "-1" || this.strand === '-');
          const cStart = __minus ? Math.round(this.tgraph.xmax - Math.floor(this.markstart)) + 1 : idxStart + 1;
          const cEnd = __minus ? Math.round(this.tgraph.xmax - Math.floor(this.markend)) + 1 : idxEnd + 1;
          const startLabel = 'c.' + fmtInt(cStart) + '  g.' + fmtInt(gStart);
          const endLabel = 'c.' + fmtInt(cEnd) + '  g.' + fmtInt(gEnd);

          const BADGE_FONT = '12px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
          const BADGE_PAD_X = 8;
          // How long a badge is along its own text. For a VERTICAL badge that is its height on
          // screen, which the caller needs to place it clear of the arrow. Measured with the
          // same font drawBadge uses, so the two cannot disagree.
          const badgeLen = (text) => {
            ctx.save();
            ctx.font = BADGE_FONT;
            const w = ctx.measureText(text).width + BADGE_PAD_X * 2;
            ctx.restore();
            return w;
          };

          const drawBadge = (text, x, y, align = "center", vertical = false) => {
            ctx.save();
            ctx.font = BADGE_FONT;
            ctx.textBaseline = "middle";
            ctx.textAlign = vertical ? "center" : align;

            const padX = BADGE_PAD_X,
              padY = 5;
            const metrics = ctx.measureText(text);
            const w = metrics.width + padX * 2;
            const h = 22;

            // A vertical badge is the same card drawn in a rotated frame centred on (x, y):
            // everything below measures from the origin instead of from x/y. A quarter turn
            // anticlockwise, so it reads bottom-to-top like the interval labels in
            // baja/bio/track-layer.js.
            let tx = x, ty = y;
            if (vertical) {
              ctx.translate(x, y);
              ctx.rotate(-Math.PI / 2);
              tx = 0; ty = 0;
            }

            let bx = tx - ((vertical || align === "center") ? w / 2 : align === "left" ? 0 : w);
            let by = ty - h / 2;

            ctx.shadowColor = "rgba(0,0,0,0.22)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 3;

            const r = 8;
            ctx.fillStyle = badgeFill;
            ctx.strokeStyle = badgeStroke;
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(bx + r, by);
            ctx.lineTo(bx + w - r, by);
            ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
            ctx.lineTo(bx + w, by + h - r);
            ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
            ctx.lineTo(bx + r, by + h);
            ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
            ctx.lineTo(bx, by + r);
            ctx.quadraticCurveTo(bx, by, bx + r, by);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.shadowColor = "transparent";
            ctx.fillStyle = textColor;
            ctx.fillText(text, tx, ty);

            ctx.restore();
          };

          const centerX = (screenStartX + screenEndX) / 2;

          const margin = 6;
          const canvasW = ctx.canvas.width;
          ctx.lineWidth = 1;

          // The COORDINATE badges are drawn on their side, a quarter turn anticlockwise.
          //
          // Flat, each one is as wide as 'c.1,234  g.12,345,678' -- around 150px -- so on any
          // selection shorter than that the two overlapped each other, and both were pushed off
          // their own arrow by the offset that tried to avoid it. Turned vertical a badge is 22px
          // wide whatever it says, so each one sits directly ON the arrow it describes and a
          // selection of a few bases still reads as two distinct coordinates.
          //
          // Anchored half its own length above the arrow, since a vertical badge grows upward
          // from its centre, and clamped by that half-length so it cannot run off the top.
          // The x clamp uses the badge's rotated half-WIDTH (h/2 = 11) rather than the flat
          // width it no longer has.
          const VBADGE_HALF_W = 11;
          const vBadgeX = (x) => Math.max(margin + VBADGE_HALF_W,
            Math.min(canvasW - margin - VBADGE_HALF_W, x));
          const vBadgeY = (text) => {
            const half = badgeLen(text) / 2;
            return Math.max(margin + half, yPosition - 20 - half);
          };

          // Size label stays flat and below: it is one short reading about the span as a whole,
          // not a coordinate belonging to either end. Clinical-compound tracks keep it and show
          // no c./g. coordinate badges.
          drawBadge(distLabel, centerX, yPosition + 18, "center");
          if (!(this.track_type === 'clincial_compound' || this.track_type === 'clinical_compound')) {
            drawBadge(startLabel, vBadgeX(screenStartX), vBadgeY(startLabel), "center", true);
            drawBadge(endLabel, vBadgeX(screenEndX), vBadgeY(endLabel), "center", true);
          }
        }

        if (this.targetPhase != null) {
          let fifthpoint = (this.tgraph.getymax() - this.tgraph.getymin()) / 5;
          if (this.targetPhase == -1) {
            graph.drawString("Haplotype to target", this.tgraph.xi + this.tgraph.width + 10, this.tgraph.Y(-1 * fifthpoint), GX_GENE);
          } else if (this.targetPhase == 1) {
            graph.drawString("Haplotype to target", this.tgraph.xi + this.tgraph.width + 10, this.tgraph.Y(fifthpoint), GX_GENE);
          }
        }

        const nameX = this.tgraph.xi + this.tgraph.width;
        const nameY = this.tgraph.Y(this.tgraph.ymax - (this.tgraph.ymax - this.tgraph.ymin) / 2);

        graph.drawString(this.name, nameX, nameY, GX_T.ink, this.detail_ffont7);

        // Persistent track-name watermark: a faint label pinned to the LEFT edge of the visible
        // track at its vertical centre, drawn in SCREEN space so it stays on screen no matter how
        // far you pan / zoom into a feature — as long as the track is in view, its name is too.
        try {
          const _wctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
          if (_wctx && this.name) {
            const _cw = _wctx.canvas.width, _ch = _wctx.canvas.height;
            const _l = graph.grid.X(this.tgraph.X(this.xi));
            const _r = graph.grid.X(this.tgraph.X(this.xf));
            const _lo = Math.min(_l, _r), _hi = Math.max(_l, _r);
            const _scy = graph.grid.Y(nameY);
            // Only when the track band is on screen (vertically) and any of it is visible (horizontally).
            if (_scy > -30 && _scy < _ch + 30 && _hi > 0 && _lo < _cw) {
              _wctx.save();
              _wctx.shadowColor = 'transparent'; _wctx.shadowBlur = 0;
              _wctx.font = 'bold 20px "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
              _wctx.textAlign = 'left';
              _wctx.textBaseline = 'middle';
              const _tw = _wctx.measureText(this.name).width;
              // Pin to the left edge of the VISIBLE portion of the track (canvas margin if the
              // track's start is off-screen left), but never let it run past the track's right end.
              let _nx = Math.max(8, _lo);
              _nx = Math.min(_nx, Math.max(8, _hi - _tw - 8));
              _wctx.fillStyle = 'rgba(10,37,64,0.14)';   // faint navy watermark
              _wctx.fillText(this.name, _nx, _scy);
              _wctx.restore();
            }
          }
        } catch (e) { }

        let headerText;

        if (this.chr && this.species) {
          headerText = this.species + " chr" + this.chr + ":" + this.xi + "-" + this.xf + "(" + this.getKB() + "KB) " + this.description;
        } else if (this.chr) {
          headerText = "chr" + this.chr + ":" + this.xi + "-" + this.xf + " " + this.description;
        }

        if (headerText) {
          const textX = this.tgraph.xi;
          const textY = this.tgraph.Y(this.tgraph.ymax);

          ctx.save();
          ctx.font = this.detail_ffont7;
          const m = ctx.measureText(headerText);
          ctx.restore();

          const textHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

          const padX = 10;
          const padY = 6;

          const bgH = textHeight + padY * 2;

          graph.drawString(headerText, textX, textY, GX_T.ink, this.detail_ffont6);
        }

        for (let icon of this.icons) {
          try {
            icon.draw(ctx, this.tgraph, graph);
          } catch (exception) { }
        }

        if (this.showResizeBar) {
          if (!this.description) {
            this.description = "";
          }
          // Selected track: lighten the background a bit more (no border).
          const _sx = graph.X(this.tgraph.xi);
          const _sy = graph.Y(this.tgraph.yi);
          const _sw = graph.screenWidth(this.tgraph.width);
          const _sh = graph.screenHeight(-1 * this.tgraph.height);
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          // Lighter: at 0.28 the wash sat visibly over the base letters and the layers, and
          // it covers the WHOLE track, so on a track with a sequence selected it was the
          // largest thing on screen. It only has to say "this one is selected".
          ctx.fillStyle = 'rgba(224,242,254,0.10)';   // light blue-white wash
          ctx.fillRect(_sx, _sy, _sw, _sh);
          ctx.restore();
        }
        if (this.showOligoMap) {
          for (let o of this.oligos) {
            graph.drawVerticalLineScreen(graph.X(this.tgraph.X(o.xi)), graph.Y(this.tgraph.Y(o.y)), 5, GX_START, 2);
            graph.drawVerticalLineScreen(graph.X(this.tgraph.X(o.xf)), graph.Y(this.tgraph.Y(o.y)), 5, GX_STOP, 2);
          }
        }

        for (let structure of this.structures) {
          if (!structure.pos || structure.pos.length === 0) {
          } else {
            if (this.markstart && this.markend && this.markstart >= 0 && this.markend > 0) {
              if (this.markstart >= this.xi + structure.xi && this.markstart < this.xi + structure.xf) {
                structure.highlightRange(this.markstart - this.xi - structure.xi, this.markend - this.xi - structure.xi);
              } else {
                structure.highlightRange(-1, -1);
              }
            }
            structure.draw(graph, this, this.tgraph.X(structure.xi), this.tgraph.Y(this.tgraph.yi), this.markstart, this.markend);
          }
        }

        try {
          for (let g of this.icons) {
            g.draw(graph, this.tgraph, ctx);
          }
        } catch (exception) { }

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        ctx.font = "14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.color = "black";
      } finally {
        ctx.restore();
      }
    }
  };
  let TrackRef = class TrackRef {
    xi;
    xf;
    track;
    map = [];
    genomeMap = [];
    showMismatches = false;
    name;

    constructor(_track, _xi, _xf) {
      this.xi = _xi;
      this.xf = _xf;
      this.name = _track.name;
      this.track = _track;
    }
  };

  resolve({ Track, TrackRef });
});
