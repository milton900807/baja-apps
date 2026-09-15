function () {
  // Financial Modeling — a ledger of linked tables with a growth line over it, which is
  // what the table editor produces: assumptions, formulas and the model they drive.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g stroke="#1f2a30" stroke-width="1.4" fill="#ffffff">
    <rect x="9" y="12" width="46" height="40" rx="3"/>
  </g>
  <g stroke="#1f2a30" stroke-width="1.1" opacity="0.55">
    <path d="M9 22 h46"/>
    <path d="M9 32 h46"/>
    <path d="M9 42 h46"/>
    <path d="M24 12 v40"/>
    <path d="M39 12 v40"/>
  </g>
  <rect x="9" y="12" width="46" height="10" rx="3" fill="#0f6e7a" stroke="#1f2a30" stroke-width="1.4"/>
  <path d="M13 47 L22 39 L30 43 L40 30 L51 25" fill="none" stroke="#d9663a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="51" cy="25" r="2.6" fill="#d9663a"/>
</svg>`;
  return _svg;
}
