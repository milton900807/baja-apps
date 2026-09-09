function () {
  // mRNA Design — a transcript, drawn 5' to 3' as the parts a designer actually sets.
  //
  // Cap, 5' untranslated region, the coding sequence as the solid block, 3' untranslated
  // region, poly(A) tail. The order and the relative weights ARE the design, so the icon
  // draws the anatomy rather than a generic strand.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="9" cy="32" r="4.6" fill="#b4761c" stroke="#1f2a30" stroke-width="1.5"/>
  <rect x="15" y="29" width="9" height="6" rx="1.5" fill="#ffffff" stroke="#1f2a30" stroke-width="1.4"/>
  <rect x="24" y="24" width="21" height="16" rx="2.4" fill="#0f6e7a" stroke="#1f2a30" stroke-width="1.5"/>
  <rect x="45" y="29" width="7" height="6" rx="1.5" fill="#ffffff" stroke="#1f2a30" stroke-width="1.4"/>
  <g stroke="#1f2a30" stroke-width="1.7" stroke-linecap="round">
    <path d="M54 32 h1.5 M58 32 h1.5"/>
  </g>
</svg>
`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
