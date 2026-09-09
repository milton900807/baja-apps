function () {
  // Project — a programme on a timeline. Staggered bars against a time axis, with a
  // milestone marker, which is what this workspace actually produces.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="none" stroke="#1f2a30" stroke-width="1.6" stroke-linecap="round">
    <path d="M8 52 h50"/>
    <path d="M8 52 v-40" opacity="0.35"/>
  </g>
  <g stroke="#1f2a30" stroke-width="1.4">
    <rect x="13" y="16" width="24" height="8" rx="2" fill="#0f6e7a"/>
    <rect x="21" y="28" width="26" height="8" rx="2" fill="#ffffff"/>
    <rect x="31" y="40" width="20" height="8" rx="2" fill="#ffffff"/>
  </g>
  <g fill="#b4761c" stroke="#1f2a30" stroke-width="1.2">
    <path d="M52 16 l4 4 -4 4 -4 -4 z"/>
  </g>
  <g fill="none" stroke="#6b7c84" stroke-width="1" stroke-dasharray="2 3">
    <path d="M21 24 v4 M31 36 v4"/>
  </g>
</svg>
`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
