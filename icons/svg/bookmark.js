function () {

  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
    <path d="M34 16 H90 C94 16 98 20 98 24 V108 L62 84 L26 108 V24 C26 20 30 16 34 16 Z" fill="black"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(_svg)));

}
