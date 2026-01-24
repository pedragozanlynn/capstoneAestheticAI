import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ HF Router Chat Completions endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

/**
 * ✅ Chat model fallback chain (router-compatible)
 */
const HF_CHAT_MODELS = [
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
];

/**
 * ✅ NEW: Ensure palette is usable for interior generation
 * - If only ONE color is present, auto-add neutrals so the model doesn't "escape"
 * - This also ensures UI palette matches what we expect the image generator to follow
 */
function ensureInteriorUsablePalette(palette) {
  if (!palette || typeof palette !== "object") return palette;

  const colors = Array.isArray(palette.colors) ? palette.colors.filter(Boolean) : [];
  if (colors.length === 0) return palette;

  // If only one color was detected (e.g. "blue theme"),
  // add required neutrals so the generator can apply it realistically.
  if (colors.length === 1) {
    const primary = colors[0];

    return {
      name: palette.name || "Balanced Interior Palette",
      colors: [
        primary,
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Light Gray", hex: "#E5E7EB" },
      ],
    };
  }

  return { ...palette, colors };
}

/**
 * Returns a color palette object
 * Shape:
 * {
 *   name: string,
 *   colors: [{ name: string, hex: string }]
 * }
 */
export async function getColorPalette(styleInput, userMessage = "") {
  const text = (userMessage || "").toLowerCase();

  /* ===============================
     STYLE KEYWORD BOOST
     =============================== */
  const wantsMinimalist = /\b(minimalist|minimal|clean|declutter|simple)\b/.test(text);
  const wantsModern = /\b(modern|contemporary)\b/.test(text);
  const wantsScandi = /\b(scandinavian|scandi|nordic)\b/.test(text);
  const wantsIndustrial = /\b(industrial|loft|concrete|steel)\b/.test(text);
  const wantsJapandi = /\b(japandi|japanese\s*modern)\b/.test(text);
  const wantsBoho = /\b(boho|bohemian)\b/.test(text);
  const wantsLuxury = /\b(luxury|luxurious|elegant|premium)\b/.test(text);

  /* ===============================
     1️⃣ EXPLICIT COLOR RULES (HIGHEST PRIORITY)
     =============================== */
  const COLOR_KEYWORDS = [
    { keys: ["white", "pure white"], name: "White", hex: "#FFFFFF" },
    { keys: ["offwhite", "off white", "off-white"], name: "Off White", hex: "#F8FAFC" },
    { keys: ["beige"], name: "Beige", hex: "#E7D7C1" },
    { keys: ["cream"], name: "Cream", hex: "#F5F5DC" },
    { keys: ["gray", "grey"], name: "Gray", hex: "#CBD5E1" },
    { keys: ["charcoal"], name: "Charcoal", hex: "#334155" },
    { keys: ["black"], name: "Black", hex: "#0F172A" },
    { keys: ["brown"], name: "Brown", hex: "#7C5C3B" },
    { keys: ["wood", "oak", "walnut"], name: "Natural Wood", hex: "#C19A6B" },
    { keys: ["green"], name: "Green", hex: "#4ADE80" },
    { keys: ["olive"], name: "Olive", hex: "#6B8E23" },
    { keys: ["blue"], name: "Blue", hex: "#60A5FA" },
    { keys: ["navy"], name: "Navy", hex: "#1E3A8A" },
    { keys: ["teal"], name: "Teal", hex: "#3FA796" },
    { keys: ["terracotta"], name: "Terracotta", hex: "#C16A4A" },
    { keys: ["sage"], name: "Sage Green", hex: "#A3B18A" },
    { keys: ["taupe"], name: "Taupe", hex: "#CBBBA0" },
    { keys: ["sand"], name: "Sand", hex: "#EAD9C3" },
  ];

  const detected = [];
  for (const entry of COLOR_KEYWORDS) {
    if (entry.keys.some((k) => text.includes(k))) detected.push(entry);
  }

  if (detected.length > 0) {
    const unique = dedupeByHex(detected).slice(0, 4);
    return ensureInteriorUsablePalette({
      name: "User Defined Palette",
      colors: unique.map((c) => ({ name: c.name, hex: c.hex })),
    });
  }

  /* ===============================
     2️⃣ STYLE / MOOD RULES (FAST PATH)
     =============================== */
  if (wantsMinimalist) return ensureInteriorUsablePalette(presetPalettes.minimalist);
  if (wantsScandi) return ensureInteriorUsablePalette(presetPalettes.scandinavian);
  if (wantsIndustrial) return ensureInteriorUsablePalette(presetPalettes.industrial);
  if (wantsJapandi) return ensureInteriorUsablePalette(presetPalettes.japandi);
  if (wantsBoho) return ensureInteriorUsablePalette(presetPalettes.boho);
  if (wantsLuxury) return ensureInteriorUsablePalette(presetPalettes.luxury);
  if (wantsModern) return ensureInteriorUsablePalette(presetPalettes.modern);

  /* ===============================
     3️⃣ HF PALETTE REFINEMENT (SAFE, OPTIONAL)
     =============================== */
  if (HF_API_KEY) {
    const styleName =
      typeof styleInput === "string"
        ? styleInput
        : styleInput?.name || "modern";

    const prompt = `
You are an interior designer.

Return a realistic interior color palette as STRICT JSON ONLY.

Inputs:
- Style: ${styleName}
- User request: "${userMessage}"

Rules:
- JSON only
- Max 4 colors
- Common interior color names
- Valid 6-digit hex codes

JSON:
{
  "name": "Palette Name",
  "colors": [
    { "name": "Color Name", "hex": "#RRGGBB" }
  ]
}
`.trim();

    const raw = await callHF(prompt);
    const parsed = safeParsePaletteJSON(raw);
    const validated = validatePalette(parsed);
    if (validated) return ensureInteriorUsablePalette(validated);
  }

  /* ===============================
     4️⃣ FINAL SAFE FALLBACK
     =============================== */
  const styleKey =
    typeof styleInput === "string"
      ? styleInput.toLowerCase()
      : styleInput?.name?.toLowerCase() || "modern";

  return ensureInteriorUsablePalette(presetPalettes[styleKey] || presetPalettes.modern);
}

