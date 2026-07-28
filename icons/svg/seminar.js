function (titleTxt, descTxt) {

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

  let accent = stringToDarkColor(titleTxt || "Seminar");

  let _svg = `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="128"
    height="96"
    viewBox="0 0 128 96"
    role="img"
    aria-labelledby="title desc"
  >
    <title id="title">Seminar Icon</title>
    <desc id="desc">A speaker presenting slides to an audience</desc>

    <!-- Background -->
    <rect x="0" y="0" width="128" height="96" fill="#ffffff"/>

    <!-- Presentation screen -->
    <rect x="24" y="14" width="80" height="40" rx="4" ry="4"
          fill="#f8f8f8" stroke="#d0d0d0" stroke-width="1"/>
    <rect x="30" y="20" width="32" height="10" rx="2" fill="${accent}"/>
    <rect x="30" y="34" width="48" height="6" rx="2" fill="#c0c0c0"/>

    <!-- Screen stand -->
    <line x1="64" y1="54" x2="64" y2="62" stroke="#999" stroke-width="2"/>
    <rect x="52" y="62" width="24" height="4" rx="2" fill="#999"/>

    <!-- Speaker -->
    <circle cx="88" cy="58" r="4" fill="#666"/>
    <rect x="86" y="62" width="4" height="10" rx="2" fill="#666"/>
    <line x1="88" y1="66" x2="96" y2="60" stroke="#666" stroke-width="2"/>

    <!-- Audience -->
    <circle cx="40" cy="76" r="3" fill="#aaa"/>
    <circle cx="52" cy="76" r="3" fill="#aaa"/>
    <circle cx="64" cy="76" r="3" fill="#aaa"/>
    <circle cx="76" cy="76" r="3" fill="#aaa"/>

    <rect x="36" y="80" width="8" height="4" rx="2" fill="#aaa"/>
    <rect x="48" y="80" width="8" height="4" rx="2" fill="#aaa"/>
    <rect x="60" y="80" width="8" height="4" rx="2" fill="#aaa"/>
    <rect x="72" y="80" width="8" height="4" rx="2" fill="#aaa"/>
  </svg>`;

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  return 'data:image/svg+xml;base64,' + svgData;
}
