function () {
  // Oligo Design — a gapmer duplexed to its target.
  //
  // The icon draws the thing that makes the modality what it is: two modified
  // wings that supply affinity but cannot be cut, and a DNA gap in the middle
  // that is the only region RNase H will act on. Filled beads are the wings,
  // hollow beads the gap. Drawn as line art at a 64-unit box so it stays legible
  // at toolbar size.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="none" stroke="#1f2a30" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 20 C14 14, 22 26, 30 20 C38 14, 46 26, 58 20"/>
    <path d="M6 44 C14 38, 22 50, 30 44 C38 38, 46 50, 58 44" opacity="0.35"/>
  </g>
  <g stroke="#1f2a30" stroke-width="1.5">
    <circle cx="12" cy="32" r="3.6" fill="#0f6e7a"/>
    <circle cx="21" cy="32" r="3.6" fill="#0f6e7a"/>
    <circle cx="30" cy="32" r="3.6" fill="#ffffff"/>
    <circle cx="39" cy="32" r="3.6" fill="#ffffff"/>
    <circle cx="48" cy="32" r="3.6" fill="#0f6e7a"/>
    <circle cx="57" cy="32" r="3.6" fill="#0f6e7a"/>
  </g>
  <g stroke="#1f2a30" stroke-width="1.4" stroke-linecap="round">
    <path d="M15.6 32 h1.8 M24.6 32 h1.8 M33.6 32 h1.8 M42.6 32 h1.8 M51.6 32 h1.8"/>
  </g>
</svg>
`;
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  return 'data:image/svg+xml;base64,' + svgData;
}
