function (param) {
  let _svg = `<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" width="10.0" height="10.0" viewBox="132.77122 174.96141 10.0 10.0" version="1.1" id="svg6913" inkscape:version="1.1.2 (0a00cf5339, 2022-02-04)" sodipodi:docname="checklist2.svg">
  <sodipodi:namedview id="namedview6915" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:pageshadow="2" inkscape:pageopacity="0.0" inkscape:pagecheckerboard="0" inkscape:document-units="mm" showgrid="false" inkscape:zoom="0.60667088" inkscape:cx="396.42582" inkscape:cy="561.25984" inkscape:window-width="1536" inkscape:window-height="939" inkscape:window-x="0" inkscape:window-y="0" inkscape:window-maximized="1" inkscape:current-layer="layer1"/>
  <defs id="defs6910"/>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <path d="m 137.77122,179.96141 -20.05541,-18.53142 8.81944,-10.02947 11.39825,9.48972 20.574,-22.4797 9.85308,8.96126 z" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path1202"/>
  </g>
</svg>
`
  let svgTable = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="440" viewBox="0 0 520 440">
  <style>
    .label { font-family: Arial, sans-serif; font-size: 18px; fill: black; }
    .checkbox { stroke: black; fill: white; }
    .checkmark { stroke: green; stroke-width: 2; fill: none; }
  </style>

  <!-- Background -->
  <rect x="0" y="0" width="520" height="440" rx="12" ry="12" fill="#f5f5f5" stroke="#ccc" />

  ${[
      "bajabio Screening Designer",
      "bajabio Analysis",
      "bajabio Project manager",
      "ASO off-target",
      "LJSplice splicing AI models",
      "Secondary structure",
      "All major chemistry supported",
      "Export to IDT codes",
      "Large database of RNASeq",
      "Clinvar",
      "Patented Sequence maps",
      "RNA binding proteins",
      "MicroRNA"
    ].map((label, i) => {
      let y = 40 + i * 30;
      return `
      <!-- Row ${i + 1} -->
      <rect x="20" y="${y}" width="20" height="20" class="checkbox" />
      <path d="M24 ${y + 10} l3 3 l8 -8" class="checkmark" />
      <text x="50" y="${y + 17}" class="label">${label}</text>
    `;
    }).join("")}
</svg>`;

  let svgLicense = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="440" viewBox="0 0 520 440">
  <style>
    .icon { fill: #333; }
    .label { font-family: Arial, sans-serif; font-size: 24px; fill: #333; }
    .ribbon { fill: #4CAF50; }
  </style>

  <!-- Background -->
  <rect x="0" y="0" width="520" height="440" rx="12" ry="12" fill="#f5f5f5" stroke="#ccc" />

  <!-- Certificate icon -->
  <g transform="translate(170, 100)">
    <!-- Outer circle -->
    <circle cx="90" cy="90" r="60" fill="white" stroke="#888" stroke-width="4"/>
    <!-- Check mark -->
    <path d="M75 90 l10 10 l25 -25" stroke="#4CAF50" stroke-width="5" fill="none"/>
    <!-- Ribbon -->
    <polygon class="ribbon" points="80,140 90,160 100,140"/>
    <polygon class="ribbon" points="100,140 110,160 120,140"/>
  </g>

  <!-- Text -->
  <text x="260" y="350" text-anchor="middle" class="label">License</text>
</svg>`;

  let svgDemoButton = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="440" viewBox="0 0 520 440">
  <style>
    .label {
      font-family: Arial, sans-serif;
      font-size: 36px;
      font-weight: bold;
      fill: white;
    }
    .button {
      fill: #4CAF50;
      stroke: #388E3C;
      stroke-width: 6;
      cursor: pointer;
    }
    .button:hover {
      fill: #45a049;
    }
  </style>

  <!-- Full-area button -->
  <rect class="button" x="0" y="0" width="520" height="440" rx="20" ry="20"/>

  <!-- Centered text -->
  <text x="260" y="220" text-anchor="middle" alignment-baseline="middle" class="label">
    Launch Demo
  </text>
</svg>`;

  if (param && param === 'features') {
    _svg = svgTable
  } else if (param && param === 'license') {
    _svg = svgLicense
  } else if (param && param === 'demo') {
    _svg = svgDemoButton;
  }

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
