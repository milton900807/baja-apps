function () {
  // Chromosomes — ideograms at one shared scale, smallest first, banded, with the
  // centromere drawn as a pinch. The same picture the karyotype view draws.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g stroke="#1f2a30" stroke-width="1.5">
    <rect x="9"  y="20" width="10" height="26" rx="5" fill="#ffffff"/>
    <rect x="27" y="14" width="10" height="36" rx="5" fill="#ffffff"/>
    <rect x="45" y="8"  width="10" height="48" rx="5" fill="#ffffff"/>
  </g>
  <g fill="#6b7c84">
    <rect x="9"  y="26" width="10" height="3"/>
    <rect x="9"  y="38" width="10" height="2"/>
    <rect x="27" y="22" width="10" height="3"/>
    <rect x="27" y="40" width="10" height="2"/>
    <rect x="45" y="16" width="10" height="3"/>
    <rect x="45" y="30" width="10" height="2"/>
    <rect x="45" y="46" width="10" height="3"/>
  </g>
  <g fill="#0f6e7a">
    <rect x="9"  y="33" width="10" height="2.4"/>
    <rect x="27" y="31" width="10" height="2.4"/>
    <rect x="45" y="37" width="10" height="2.4"/>
  </g>
</svg>
`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
