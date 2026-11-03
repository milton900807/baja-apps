function () {
  // Fundraising — a donation thermometer: the tube filled to where the campaign has got to,
  // the goal marked at the top, and the coin that moves it. The thermometer is the picture
  // every fundraiser already draws on a whiteboard, which is why it is the one here.
  let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g stroke="#1f2a30" stroke-width="1.1" opacity="0.55">
    <path d="M30 17 h9"/>
    <path d="M30 26 h6"/>
    <path d="M30 35 h6"/>
    <path d="M30 44 h6"/>
  </g>
  <path d="M19 44 V17 a5 5 0 0 1 10 0 V44" fill="#ffffff" stroke="#1f2a30" stroke-width="1.4"/>
  <circle cx="24" cy="48" r="7.5" fill="#ffffff" stroke="#1f2a30" stroke-width="1.4"/>
  <circle cx="24" cy="48" r="4.6" fill="#0f6e7a"/>
  <path d="M21.6 44 V31 h4.8 V44" fill="#0f6e7a"/>
  <path d="M30 14 h12" stroke="#d9663a" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="47" cy="30" r="9" fill="#ffffff" stroke="#d9663a" stroke-width="2.2"/>
  <text x="47" y="34.6" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" fill="#d9663a">$</text>
</svg>`;
  // A data URI, like the other icons here: the app tiles put it in an <img src>, and the
  // raw markup there was refused as an unknown URL scheme.
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
