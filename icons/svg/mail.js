function () {
  let _svg = `<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" width="58.983194999999995" height="58.983194999999995" viewBox="62.966555 107.4511275 58.983194999999995 58.983194999999995" version="1.1" id="svg2426" inkscape:version="1.1.2 (0a00cf5339, 2022-02-04)" sodipodi:docname="mail.svg">
  <sodipodi:namedview id="namedview2428" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:pageshadow="2" inkscape:pageopacity="0.0" inkscape:pagecheckerboard="0" inkscape:document-units="mm" showgrid="false" inkscape:zoom="0.60667088" inkscape:cx="396.42582" inkscape:cy="561.25984" inkscape:window-width="1536" inkscape:window-height="939" inkscape:window-x="0" inkscape:window-y="0" inkscape:window-maximized="1" inkscape:current-layer="layer1"/>
  <defs id="defs2423"/>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <path d="M 116.94975,155.42828 H 67.966555 v -36.97111 h 48.983195 z" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path298"/>
    <path d="M 67.966555,118.45717 92.459916,142.8447 116.94975,118.45717" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path300"/>
    <path d="M 67.966555,155.42828 86.533249,136.94273" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path302"/>
    <path d="M 116.94975,155.42828 98.383055,136.94273" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path304"/>
  </g>
</svg>
`
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