/* ===============================
   HF CALL (CHAT FALLBACK)
   =============================== */
async function callHF(prompt) {
  let lastErr = "";

  for (const model of HF_CHAT_MODELS) {
    try {
      const res = await fetch(HF_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Return STRICT JSON only." },
            { role: "user", content: prompt },
          ],
          temperature: 0.25,
          top_p: 0.9,
          max_tokens: 220,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        lastErr = t;
        if (res.status === 400 && t.includes("not a chat model")) continue;
        if (res.status === 429 || res.status === 503) continue;
        continue;
      }

      const data = await res.json();
      return data?.choices?.[0]?.message?.content || "";
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }

  console.warn("HF palette fallback used:", lastErr);
  return "";
}

/* ===============================
   PRESET PALETTES
   =============================== */
const presetPalettes = {
  modern: {
    name: "Modern Neutral",
    colors: [
      { name: "Soft White", hex: "#F8FAFC" },
      { name: "Cool Gray", hex: "#CBD5E1" },
      { name: "Charcoal", hex: "#334155" },
      { name: "Muted Teal", hex: "#3FA796" },
    ],
  },
  minimalist: {
    name: "Minimalist Calm",
    colors: [
      { name: "Pure White", hex: "#FFFFFF" },
      { name: "Light Gray", hex: "#E5E7EB" },
      { name: "Warm Beige", hex: "#E7D7C1" },
      { name: "Natural Wood", hex: "#C19A6B" },
    ],
  },
  industrial: {
    name: "Industrial Urban",
    colors: [
      { name: "Concrete Gray", hex: "#9CA3AF" },
      { name: "Steel Dark", hex: "#374151" },
      { name: "Rust Accent", hex: "#B45309" },
      { name: "Matte Black", hex: "#111827" },
    ],
  },
  scandinavian: {
    name: "Scandi Soft",
    colors: [
      { name: "Soft White", hex: "#F8FAFC" },
      { name: "Warm Beige", hex: "#E7D7C1" },
      { name: "Light Oak", hex: "#C19A6B" },
      { name: "Muted Gray", hex: "#D1D5DB" },
    ],
  },
  japandi: {
    name: "Japandi Natural",
    colors: [
      { name: "Soft White", hex: "#F8FAFC" },
      { name: "Sand Beige", hex: "#EAD9C3" },
      { name: "Natural Wood", hex: "#C19A6B" },
      { name: "Charcoal", hex: "#334155" },
    ],
  },
  boho: {
    name: "Boho Earthy",
    colors: [
      { name: "Cream", hex: "#F5F5DC" },
      { name: "Terracotta", hex: "#C16A4A" },
      { name: "Sage Green", hex: "#A3B18A" },
      { name: "Natural Wood", hex: "#C19A6B" },
    ],
  },
  luxury: {
    name: "Luxury Contrast",
    colors: [
      { name: "Soft White", hex: "#F8FAFC" },
      { name: "Charcoal", hex: "#334155" },
      { name: "Deep Navy", hex: "#1E3A8A" },
      { name: "Warm Walnut", hex: "#6B4F3A" },
    ],
  },
};

/* ===============================
   HELPERS
   =============================== */
function dedupeByHex(arr) {
  const seen = new Set();
  return arr.filter((i) => {
    const h = (i.hex || "").toUpperCase();
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

function safeParsePaletteJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function validatePalette(p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.colors)) return null;
  const colors = p.colors
    .map((c) => ({ name: cleanName(c.name), hex: normalizeHex(c.hex) }))
    .filter((c) => c.name && isHex(c.hex))
    .slice(0, 4);
  if (!colors.length) return null;
  return { name: cleanName(p.name) || "Suggested Palette", colors };
}

function cleanName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function normalizeHex(h) {
  const v = String(h || "").trim().toUpperCase();
  if (/^[0-9A-F]{6}$/.test(v)) return `#${v}`;
  return v;
}

function isHex(h) {
  return /^#[0-9A-F]{6}$/.test(h);
}
