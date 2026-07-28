function () {
  let _svg = `

  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
  <!-- Outer black box -->
  <rect x="0" y="0" width="124" height="124" fill="black" rx="4" ry="4"/>

  <!-- Inner white box -->
  <rect x="12" y="12" width="100" height="100" fill="white" rx="2" ry="2"/>
</svg>

`

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;

  return svg;
}
