const CANON = [
  "Well",
  "Well Position",
  "Sample",
  "Quantity",
  "Target",
  "Dye",
  "Task",
  "Reporter",
  "Quencher",
  "Amp Status",
  "Cq",
  "Cq Mean",
  "Cq Confidence",
  "Cq SD",
  "Quantity Mean",
  "Quantity SD",
  "Auto Threshold",
  "Threshold",
  "Auto Baseline",
  "Baseline Start",
  "Baseline End",
  "Tm1",
  "Tm2",
  "Tm3",
  "Tm4",
  "Y-Intercept",
  "R2",
  "Slope",
  "Efficiency",
  "Standard Deviation",
  "Standard Error",
  "Omit"
];

const HEADER_PATTERNS = {
  "Well": [
    /\bwell\b/i,
    /\bwell\s*#\b/i,
    /^\s*well\s*index\s*$/i
  ],
  "Well Position": [
    /\bwell\s*position\b/i,
    /^\s*position\s*$/i,
    /^[A-P]\d{1,2}$/i
  ],
  "Sample": [/\bsample\b/i, /\bsample\s*name\b/i],
  "Quantity": [/\bquantity\b/i, /\bqty\b/i],
  "Target": [/\btarget\b/i, /\bgene\b/i, /\bamplicon\b/i],
  "Dye": [/\bdye\b/i, /\bchannel\b/i, /\bcolor\b/i],
  "Task": [/\btask\b/i, /\brole\b/i],
  "Reporter": [/\breporter\b/i],
  "Quencher": [/\bquencher\b/i],
  "Amp Status": [
    /\bamp\s*status\b/i,
    /\bamplification\s*status\b/i,
    /\bamp\b/i
  ],

  "Cq": [/\bc[qt]\b/i, /\bc[qt]\s*value\b/i],
  "Cq Mean": [/\bc[qt].*mean\b/i, /\bmean\s*c[qt]\b/i, /\bc[qt]\s*\(mean\)/i],
  "Cq Confidence": [/\bc[qt].*conf/i, /\bconfidence\b/i],
  "Cq SD": [/\bc[qt].*sd\b/i, /\bsd\b/i, /\bstd\s*dev\b/i],
  "Quantity Mean": [/\bquantity.*mean\b/i, /\bmean.*quantity\b/i],
  "Quantity SD": [/\bquantity.*sd\b/i, /\bsd.*quantity\b/i],
  "Auto Threshold": [/\bauto\s*thresh/i],
  "Threshold": [/\bthreshold\b/i, /\bcthresh\b/i],
  "Auto Baseline": [/\bauto\s*baseline\b/i],
  "Baseline Start": [/\bbaseline\s*start\b/i],
  "Baseline End": [/\bbaseline\s*end\b/i],
  "Tm1": [/\btm\s*1\b/i, /\btm1\b/i],
  "Tm2": [/\btm\s*2\b/i, /\btm2\b/i],
  "Tm3": [/\btm\s*3\b/i, /\btm3\b/i],
  "Tm4": [/\btm\s*4\b/i, /\btm4\b/i],
  "Y-Intercept": [/\by-?intercept\b/i],
  "R2": [/^\s*r2\s*$/i, /\br\^?2\b/i],
  "Slope": [/\bslope\b/i],
  "Efficiency": [/\beff(iciency)?\b/i],
  "Standard Deviation": [/^\s*(std|standard)\s*deviation\s*$/i, /\bglobal\s*sd\b/i],
  "Standard Error": [/^\s*(std|standard)\s*error\s*$/i, /\bse\b/i],
  "Omit": [/\bomit\b/i, /\bexclude\b/i]
};

const NUMERIC_FIELDS = new Set([
  "Quantity","Cq","Cq Mean","Cq Confidence","Cq SD",
  "Quantity Mean","Quantity SD","Threshold",
  "Baseline Start","Baseline End","Tm1","Tm2","Tm3","Tm4",
  "Y-Intercept","R2","Slope","Efficiency",
  "Standard Deviation","Standard Error"
]);

const BOOL_FIELDS = new Set([
  "Auto Threshold","Auto Baseline","Omit"
]);

