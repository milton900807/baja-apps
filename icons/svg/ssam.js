function () {
  // Splice Acceptor Model — an exon block with the intron running into it, and the stems of
  // competing AG sites scored against the annotated acceptor. The picture is the one the app
  // draws: the tall accent stem is the real acceptor, the shorter ones are what it is being
  // compared against, which is the whole point of the tool.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <path d="M6 40 H22" stroke="#1f2a30" stroke-width="1.4" opacity="0.55"/>
  <path d="M46 40 H58" stroke="#1f2a30" stroke-width="1.4" opacity="0.55"/>
  <path d="M22 40 L29 33 L36 40" fill="none" stroke="#1f2a30" stroke-width="1.4" opacity="0.35"/>
  <rect x="24" y="34" width="22" height="12" rx="2" fill="#ffffff" stroke="#1f2a30" stroke-width="1.4"/>
  <g stroke-linecap="round">
    <path d="M24 40 V15" stroke="#C2185B" stroke-width="2.6"/>
    <path d="M30 40 V27" stroke="#1F6FB2" stroke-width="1.8"/>
    <path d="M36 40 V30" stroke="#1F6FB2" stroke-width="1.8"/>
    <path d="M42 40 V35" stroke="#90A4AE" stroke-width="1.8"/>
    <path d="M14 40 V32" stroke="#E07B00" stroke-width="1.8"/>
  </g>
  <circle cx="24" cy="15" r="3" fill="#C2185B"/>
  <path d="M6 48 H58" stroke="#1f2a30" stroke-width="1" opacity="0.25"/>
</svg>`;
  // A data URI, like the other icons here: the app tiles put it in an <img src>, and the
  // raw markup there was refused as an unknown URL scheme.
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
