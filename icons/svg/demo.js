function () {
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <!-- Background Rounded Button -->
  <rect x="0" y="0" rx="12" ry="12" width="160" height="48" fill="#FF9800" />
  <g transform="translate(12, 12)">
    <circle cx="12" cy="12" r="10" fill="white" />
    <polygon points="10,8 16,12 10,16" fill="#FF9800" />
  </g>
  <text x="48" y="30" fill="white" font-size="16" font-family="Arial, sans-serif">Demo</text>
</svg>
`
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
