function () {

  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="48" viewBox="0 0 180 48">
    <!-- Background Rounded Button -->
    <rect x="0" y="0" rx="12" ry="12" width="180" height="48" fill="#4CAF50" />

    <!-- Cart Icon -->
    <g transform="translate(12, 12)" fill="white">
      <path d="M2 2h2l3.6 7.59-1.35 2.44C5.52 12.37 6.48 14 8 14h8v-2H8.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 19 2H5.21l-.94-2H0v2h2z"/>
      <circle cx="10.5" cy="16.5" r="1.5"/>
      <circle cx="16.5" cy="16.5" r="1.5"/>
    </g>

    <!-- Text -->
    <text x="48" y="30" fill="white" font-size="16" font-family="Arial, sans-serif">Free Signup</text>
  </svg>`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
