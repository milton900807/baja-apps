function () {
  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
    <polygon points="106,62 54,24 54,50 18,50 18,74 54,74 54,100" fill="black"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
