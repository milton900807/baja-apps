function () {
  let _svg = `<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" width="49.32766000000001" height="49.32766000000001" viewBox="104.86480000000002 118.08369999999998 49.32766000000001 49.32766000000001" version="1.1" id="svg7063" inkscape:version="1.1.2 (0a00cf5339, 2022-02-04)" sodipodi:docname="message.svg">
  <sodipodi:namedview id="namedview7065" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:pageshadow="2" inkscape:pageopacity="0.0" inkscape:pagecheckerboard="0" inkscape:document-units="mm" showgrid="false" inkscape:zoom="0.60667088" inkscape:cx="396.42582" inkscape:cy="561.25984" inkscape:window-width="1536" inkscape:window-height="939" inkscape:window-x="0" inkscape:window-y="0" inkscape:window-maximized="1" inkscape:current-layer="layer1"/>
  <defs id="defs7060"/>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <path d="M 149.19246,124.36605 H 109.8648 c -3.01625,0 -5.46453,2.44475 -5.46453,5.46453 v 25.68927 c 0,3.01978 2.44828,5.46453 5.46453,5.46453 h 1.16064 v 11.13719 c 0,0.067 0.0741,0.10231 0.127,0.0635 l 14.55913,-11.20069 h 23.48089 c 3.01625,0 5.46453,-2.44475 5.46453,-5.46453 v -25.68927 c 0,-3.01978 -2.44828,-5.46453 -5.46453,-5.46453 z" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path186"/>
    <path d="m 112.58119,132.93502 h 25.71397" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path188"/>
    <path d="m 112.58119,142.67521 h 35.06258" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path190"/>
    <path d="m 112.58119,152.41541 h 35.06258" style="fill:none;stroke:#231f20;stroke-width:1.41111;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:10;stroke-dasharray:none;stroke-opacity:1" id="path192"/>
  </g>
</svg>
`
  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
