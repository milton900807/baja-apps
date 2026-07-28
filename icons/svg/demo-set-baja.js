function (select) {

let svgDNA = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <rect x="0" y="0" rx="12" ry="12" width="160" height="48" fill="#000000ff" />

  <!-- DNA Double Helix Icon -->
  <g transform="translate(14, 10)" stroke="white" stroke-width="1.5" fill="none">
    <path d="M0,0 C6,4 6,12 0,16" />
    <path d="M6,0 C0,4 0,12 6,16" />
    <line x1="1" y1="2" x2="5" y2="2" />
    <line x1="1" y1="6" x2="5" y2="6" />
    <line x1="1" y1="10" x2="5" y2="10" />
    <line x1="1" y1="14" x2="5" y2="14" />
  </g>

  <text x="48" y="30" fill="white" font-size="16" font-family="Arial, sans-serif">RNase H</text>
</svg>`;

let medicalModels = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <rect x="0" y="0" rx="12" ry="12" width="160" height="48" fill="#000000ff" />

  <!-- Medical Cross Icon -->
  <g transform="translate(14, 10)" fill="white">
    <rect x="6" y="0" width="4" height="16" />
    <rect x="0" y="6" width="16" height="4" />
  </g>

  <text x="48" y="30" fill="white" font-size="16" font-family="Arial, sans-serif">Splicing</text>
</svg>`;

let bigData = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <rect x="0" y="0" rx="12" ry="12" width="160" height="48" fill="#000000ff" />

  <!-- Big Data / Database Icon -->
  <g transform="translate(14, 8)" fill="white">
    <ellipse cx="8" cy="2" rx="8" ry="2" />
    <rect x="0" y="2" width="16" height="4" />
    <ellipse cx="8" cy="6" rx="8" ry="2" />
    <rect x="0" y="6" width="16" height="4" />
    <ellipse cx="8" cy="10" rx="8" ry="2" />
  </g>

  <text x="48" y="30" fill="white" font-size="16" font-family="Arial, sans-serif">Big Data</text>
</svg>`;

let default_t = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <rect x="0" y="0" rx="12" ry="12" width="160" height="48" fill="#000000ff" />

  <!-- Centered DNA Icon -->
  <g transform="translate(72, 10)" stroke="white" stroke-width="1.5" fill="none">
    <path d="M0,0 C6,4 6,12 0,16" />
    <path d="M6,0 C0,4 0,12 6,16" />
    <line x1="1" y1="2" x2="5" y2="2" />
    <line x1="1" y1="6" x2="5" y2="6" />
    <line x1="1" y1="10" x2="5" y2="10" />
    <line x1="1" y1="14" x2="5" y2="14" />
  </g>

  <!-- Centered Text -->
  <text x="80" y="40" fill="white" font-size="10" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle">
    ${select}
  </text>
</svg>`;

  let set__ = svgDNA;
  if (select === 'RNase H') {
    set__ = svgDNA;
  } else if (select === 'splicing') {
    set__ = medicalModels;
  } else if (select === 'timelines') {
    set__ = bigData;
  } else if (select === 'bigData') {
    set__ = bigData;
  } else {
    set__ = default_t
  }

  let svgData = btoa(unescape(encodeURIComponent(set__)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
