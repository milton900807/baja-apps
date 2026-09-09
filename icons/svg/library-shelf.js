function () {
  // Library — the reference shelf. Spines on a shelf, one pulled forward, because that
  // is what the shelf is for.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g stroke="#1f2a30" stroke-width="1.5">
    <rect x="10" y="14" width="9"  height="34" rx="1.5" fill="#ffffff"/>
    <rect x="21" y="18" width="9"  height="30" rx="1.5" fill="#0f6e7a"/>
    <rect x="32" y="12" width="9"  height="36" rx="1.5" fill="#ffffff"/>
    <path d="M45 20 l9 3 v28 l-9 -3 z" fill="#b4761c"/>
  </g>
  <g fill="none" stroke="#1f2a30" stroke-width="1.7" stroke-linecap="round">
    <path d="M6 52 h52"/>
  </g>
  <g fill="none" stroke="#1f2a30" stroke-width="1.1" opacity="0.55">
    <path d="M12 20 h5 M12 24 h5 M34 18 h5 M34 22 h5"/>
  </g>
</svg>
`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
