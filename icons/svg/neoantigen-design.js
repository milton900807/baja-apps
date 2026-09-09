function () {
  // Neoantigen Design — a peptide held in an MHC groove, read by a T-cell receptor.
  //
  // Three elements, because all three have to be true for a neoantigen to work:
  // the groove (the patient's allele), the peptide sitting in it with one residue
  // marked as the mutated one, and the receptor above that has to see it.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="none" stroke="#1f2a30" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 56 V40 C10 32, 16 28, 22 28"/>
    <path d="M54 56 V40 C54 32, 48 28, 42 28"/>
    <path d="M14 44 h36"/>
  </g>
  <g stroke="#1f2a30" stroke-width="1.4">
    <circle cx="21" cy="36" r="3.1" fill="#ffffff"/>
    <circle cx="28.5" cy="36" r="3.1" fill="#ffffff"/>
    <circle cx="36" cy="36" r="3.1" fill="#a9433f"/>
    <circle cx="43.5" cy="36" r="3.1" fill="#ffffff"/>
  </g>
  <g fill="none" stroke="#0f6e7a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 22 V14"/>
    <path d="M32 14 L25 7"/>
    <path d="M32 14 L39 7"/>
  </g>
  <circle cx="32" cy="24" r="2.2" fill="#0f6e7a"/>
</svg>
`;
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  return 'data:image/svg+xml;base64,' + svgData;
}
