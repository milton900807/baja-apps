function () {
  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
    <polygon points="62,18 24,70 50,70 50,106 74,106 74,70 100,70" fill="black"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));
}