function toBool(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (["true","yes","y","1"].includes(s)) return true;
  if (["false","no","n","0"].includes(s)) return false;
  return null;
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function detectDelimiterLine(line) {

  if (/\t/.test(line)) return "\t";

  const counts = [
    {d:",", c:(line.match(/,/g)||[]).length},
    {d:";", c:(line.match(/;/g)||[]).length},
    {d:"|", c:(line.match(/\|/g)||[]).length}
  ].sort((a,b)=>b.c-a.c);
  return counts[0].c > 0 ? counts[0].d : "\t";
}

function buildColumnMap(headers) {

  const norm = headers.map(h => (h ?? "").toString().trim().replace(/\s+/g, " "));

  const map = {};
  const claimed = new Set();

  function scoreMatch(canon, header) {
    const pats = HEADER_PATTERNS[canon] || [];
    for (const rx of pats) {
      if (rx.test(header)) return 1000;
    }

    const h = header.toLowerCase();
    const c = canon.toLowerCase();
    if (h === c) return 800;
    if (h.includes(c)) return 500;

    if ((c.startsWith("cq") || c.includes("c[qt]")) && /\bc[qt]\b/i.test(h)) return 400;
    return 0;
  }

  for (const canon of CANON) {
    let best = {idx: -1, score: -1};
    for (let i = 0; i < norm.length; i++) {
      if (claimed.has(i)) continue;
      const s = scoreMatch(canon, norm[i]);
      if (s > best.score) best = {idx: i, score: s};
    }
    if (best.idx >= 0 && best.score >= 300) {
      map[canon] = best.idx;
      claimed.add(best.idx);
    }
  }
  return map;
}

function splitRows(rawText) {

  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(line => line.trim().length > 0);
}

function parseDelimited(line, delim) {

  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (!inQ && ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function extractNormalizedWellRows(rawText) {
  const rows = splitRows(rawText);
  if (rows.length === 0) return [];

  const delim = detectDelimiterLine(rows[0]);
  const headers = parseDelimited(rows[0], delim);

  const colMap = buildColumnMap(headers);

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = parseDelimited(rows[r], delim);

    if (cols.every(c => c === "")) continue;

    const rec = {};
    for (const key of CANON) {
      const idx = colMap[key];
      const raw = (idx != null && idx >= 0) ? cols[idx] : null;

      if (BOOL_FIELDS.has(key)) {
        const b = toBool(raw);
        rec[key] = (b === null ? (raw === "" ? null : raw) : b);
      } else if (NUMERIC_FIELDS.has(key)) {
        const n = toNum(raw);
        rec[key] = (n === null ? (raw === "" ? null : raw) : n);
      } else {
        rec[key] = (raw == null || raw === "") ? null : raw;
      }
    }

    if (rec["Cq Mean"] == null && rec["Cq"] != null && typeof rec["Cq"] === "number") {
      rec["Cq Mean"] = rec["Cq"];
    }

    if (rec["Amp Status"] != null && typeof rec["Amp Status"] === "string") {
      const s = rec["Amp Status"].toLowerCase();
      if (["amp","amplified","pos","positive"].includes(s)) rec["Amp Status"] = "Amp";
      else if (["noamp","no amp","neg","negative","none"].includes(s)) rec["Amp Status"] = "NoAmp";
    }

    if (rec["Well Position"]) records.push(rec);
  }

  return records;
}

function positionToIndices(pos) {

  const m = /^([A-P])(\d{1,2})$/i.exec(pos || "");
  if (!m) return null;
  const col = m[1].toUpperCase().charCodeAt(0) - 65;
  const row = parseInt(m[2], 10) - 1;
  return { x: col, y: row };
}

function toPlateFromNormalizedRows(records, Plate, GenericWell) {

  let maxCol = 0, maxRow = 0;
  for (const rec of records) {
    const idx = positionToIndices(rec["Well Position"]);
    if (!idx) continue;
    if (idx.x > maxCol) maxCol = idx.x;
    if (idx.y > maxRow) maxRow = idx.y;
  }
  const plate = new Plate("", maxCol + 1, maxRow + 1);

  for (const rec of records) {
    const idx = positionToIndices(rec["Well Position"]);
    if (!idx) continue;
    const name = rec["Well Position"];
    const well = new GenericWell(name);

    well.label = rec["Sample"] ?? rec["Target"] ?? name;
    well.value = rec["Cq Mean"] ?? rec["Cq"] ?? null;

    well.properties = {
      ...rec,
      formula: "",
      refIDs: []
    };
    well.uid = uuid();
    well.properties.refIDs = [well.uid];

    if (!plate.wells[idx.x]) plate.wells[idx.x] = [];
    plate.wells[idx.x][idx.y] = well;
  }

  if (typeof plate.removeEmptyRowsAndColumns === "function") {
    plate.removeEmptyRowsAndColumns();
  }
  return plate;
}
const normalized = extractNormalizedWellRows(rawText);
const myPlate = toPlateFromNormalizedRows(normalized, Plate, GenericWell);
resolve([myPlate]);
