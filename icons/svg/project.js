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
  <title id="title">Gantt Chart Icon</title>
  <desc id="desc">A stylized mini Gantt chart with grid and task bars</desc>

  <!-- Background -->
  <rect x="0" y="0" width="128" height="96" fill="#ffffff" />

  <!-- Chart area frame -->
  <rect x="16" y="16" width="96" height="64" rx="4" ry="4" fill="#f8f8f8" stroke="#d0d0d0" stroke-width="1" />

  <!-- Vertical grid lines -->
  <line x1="24" y1="20" x2="24" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="36" y1="20" x2="36" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="48" y1="20" x2="48" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="60" y1="20" x2="60" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="72" y1="20" x2="72" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="84" y1="20" x2="84" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="96" y1="20" x2="96" y2="76" stroke="#e0e0e0" stroke-width="1" />
  <line x1="108" y1="20" x2="108" y2="76" stroke="#e0e0e0" stroke-width="1" />

  <!-- Horizontal grid lines -->
  <line x1="20" y1="28" x2="112" y2="28" stroke="#eaeaea" stroke-width="1" />
  <line x1="20" y1="40" x2="112" y2="40" stroke="#eaeaea" stroke-width="1" />
  <line x1="20" y1="52" x2="112" y2="52" stroke="#eaeaea" stroke-width="1" />
  <line x1="20" y1="64" x2="112" y2="64" stroke="#eaeaea" stroke-width="1" />
  <line x1="20" y1="76" x2="112" y2="76" stroke="#eaeaea" stroke-width="1" />

  <!-- Y-axis labels (tasks) -->
  <text x="12" y="30" font-size="6" font-family="Arial, sans-serif" text-anchor="end" fill="#555">T1</text>
  <text x="12" y="42" font-size="6" font-family="Arial, sans-serif" text-anchor="end" fill="#555">T2</text>
  <text x="12" y="54" font-size="6" font-family="Arial, sans-serif" text-anchor="end" fill="#555">T3</text>
  <text x="12" y="66" font-size="6" font-family="Arial, sans-serif" text-anchor="end" fill="#555">T4</text>

  <!-- X-axis ticks / labels -->
  <line x1="24" y1="80" x2="24" y2="84" stroke="#b0b0b0" stroke-width="1" />
  <line x1="48" y1="80" x2="48" y2="84" stroke="#b0b0b0" stroke-width="1" />
  <line x1="72" y1="80" x2="72" y2="84" stroke="#b0b0b0" stroke-width="1" />
  <line x1="96" y1="80" x2="96" y2="84" stroke="#b0b0b0" stroke-width="1" />

  <text x="24" y="92" font-size="6" font-family="Arial, sans-serif" text-anchor="middle" fill="#555">1</text>
  <text x="48" y="92" font-size="6" font-family="Arial, sans-serif" text-anchor="middle" fill="#555">2</text>
  <text x="72" y="92" font-size="6" font-family="Arial, sans-serif" text-anchor="middle" fill="#555">3</text>
  <text x="96" y="92" font-size="6" font-family="Arial, sans-serif" text-anchor="middle" fill="#555">4</text>

  <!-- Gantt task bars -->
  <!-- Task 1 -->
  <rect x="28" y="24" width="40" height="6" rx="3" ry="3" fill="#4c8bf5" />
  <!-- Task 2 -->
  <rect x="40" y="36" width="48" height="6" rx="3" ry="3" fill="#34a853" />
  <!-- Task 3 -->
  <rect x="24" y="48" width="32" height="6" rx="3" ry="3" fill="#fbbc05" />
  <!-- Task 4 -->
  <rect x="56" y="60" width="36" height="6" rx="3" ry="3" fill="#ea4335" />

  <!-- Today marker (vertical line) -->
  <line x1="80" y1="20" x2="80" y2="76" stroke="#ff5555" stroke-width="1.5" stroke-dasharray="2,2" />
</svg>

`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
