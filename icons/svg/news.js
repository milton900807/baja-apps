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
  let _svg = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="128"
  height="128"
  viewBox="0 0 128 128"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">Newspaper Icon</title>
  <desc id="desc">A stylized newspaper with headline and text columns</desc>

  <!-- Background -->
  <rect x="4" y="20" width="120" height="88" rx="8" ry="8" fill="#e0e0e0" />

  <!-- Left "folded" margin -->
  <rect x="4" y="20" width="20" height="88" rx="8" ry="8" fill="#cfcfcf" />

  <!-- Inner paper -->
  <rect x="16" y="26" width="104" height="76" rx="4" ry="4" fill="#ffffff" />

  <!-- Top header bar -->
  <rect x="20" y="30" width="96" height="14" rx="2" ry="2" fill="#d3d3d3" />

  <!-- "NEWS" headline text -->
  <text
    x="68"
    y="41"
    font-family="Arial, sans-serif"
    font-size="10"
    text-anchor="middle"
    fill="#333333"
    font-weight="bold"
  >
    NEWS
  </text>

  <!-- Left image block -->
  <rect x="22" y="50" width="28" height="22" rx="2" ry="2" fill="#dedede" />
  <!-- Little X to suggest a photo -->
  <line x1="24" y1="52" x2="48" y2="70" stroke="#b0b0b0" stroke-width="1.5" />
  <line x1="48" y1="52" x2="24" y2="70" stroke="#b0b0b0" stroke-width="1.5" />

  <!-- Right headline line -->
  <rect x="54" y="50" width="60" height="4" fill="#444444" rx="2" ry="2" />
  <!-- Right subheadline lines -->
  <rect x="54" y="57" width="46" height="3" fill="#888888" rx="1.5" ry="1.5" />
  <rect x="54" y="63" width="54" height="3" fill="#bbbbbb" rx="1.5" ry="1.5" />

  <!-- Body text lines (columns) -->
  <!-- Column 1 -->
  <rect x="22" y="78" width="38" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
  <rect x="22" y="84" width="34" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
  <rect x="22" y="90" width="36" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
  <rect x="22" y="96" width="32" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />

  <!-- Column 2 -->
  <rect x="64" y="78" width="40" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
  <rect x="64" y="84" width="36" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
  <rect x="64" y="90" width="38" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
  <rect x="64" y="96" width="34" height="3" fill="#c4c4c4" rx="1.5" ry="1.5" />
</svg>
`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
