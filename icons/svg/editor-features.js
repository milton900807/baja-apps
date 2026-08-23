function (select) {
  // Tropical 16:9 feature cards for the login/splash carousel, each representing a
  // capability of the manchester genome editor (app/manchester/editor.js). Returns a
  // data:image/svg+xml URL keyed by feature name.
  //
  // NOTE: solid fills only (no <defs>/gradient url() refs) so the cards render reliably
  // when loaded via <img src="data:...">, and a clearly-tropical (non-black) background.
  // Also avoid bare top-level names like `set`/`data` — lionscript prepends a shared
  // prelude into the same scope.
  const W = 640, H = 360;

  const BG_TOP = '#0f4a52', BG_BOT = '#0a343c', PANEL = '#0e3a42';
  const TEAL = '#19d0d0', CYAN = '#2bb6f0', GREEN = '#22d187', ORANGE = '#ff9a3c',
        CORAL = '#ff6b81', INK = '#f2fbfd', MUTE = '#a9cbd6', DARK = '#062430';

  // full-card wrapper: art group is drawn in a 560x190 area at (40,44)
  const card = (title, sub, art) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG_BOT}"/>
    <rect width="${W}" height="200" fill="${BG_TOP}"/>
    <rect x="0" y="0"   width="${W/3}" height="6" fill="${GREEN}"/>
    <rect x="${W/3}" y="0" width="${W/3}" height="6" fill="${TEAL}"/>
    <rect x="${2*W/3}" y="0" width="${W/3}" height="6" fill="${ORANGE}"/>
    <g transform="translate(40,44)">${art}</g>
    <text x="40" y="300" fill="${INK}" font-family="Segoe UI, system-ui, Arial, sans-serif" font-size="29" font-weight="700">${title}</text>
    <text x="40" y="330" fill="${MUTE}" font-family="Segoe UI, system-ui, Arial, sans-serif" font-size="16">${sub}</text>
  </svg>`;

  const exonRow = (y, color) => `
    <line x1="0" y1="${y}" x2="560" y2="${y}" stroke="${MUTE}" stroke-width="3"/>
    <rect x="20"  y="${y-13}" width="90"  height="26" rx="5" fill="${color}"/>
    <rect x="150" y="${y-13}" width="130" height="26" rx="5" fill="${color}"/>
    <rect x="330" y="${y-13}" width="80"  height="26" rx="5" fill="${color}"/>
    <rect x="450" y="${y-13}" width="100" height="26" rx="5" fill="${color}"/>`;

  const features = {
    'genomics-mutations': card('Visualize genomics with mutations',
      'SNPs, indels and variants in genomic context',
      `${exonRow(95, TEAL)}
       <line x1="70"  y1="82" x2="70"  y2="40" stroke="${ORANGE}" stroke-width="3"/><circle cx="70"  cy="34" r="9" fill="${ORANGE}"/>
       <line x1="205" y1="82" x2="205" y2="28" stroke="${CORAL}"  stroke-width="3"/><circle cx="205" cy="22" r="9" fill="${CORAL}"/>
       <line x1="370" y1="82" x2="370" y2="46" stroke="${GREEN}"  stroke-width="3"/><circle cx="370" cy="40" r="9" fill="${GREEN}"/>
       <line x1="500" y1="82" x2="500" y2="36" stroke="${ORANGE}" stroke-width="3"/><circle cx="500" cy="30" r="9" fill="${ORANGE}"/>`),

    'sirna': card('Design siRNA and duplexes',
      "Sense / antisense with 3' overhangs",
      `<rect x="30"  y="70"  width="470" height="14" rx="7" fill="${CYAN}"/>
       <rect x="60"  y="100" width="470" height="14" rx="7" fill="${GREEN}"/>
       <g stroke="${INK}" stroke-width="2" opacity="0.7">
         ${Array.from({length: 18}, (_, i) => `<line x1="${70 + i*25}" y1="84" x2="${70 + i*25}" y2="100"/>`).join('')}
       </g>`),

    'offtargets': card('Run off-target analysis',
      'Levenshtein search across the transcriptome',
      `<circle cx="130" cy="95" r="58" fill="none" stroke="${TEAL}" stroke-width="3"/>
       <circle cx="130" cy="95" r="36" fill="none" stroke="${TEAL}" stroke-width="3"/>
       <circle cx="130" cy="95" r="13" fill="${GREEN}"/>
       <g fill="${ORANGE}">
         <circle cx="300" cy="45" r="6"/><circle cx="360" cy="80" r="6"/><circle cx="330" cy="120" r="6"/>
         <circle cx="420" cy="55" r="6"/><circle cx="470" cy="100" r="6"/><circle cx="400" cy="140" r="6"/>
         <circle cx="520" cy="70" r="6"/><circle cx="290" cy="150" r="6"/>
       </g>
       <line x1="205" y1="95" x2="270" y2="95" stroke="${MUTE}" stroke-width="2" stroke-dasharray="4 4"/>`),

    'primers': card('Design qPCR primers and probes',
      'Amplicons scored by assay success',
      `<line x1="10" y1="95" x2="550" y2="95" stroke="${MUTE}" stroke-width="3"/>
       <rect x="70"  y="88" width="130" height="14" rx="7" fill="${GREEN}"/><polygon points="200,88 220,95 200,102" fill="${GREEN}"/>
       <rect x="360" y="88" width="130" height="14" rx="7" fill="${CYAN}"/><polygon points="360,88 340,95 360,102" fill="${CYAN}"/>
       <rect x="245" y="70" width="70" height="12" rx="6" fill="${ORANGE}"/>
       <text x="280" y="62" fill="${ORANGE}" font-family="Arial" font-size="13" text-anchor="middle">probe</text>`),

    'splicing': card('Predict splicing (sashimi)',
      'PSI and site-strength deep-learning models',
      `${exonRow(140, TEAL)}
       <path d="M65 127 C 140 30, 205 30, 215 127" fill="none" stroke="${ORANGE}" stroke-width="4"/>
       <path d="M215 127 C 300 60, 350 60, 370 127" fill="none" stroke="${GREEN}" stroke-width="3"/>
       <path d="M65 127 C 250 -10, 450 -10, 500 127" fill="none" stroke="${CYAN}" stroke-width="3" opacity="0.85"/>`),

    'rbp': card('RNA-binding protein sites',
      'Predicted binding across the transcript',
      `<path d="M0 120 Q 40 90 80 120 T 160 120 T 240 120 T 320 120 T 400 120 T 480 120 T 560 120" fill="none" stroke="${CYAN}" stroke-width="4"/>
       <ellipse cx="250" cy="80" rx="52" ry="40" fill="${ORANGE}"/>
       <text x="250" y="86" fill="${DARK}" font-family="Arial" font-size="18" font-weight="700" text-anchor="middle">RBP</text>
       <g fill="${GREEN}"><circle cx="120" cy="120" r="6"/><circle cx="380" cy="120" r="6"/><circle cx="470" cy="120" r="6"/></g>`),

    'rnaseq': card('RNA-seq and IP data layers',
      'Coverage wiggles and peak tracks',
      `<path d="M0 150 L0 110 L40 96 L80 130 L120 60 L160 100 L200 50 L240 118 L280 80 L320 130 L360 70 L400 120 L440 90 L480 140 L520 100 L560 150 Z" fill="${TEAL}" fill-opacity="0.45" stroke="${TEAL}" stroke-width="2"/>
       <line x1="0" y1="150" x2="560" y2="150" stroke="${MUTE}" stroke-width="2"/>`),

    'mrna': card('Create mRNA transcripts',
      'Collapse exons into a spliced transcript',
      `<line x1="0" y1="45" x2="560" y2="45" stroke="${MUTE}" stroke-width="2"/>
       <rect x="20" y="34" width="90" height="22" rx="4" fill="${TEAL}"/><rect x="180" y="34" width="120" height="22" rx="4" fill="${TEAL}"/><rect x="380" y="34" width="90" height="22" rx="4" fill="${TEAL}"/>
       <polygon points="270,74 290,74 280,90" fill="${ORANGE}"/>
       <rect x="120" y="120" width="320" height="26" rx="6" fill="${GREEN}"/>
       <text x="280" y="138" fill="${DARK}" font-family="Arial" font-size="14" font-weight="700" text-anchor="middle">mRNA</text>`),

    'structure': card('RNA secondary structure',
      'Fold and design on stem-loops',
      `<path d="M40 150 L40 70 Q40 30 90 30 L200 30 Q250 30 250 70 L250 150" fill="none" stroke="${CYAN}" stroke-width="5"/>
       <path d="M70 150 L70 78 Q70 52 100 52 L190 52 Q220 52 220 78 L220 150" fill="none" stroke="${GREEN}" stroke-width="4"/>
       <g stroke="${INK}" stroke-width="2" opacity="0.65">
         <line x1="40" y1="90" x2="70" y2="90"/><line x1="40" y1="110" x2="70" y2="110"/><line x1="40" y1="130" x2="70" y2="130"/>
         <line x1="220" y1="90" x2="250" y2="90"/><line x1="220" y1="110" x2="250" y2="110"/><line x1="220" y1="130" x2="250" y2="130"/>
       </g>
       <circle cx="145" cy="40" r="7" fill="${ORANGE}"/>`),

    'aso': card('Design ASO and gapmers',
      'Chemistry-aware oligo patterning',
      `<rect x="30"  y="82" width="150" height="26" rx="8" fill="${ORANGE}"/>
       <rect x="185" y="82" width="190" height="26" rx="8" fill="${TEAL}"/>
       <rect x="380" y="82" width="150" height="26" rx="8" fill="${ORANGE}"/>
       <text x="105" y="130" fill="${MUTE}" font-family="Arial" font-size="13" text-anchor="middle">wing</text>
       <text x="280" y="130" fill="${MUTE}" font-family="Arial" font-size="13" text-anchor="middle">DNA gap</text>
       <text x="455" y="130" fill="${MUTE}" font-family="Arial" font-size="13" text-anchor="middle">wing</text>`),

    'patents': card('Map patents and IP',
      'Overlay patent claims on the sequence',
      `${exonRow(150, TEAL)}
       <rect x="200" y="20" width="160" height="90" rx="8" fill="${PANEL}" stroke="${CYAN}" stroke-width="2"/>
       <g stroke="${MUTE}" stroke-width="3"><line x1="220" y1="42" x2="340" y2="42"/><line x1="220" y1="58" x2="340" y2="58"/><line x1="220" y1="74" x2="300" y2="74"/></g>
       <path d="M400 22 l30 8 v22 c0 20 -15 30 -30 36 c-15 -6 -30 -16 -30 -36 v-22 z" fill="${ORANGE}"/>
       <path d="M392 52 l8 8 l16 -18" fill="none" stroke="${DARK}" stroke-width="3"/>`),

    'tracks': card('Multi-track genome browser',
      'Stacked, editable tracks with live sync',
      `${[0,1,2].map((i) => `<g transform="translate(0,${i*52})">
          <rect x="0" y="20" width="560" height="30" rx="6" fill="${[TEAL,GREEN,CYAN][i]}"/>
          <g stroke="${DARK}" stroke-width="2" opacity="0.5">${Array.from({length:11},(_,k) => `<line x1="${20+k*52}" y1="20" x2="${20+k*52}" y2="50"/>`).join('')}</g>
        </g>`).join('')}`),
  };

  // NB: not a bare `set`/`data` variable (shared prelude scope).
  const svgMarkup = features[select] || features['genomics-mutations'];
  const svgData = btoa(unescape(encodeURIComponent(svgMarkup)));
  return 'data:image/svg+xml;base64,' + svgData;
}
