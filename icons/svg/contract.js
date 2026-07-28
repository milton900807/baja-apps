function () {
  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
  <!-- Left arrowhead pointing right -->
  <polygon points="0,24 52,62 0,100" fill="black"/>
  <!-- Right arrowhead pointing left -->
  <polygon points="124,24 72,62 124,100" fill="black"/>
</svg>

`

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;

  return svg;
}
