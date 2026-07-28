function (param) {
  let svgTable = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="460" viewBox="0 0 520 460">
  <style>
    .label { font-family: Arial, sans-serif; font-size: 22px; fill: black; }
    .checkbox { stroke: black; fill: white; }
    .checkmark { stroke: green; stroke-width: 2; fill: none; }
    .title { font-family: Arial, sans-serif; font-size: 32px; font-weight: bold; fill: #333; }
  </style>

  <!-- Background -->
  <rect x="0" y="0" width="520" height="460" rx="12" ry="12" fill="#f5f5f5" stroke="#ccc" />

  <!-- Title background with padding -->
  <rect x="100" y="15" width="320" height="60" rx="8" ry="8" fill="white" stroke="#ccc" />
  <text x="260" y="55" text-anchor="middle" class="title">Free-Use Features</text>

  ${[
      "bajabio (limited) Screening Designer",
      "bajabio Analysis",
      "bajabio Project manager",
      "Secondary structure",
      "Large database of RNASeq",
      "Clinvar",
      "Patented Sequence maps",
      "RNA binding proteins",
      "MicroRNA"
    ].map((label, i) => {
      let y = 110 + i * 35; // extra spacing for larger font
      return `
      <!-- Row ${i + 1} -->
      <rect x="20" y="${y}" width="24" height="24" class="checkbox" />
      <path d="M25 ${y + 12} l5 5 l10 -10" class="checkmark" />
      <text x="55" y="${y + 20}" class="label">${label}</text>
    `;
    }).join("")}
</svg>`;

  let svgLicense = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="460" viewBox="0 0 520 460">
  <style>
    .icon { fill: #333; }
    .label { font-family: Arial, sans-serif; font-size: 28px; fill: #333; }
    .ribbon { fill: #4CAF50; }
  </style>

  <!-- Background -->
  <rect x="0" y="0" width="520" height="460" rx="12" ry="12" fill="#f5f5f5" stroke="#ccc" />

  <!-- Certificate icon -->
  <g transform="translate(170, 110)">
    <!-- Outer circle -->
    <circle cx="90" cy="90" r="70" fill="white" stroke="#888" stroke-width="5"/>
    <!-- Check mark -->
    <path d="M75 90 l15 15 l35 -35" stroke="#4CAF50" stroke-width="6" fill="none"/>
    <!-- Ribbon -->
    <polygon class="ribbon" points="80,160 95,185 110,160"/>
    <polygon class="ribbon" points="110,160 125,185 140,160"/>
  </g>

  <!-- Text -->
  <text x="260" y="380" text-anchor="middle" class="label">License</text>
</svg>`;

  let svgSignupButton = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="460" viewBox="0 0 520 460">
  <style>
    .label {
      font-family: Arial, sans-serif;
      font-size: 40px;
      font-weight: bold;
      fill: white;
    }
    .button {
      fill: #2196F3;
      stroke: #1976D2;
      stroke-width: 6;
      cursor: pointer;
    }
    .button:hover {
      fill: #1e88e5;
    }
  </style>

  <!-- Full-area button -->
  <rect class="button" x="0" y="0" width="520" height="460" rx="20" ry="20"/>

  <!-- Centered text -->
  <text x="260" y="230" text-anchor="middle" alignment-baseline="middle" class="label">
    Sign Up
  </text>
</svg>`;

  if (param && param === 'features') {
    _svg = svgTable
  } else if (param && param === 'license') {
    _svg = svgLicense
  } else if (param && param === 'signup') {
    _svg = svgSignupButton;
  }

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
