function (select) {

  let svgFinancialModels = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g transform="translate(70,60)" fill="#1a1a1a">
    <rect x="0" y="24" width="6" height="20"/>
    <rect x="8" y="16" width="6" height="28"/>
    <rect x="16" y="8" width="6" height="36"/>
  </g>
  <text x="80" y="120" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    PnL Models
  </text>
</svg>`;

  let svgTimelines = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g transform="translate(70,55)" stroke="#1a1a1a" fill="none" stroke-width="2">
    <circle cx="10" cy="10" r="8"/>
    <line x1="10" y1="10" x2="10" y2="4"/>
    <line x1="10" y1="10" x2="13" y2="13"/>
  </g>
  <text x="80" y="120" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    Gantt Charts
  </text>
</svg>`;

  let svgForStartups = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g transform="translate(70,55)">
    <path d="M10 0 C4 8, 4 24, 10 32 C16 24, 16 8, 10 0 Z" fill="#1a1a1a"/>
    <circle cx="10" cy="10" r="2" fill="#0078ff"/>
    <path d="M10 32 L7 38 L13 38 Z" fill="#1a1a1a"/>
  </g>
  <text x="80" y="120" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    Historical Timelines
  </text>
</svg>`;

  let purchase = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g transform="translate(65,55)" fill="#1a1a1a">
    <path d="M2 2h3l5.6 12-2 3.44C6.52 18.37 7.48 20 9 20h12v-3H9.42c-.14 0-.25-.11-.25-.25l.03-.12 1-2h11.45c.75 0 1.41-.41 1.75-1.03l4.58-8.49A1.003 1.003 0 0 0 27 2H7.21L6 0H0v2h2z"/>
    <circle cx="12.5" cy="22.5" r="2"/>
    <circle cx="20.5" cy="22.5" r="2"/>
  </g>
  <text x="80" y="120" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    Purchase
  </text>
</svg>`;

  let svgFree = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g transform="translate(60,55)">
    <!-- Tag shape -->
    <path d="M10 0 L60 0 L70 10 L70 40 L10 40 Z" fill="#eaf3ff" stroke="#0078ff" stroke-width="2"/>
    <!-- Circle (hole) -->
    <circle cx="15" cy="10" r="3" fill="#0078ff"/>
    <!-- Text inside tag -->
    <text x="40" y="26" fill="#0078ff" font-size="14" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle">
      FREE
    </text>
  </g>
  <text x="80" y="120" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    Free Signup
  </text>
</svg>`;

  let svgAI = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g stroke="#e0e0e0" stroke-width="1">
    <circle cx="40" cy="40" r="2" fill="#e0e0e0"/>
    <circle cx="70" cy="35" r="2" fill="#e0e0e0"/>
    <circle cx="55" cy="80" r="2" fill="#e0e0e0"/>
    <circle cx="85" cy="75" r="2" fill="#e0e0e0"/>
    <circle cx="100" cy="55" r="2" fill="#e0e0e0"/>
    <line x1="40" y1="40" x2="70" y2="35"/>
    <line x1="70" y1="35" x2="100" y2="55"/>
    <line x1="40" y1="40" x2="55" y2="80"/>
    <line x1="55" y1="80" x2="85" y2="75"/>
    <line x1="85" y1="75" x2="100" y2="55"/>
  </g>
  <text x="80" y="120" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    AI Driven Presentations
  </text>
</svg>`;

  let svgDataDriven = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 160 160">
  <rect x="0" y="0" rx="24" ry="24" width="160" height="160" fill="#ffffff"/>
  <g transform="translate(30,34)">
    <rect x="0" y="0" width="100" height="70" rx="6" ry="6" fill="none" stroke="#1a1a1a" stroke-width="2"/>
    <rect x="0" y="0" width="100" height="12" rx="6" ry="6" fill="#f5f5f5" stroke="#1a1a1a" stroke-width="2"/>
    <circle cx="8" cy="6" r="2" fill="#1a1a1a"/>
    <circle cx="16" cy="6" r="2" fill="#1a1a1a"/>
    <circle cx="24" cy="6" r="2" fill="#1a1a1a"/>
    <g transform="translate(10,18)" fill="#1a1a1a">
      <path d="M0 40H60M0 40V5" stroke="#1a1a1a" stroke-width="1.5" fill="none"/>
      <rect x="6"  y="28" width="8" height="12"/>
      <rect x="20" y="22" width="8" height="18"/>
      <rect x="34" y="14" width="8" height="26"/>
      <rect x="48" y="8"  width="8" height="32"/>
      <path d="M6 30 L24 24 L38 16 L52 10" stroke="#0078ff" stroke-width="2" fill="none"/>
      <circle cx="6" cy="30" r="1.8" fill="#0078ff"/>
      <circle cx="24" cy="24" r="1.8" fill="#0078ff"/>
      <circle cx="38" cy="16" r="1.8" fill="#0078ff"/>
      <circle cx="52" cy="10" r="1.8" fill="#0078ff"/>
    </g>
    <g transform="translate(75,18)">
      <rect x="0" y="0" width="15" height="10" fill="none" stroke="#1a1a1a" stroke-width="1"/>
      <rect x="0" y="12" width="15" height="10" fill="none" stroke="#1a1a1a" stroke-width="1"/>
      <rect x="0" y="24" width="15" height="10" fill="#eaf3ff" stroke="#0078ff" stroke-width="1"/>
      <rect x="0" y="36" width="15" height="10" fill="none" stroke="#1a1a1a" stroke-width="1"/>
      <rect x="0" y="48" width="15" height="10" fill="none" stroke="#1a1a1a" stroke-width="1"/>
    </g>
  </g>
  <text x="80" y="128" fill="#1a1a1a" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">
    Data-Driven Plots
  </text>
</svg>`;

  let set__ = svgFinancialModels;

  if (select === 'financial') set__ = svgFinancialModels;
  else if (select === 'startup') set__ = svgForStartups;
  else if (select === 'timelines' || select === 'timeline') set__ = svgTimelines;
  else if (select === 'purchase') set__ = purchase;
  else if (select === 'AI') set__ = svgAI;
  else if (select === 'free') set__ = svgFree;
  else if (
    select === 'data' ||
    select === 'data-driven' ||
    select === 'presentations' ||
    select === 'data-presentations'
  ) set__ = svgDataDriven;

  let svgData = btoa(unescape(encodeURIComponent(set__)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
