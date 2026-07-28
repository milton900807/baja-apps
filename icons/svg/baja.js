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
  let _svg = `<svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Centered Medical Symbol Icon</title>
  <desc id="desc">Minimal centered medical cross inside a circle.</desc>

  <!-- Background circle -->
  <circle cx="80" cy="80" r="55" fill="#0F9BD7"/>

  <!-- Centered medical cross -->
  <path d="
    M70 50
    H90
    V70
    H110
    V90
    H90
    V110
    H70
    V90
    H50
    V70
    H70
    Z"
    fill="#FFFFFF"/>
</svg>

`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
