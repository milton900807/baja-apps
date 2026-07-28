function () {

  function therapeuticsAnalysisSVG({
    size = 128,
    dnaColorFrom = "#2EC4B6",
    dnaColorTo = "#0F7DBF",
    barColor = "#0F7DBF",
    strokeColor = "#0F172A",
    showBadge = true
  } = {}) {
    return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" role="img" aria-labelledby="taTitle taDesc">
    <title id="taTitle">Therapeutics Analysis Icon</title>
    <desc id="taDesc">DNA double helix with bar chart under a magnifying glass.</desc>

    <defs>
      <linearGradient id="TAaccent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${dnaColorFrom}"/>
        <stop offset="1" stop-color="${dnaColorTo}"/>
      </linearGradient>
      <clipPath id="TAglass">
        <circle cx="94" cy="66" r="22"/>
      </clipPath>
    </defs>

    ${showBadge ? `<rect x="6" y="6" width="116" height="116" rx="16" fill="#0A0F1C" opacity="0.06"/>` : ""}

    <g fill="none" stroke="url(#TAaccent)" stroke-width="3" stroke-linecap="round">
      <path d="M32 20 C 44 32, 44 48, 32 60 C 20 72, 20 88, 32 100" />
      <path d="M44 20 C 32 32, 32 48, 44 60 C 56 72, 56 88, 44 100" />
      <path d="M32 28 L44 28" />
      <path d="M32 40 L44 40" />
      <path d="M32 52 L44 52" />
      <path d="M32 64 L44 64" />
      <path d="M32 76 L44 76" />
      <path d="M32 88 L44 88" />
    </g>

    <g fill="${barColor}">
      <rect x="76" y="84" width="10" height="20" rx="2"/>
      <rect x="90" y="74" width="10" height="30" rx="2"/>
      <rect x="104" y="60" width="10" height="44" rx="2"/>
    </g>

    <g fill="none" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round">
      <circle cx="94" cy="66" r="22" />
      <path d="M108 80 L120 92" />
    </g>

    <g clip-path="url(#TAglass)">
      <g fill="url(#TAaccent)">
        <rect x="76" y="84" width="10" height="20" rx="2"/>
        <rect x="90" y="74" width="10" height="30" rx="2"/>
        <rect x="104" y="60" width="10" height="44" rx="2"/>
      </g>
      <circle cx="94" cy="66" r="22" fill="#ffffff" opacity="0.08"/>
    </g>
  </svg>`;
  }

  let _svg = therapeuticsAnalysisSVG()

  let svgData = btoa(unescape(encodeURIComponent(_svg)));
  let svg = 'data:image/svg+xml;base64,' + svgData;
  return svg;
}
