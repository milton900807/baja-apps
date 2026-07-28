function (titleTxt, descTxt) {

  let size = 300;
  function stringToDarkColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      let value = (hash >> (i * 8)) & 0xFF;
      value = Math.floor(value * 0.5);
      color += value.toString(16).padStart(2, '0');
    }
    return color;
  }

let bgColor = stringToDarkColor(titleTxt);
let _svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- White Border -->
  <rect x="5" y="5" rx="12" ry="12" width="${size - 10}" height="${size - 10}"
        fill="none" stroke="white" stroke-width="10" />

  <!-- Background Rounded Button -->
  <rect x="0" y="0" rx="12" ry="12" width="${size}" height="${size}" fill="${bgColor}" />

  <!-- Title -->
  <text x="50%" y="${size * 0.45}" fill="white" font-size="${size * 0.12}" font-family="Arial, sans-serif" text-anchor="middle">${titleTxt}</text>

  <!-- Description -->
  <text x="50%" y="${size * 0.65}" fill="white" font-size="${size * 0.06}" font-family="Arial, sans-serif" text-anchor="middle">${descTxt}</text>
</svg>`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
