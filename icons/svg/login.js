function () {
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">
  <!-- Background Rounded Button -->
  <rect x="0" y="0" rx="12" ry="12" width="160" height="48" fill="#2196F3" />

  <!-- Login Icon: Door with Arrow -->
  <g transform="translate(12, 12)" fill="white">
    <!-- Door -->
    <rect x="0" y="0" width="12" height="16" rx="2" ry="2" fill="white" opacity="0.9"/>
    <circle cx="3" cy="8" r="1.2" fill="#2196F3"/>

    <!-- Arrow pointing right -->
    <path d="M14 4l4 4-4 4M13 8h5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Text -->
  <text x="48" y="30" fill="white" font-size="16" font-family="Arial, sans-serif">Login</text>
</svg>

`
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
