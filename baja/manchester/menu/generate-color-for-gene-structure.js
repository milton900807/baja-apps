function generateColor(value) {

    var hue = value * 120;

    var rgb = hslToRgb(hue / 360, 1, 0.5);

    var redHex = rgb[0].toString(16).padStart(2, '0');
    var greenHex = rgb[1].toString(16).padStart(2, '0');
    var blueHex = rgb[2].toString(16).padStart(2, '0');

    return '#' + redHex + greenHex + blueHex;
  }

  function hslToRgb(h, s, l) {
    var r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }

      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;

      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return [
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255)
    ];
  }

  var value = 0.75;
  var color = generateColor(value);
  console.log(color);
