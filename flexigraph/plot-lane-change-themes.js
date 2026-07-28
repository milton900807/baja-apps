function () {

    const deepMerge = (a = {}, b = {}) => {
        const out = { ...a };
        for (const k in b) {
            const v = b[k];
            out[k] = (v && typeof v === "object" && !Array.isArray(v)) ? deepMerge(a[k] || {}, v) : v;
        }
        return out;
    };

    const THEMES = {
        indigoCyanGlow: {
            stroke: "#4F46E5",
            width: 4,
            dash: null,
            head: true,
            headLen: 14,
            headWidth: 12,
            shadow: { blur: 12, color: "rgba(79,70,229,0.45)", offsetX: 0, offsetY: 0 },
            textColor: "#111827",
            textBg: "rgba(255,255,255,0.9)",
            font: "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
            textPad: 5,
            followTangent: true,
        },

        forest: {
            stroke: "#1B7F4A",
            width: 3,
            dash: [8, 6],
            head: true,
            headLen: 12,
            headWidth: 10,
            shadow: { blur: 8, color: "rgba(27,127,74,0.35)", offsetX: 0, offsetY: 0 },
            textColor: "#0b3d26",
            textBg: "rgba(217, 244, 225, 0.9)",
            font: "11px Arial",
            textPad: 4,
            followTangent: true,
        },

        sunset: {
            stroke: "#F97316",
            width: 3,
            dash: [12, 6],
            head: true,
            headLen: 14,
            headWidth: 12,
            shadow: { blur: 10, color: "rgba(249,115,22,0.35)", offsetX: 0, offsetY: 0 },
            textColor: "#7C2D12",
            textBg: "rgba(255, 247, 237, 0.95)",
            font: "12px 'Segoe UI', Arial",
            textPad: 5,
            followTangent: true,
        },

        monoDashed: {
            stroke: "#374151",
            width: 2,
            dash: [6, 6],
            head: true,
            headLen: 10,
            headWidth: 10,
            shadow: null,
            textColor: "#111827",
            textBg: "rgba(243,244,246,0.95)",
            font: "11px Arial",
            textPad: 3,
            followTangent: false,
            crisp: true,
        },

        alert: {
            stroke: "#DC2626",
            width: 4,
            dash: [4, 3],
            head: true,
            headLen: 16,
            headWidth: 14,
            shadow: { blur: 6, color: "rgba(220,38,38,0.35)", offsetX: 0, offsetY: 0 },
            textColor: "#7F1D1D",
            textBg: "rgba(254,226,226,0.95)",
            font: "12px Inter, Arial",
            textPad: 6,
            followTangent: true,
        },

        aqua: {
            stroke: "#06B6D4",
            width: 3,
            dash: null,
            head: true,
            headLen: 12,
            headWidth: 10,
            shadow: { blur: 10, color: "rgba(6,182,212,0.35)", offsetX: 0, offsetY: 0 },
            textColor: "#0E7490",
            textBg: "rgba(224,242,254,0.95)",
            font: "12px 'Helvetica Neue', Arial",
            textPad: 4,
            followTangent: true,
        },

        ember: {
            stroke: "#EA580C",
            width: 5,
            dash: [14, 6],
            head: true,
            headLen: 18,
            headWidth: 14,
            shadow: { blur: 12, color: "rgba(234,88,12,0.4)", offsetX: 0, offsetY: 1 },
            textColor: "#7C2D12",
            textBg: "rgba(255,237,213,0.95)",
            font: "13px Inter, Arial",
            textPad: 6,
            followTangent: true,
        },

        neon: {
            stroke: "#22D3EE",
            width: 3,
            dash: [2, 4],
            head: true,
            headLen: 12,
            headWidth: 12,
            shadow: { blur: 16, color: "rgba(34,211,238,0.6)", offsetX: 0, offsetY: 0 },
            textColor: "#F8FAFC",
            textBg: "rgba(2,6,23,0.85)",
            font: "11px 'JetBrains Mono', monospace",
            textPad: 5,
            followTangent: true,
        },

        pastel: {
            stroke: "#A78BFA",
            width: 2,
            dash: [10, 8],
            head: true,
            headLen: 12,
            headWidth: 10,
            shadow: { blur: 8, color: "rgba(167,139,250,0.3)", offsetX: 0, offsetY: 0 },
            textColor: "#4C1D95",
            textBg: "rgba(245,243,255,0.95)",
            font: "12px 'Segoe UI', Arial",
            textPad: 4,
            followTangent: true,
        },

        graphite: {
            stroke: "#0F172A",
            width: 3,
            dash: null,
            head: true,
            headLen: 13,
            headWidth: 11,
            shadow: { blur: 4, color: "rgba(0,0,0,0.25)", offsetX: 0, offsetY: 1 },
            textColor: "#0F172A",
            textBg: "rgba(241,245,249,0.95)",
            font: "11px Arial",
            textPad: 4,
            followTangent: false,
            crisp: true,
        },

        ocean: {
            stroke: "#2563EB",
            width: 4,
            dash: [12, 4, 2, 4],
            head: true,
            headLen: 15,
            headWidth: 12,
            shadow: { blur: 10, color: "rgba(37,99,235,0.35)", offsetX: 0, offsetY: 0 },
            textColor: "#1E3A8A",
            textBg: "rgba(219,234,254,0.95)",
            font: "12px Inter, Arial",
            textPad: 5,
            followTangent: true,
        },

        midnight: {
            stroke: "#14B8A6",
            width: 3,
            dash: [5, 3],
            head: true,
            headLen: 12,
            headWidth: 10,
            shadow: { blur: 14, color: "rgba(20,184,166,0.5)", offsetX: 0, offsetY: 0 },
            textColor: "#E5E7EB",
            textBg: "rgba(2,6,23,0.9)",
            font: "11px Inter, Arial",
            textPad: 4,
            followTangent: true,
        },

        micro9: {
            stroke: "#111827",
            width: 2,
            dash: [6, 3],
            head: true,
            headLen: 10,
            headWidth: 9,
            shadow: null,
            textColor: "#111827",
            textBg: "rgba(255,255,255,0.95)",
            font: "9px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
            textPad: 3,
            followTangent: false,
            crisp: true,
        }
    };

    return THEMES

}
