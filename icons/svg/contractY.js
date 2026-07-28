function () {
  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
  <!-- Top arrowhead pointing down -->
  <polygon points="24,0 62,52 100,0" fill="black"/>
  <!-- Bottom arrowhead pointing up -->
  <polygon points="24,124 62,72 100,124" fill="black"/>
</svg>

`

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;

  return svg;
}
