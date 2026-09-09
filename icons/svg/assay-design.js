function () {
  // Assay Design — the simplified designer: one target, one compound, a decision.
  // Deliberately quieter than the oligo-design glyph, because this is the short path
  // through the same problem rather than the full screening editor.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="none" stroke="#1f2a30" stroke-width="1.7" stroke-linecap="round">
    <path d="M6 22 h52"/>
    <path d="M6 46 h52" opacity="0.3"/>
  </g>
  <rect x="20" y="28" width="26" height="10" rx="2.4" fill="#0f6e7a" stroke="#1f2a30" stroke-width="1.5"/>
  <g fill="none" stroke="#1f2a30" stroke-width="1.4" stroke-linecap="round" opacity="0.8">
    <path d="M24 22 v6 M31 22 v6 M38 22 v6"/>
  </g>
  <g fill="none" stroke="#a9433f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 50 l4 4 8 -9"/>
  </g>
</svg>
`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
