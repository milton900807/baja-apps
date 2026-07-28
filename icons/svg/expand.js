function () {
  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
  <!-- Left arrowhead pointing left -->
  <polygon points="52,24 0,62 52,100" fill="black"/>
  <!-- Right arrowhead pointing right -->
  <polygon points="72,24 124,62 72,100" fill="black"/>
</svg>

`

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;

  return svg;
}
