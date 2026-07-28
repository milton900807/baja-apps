function (titleTxt, descTxt) {

  let size = 300;
  function stringToDarkColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      let value = (hash >> (i * 8)) & 0xFF;
      value = Math.floor(value * 0.5);
      color += value.toString(16).padStart(2, '0');
    }
    return color;
  }

  let bgColor = stringToDarkColor(titleTxt);
  let _svg = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="128"
  height="96"
  viewBox="0 0 128 96"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">Bar Chart Icon</title>
  <desc id="desc">A stylized bar chart with axes and colored bars</desc>

  <!-- Background -->
  <rect x="0" y="0" width="128" height="96" fill="#ffffff" />

  <!-- Axes -->
  <line x1="20" y1="12" x2="20" y2="80" stroke="#444" stroke-width="2" />
  <line x1="20" y1="80" x2="120" y2="80" stroke="#444" stroke-width="2" />

  <!-- Gridlines -->
  <line x1="20" y1="60" x2="120" y2="60" stroke="#e0e0e0" stroke-width="1" />
  <line x1="20" y1="40" x2="120" y2="40" stroke="#e0e0e0" stroke-width="1" />
  <line x1="20" y1="20" x2="120" y2="20" stroke="#e0e0e0" stroke-width="1" />

  <!-- Y-axis labels -->
  <text x="16" y="82" font-size="6" text-anchor="end" fill="#666">0</text>
  <text x="16" y="62" font-size="6" text-anchor="end" fill="#666">20</text>
  <text x="16" y="42" font-size="6" text-anchor="end" fill="#666">40</text>
  <text x="16" y="22" font-size="6" text-anchor="end" fill="#666">60</text>

  <!-- Bars -->
  <!-- Bar 1 -->
  <rect x="30" y="50" width="18" height="30" rx="3" ry="3" fill="#4c8bf5" />
  <!-- Bar 2 -->
  <rect x="56" y="30" width="18" height="50" rx="3" ry="3" fill="#34a853" />
  <!-- Bar 3 -->
  <rect x="82" y="20" width="18" height="60" rx="3" ry="3" fill="#fbbc05" />
  <!-- Bar 4 -->
  <rect x="108" y="45" width="18" height="35" rx="3" ry="3" fill="#ea4335" />

  <!-- X-axis labels -->
  <text x="39" y="90" font-size="6" text-anchor="middle" fill="#666">A</text>
  <text x="65" y="90" font-size="6" text-anchor="middle" fill="#666">B</text>
  <text x="91" y="90" font-size="6" text-anchor="middle" fill="#666">C</text>
  <text x="117" y="90" font-size="6" text-anchor="middle" fill="#666">D</text>
</svg>

`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
