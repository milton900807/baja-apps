function () {
  let _svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 124 124">
  <g stroke="black" stroke-width="6" stroke-linecap="round" fill="none">
    <!-- Vertical line -->
    <line x1="62" y1="16" x2="62" y2="108"/>
    <!-- Up arrowhead -->
    <path d="M54 28 L62 16 L70 28"/>
    <!-- Down arrowhead -->
    <path d="M54 96 L62 108 L70 96"/>

    <!-- Horizontal line -->
    <line x1="16" y1="62" x2="108" y2="62"/>
    <!-- Left arrowhead -->
    <path d="M28 54 L16 62 L28 70"/>
    <!-- Right arrowhead -->
    <path d="M96 54 L108 62 L96 70"/>
  </g>
</svg>

`

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;

  return svg;
}
