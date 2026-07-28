function () {

  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
    <polygon points="62,106 24,54 50,54 50,18 74,18 74,54 100,54" fill="black"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));

}
