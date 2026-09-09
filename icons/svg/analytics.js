function () {
  // Analytics — measured data with a fit through it. Bars for the observations, a curve
  // for the model, which is the pairing this workspace is built around.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="none" stroke="#1f2a30" stroke-width="1.6" stroke-linecap="round">
    <path d="M10 52 h48"/>
    <path d="M10 52 v-42"/>
  </g>
  <g stroke="#1f2a30" stroke-width="1.4">
    <rect x="16" y="38" width="8" height="14" fill="#ffffff"/>
    <rect x="28" y="30" width="8" height="22" fill="#0f6e7a"/>
    <rect x="40" y="20" width="8" height="32" fill="#ffffff"/>
  </g>
  <g fill="none" stroke="#a9433f" stroke-width="2" stroke-linecap="round">
    <path d="M14 44 C24 42, 28 26, 38 22 S52 14, 56 13"/>
  </g>
  <circle cx="32" cy="26" r="2.6" fill="#a9433f"/>
</svg>
`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
