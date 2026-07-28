function () {


   let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
    <circle cx="52" cy="52" r="34" fill="none" stroke="black" stroke-width="12"/>
    <line x1="76" y1="76" x2="108" y2="108" stroke="black" stroke-width="14" stroke-linecap="round"/>
    <line x1="34" y1="52" x2="70" y2="52" stroke="black" stroke-width="10" stroke-linecap="round"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));

}
