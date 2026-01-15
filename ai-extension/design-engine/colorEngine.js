import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ Hugging Face Router (supported)
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

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
     ✅ ADD: style keyword boost (helps “make it minimalist” etc.)
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

    // ✅ ADD: common interior accents (still realistic)
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
    return {
      name: "User Defined Palette",
      colors: unique.map((c) => ({ name: c.name, hex: c.hex })),
    };
  }

  /* ===============================
     2️⃣ MOOD-BASED RULES
     =============================== */
  const wantsWarm = /\b(warm|cozy|cozier|soft|relaxing|warmth|mainit)\b/.test(text);
  const wantsDark = /\b(dark|moody|dramatic|madilim)\b/.test(text);
  const wantsLight = /\b(light|airy|bright|brighter|maliwanag)\b/.test(text);

  // ✅ ADD: if user explicitly asked for a known style, prioritize a matching palette
  if (wantsMinimalist) {
    return {
      name: "Minimalist Calm",
      colors: [
        { name: "Pure White", hex: "#FFFFFF" },
        { name: "Light Gray", hex: "#E5E7EB" },
        { name: "Warm Beige", hex: "#E7D7C1" },
        { name: "Natural Wood", hex: "#C19A6B" },
      ],
    };
  }

  if (wantsScandi) {
    return {
      name: "Scandi Soft",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Warm Beige", hex: "#E7D7C1" },
        { name: "Light Oak", hex: "#C19A6B" },
        { name: "Muted Gray", hex: "#D1D5DB" },
      ],
    };
  }

  if (wantsIndustrial) {
    return {
      name: "Industrial Urban",
      colors: [
        { name: "Concrete Gray", hex: "#9CA3AF" },
        { name: "Steel Dark", hex: "#374151" },
        { name: "Rust Accent", hex: "#B45309" },
        { name: "Matte Black", hex: "#111827" },
      ],
    };
  }

  if (wantsJapandi) {
    return {
      name: "Japandi Natural",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Sand Beige", hex: "#EAD9C3" },
        { name: "Natural Wood", hex: "#C19A6B" },
        { name: "Charcoal", hex: "#334155" },
      ],
    };
  }

  if (wantsBoho) {
    return {
      name: "Boho Earthy",
      colors: [
        { name: "Cream", hex: "#F5F5DC" },
        { name: "Terracotta", hex: "#C16A4A" },
        { name: "Sage Green", hex: "#A3B18A" },
        { name: "Natural Wood", hex: "#C19A6B" },
      ],
    };
  }

  if (wantsLuxury) {
    return {
      name: "Luxury Contrast",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Charcoal", hex: "#334155" },
        { name: "Deep Navy", hex: "#1E3A8A" },
        { name: "Warm Walnut", hex: "#6B4F3A" },
      ],
    };
  }

  if (wantsWarm && !wantsDark) {
    return {
      name: "Warm Neutral",
      colors: [
        { name: "Warm Beige", hex: "#E7D7C1" },
        { name: "Soft Cream", hex: "#F5F5DC" },
        { name: "Natural Wood", hex: "#C19A6B" },
        { name: "Muted Taupe", hex: "#CBBBA0" },
      ],
    };
  }

  if (wantsDark) {
    return {
      name: "Dark Contrast",
      colors: [
        { name: "Charcoal", hex: "#334155" },
        { name: "Deep Gray", hex: "#1F2937" },
        { name: "Muted Black", hex: "#0F172A" },
        { name: "Warm Walnut", hex: "#6B4F3A" },
      ],
    };
  }

  if (wantsLight) {
    return {
      name: "Light & Airy",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Light Gray", hex: "#E5E7EB" },
        { name: "Pale Beige", hex: "#EFE6D8" },
        { name: "Dusty Blue", hex: "#BFD3E6" },
      ],
    };
  }

  // ✅ ADD: modern fallback if user explicitly says “modern”
  if (wantsModern) {
    return {
      name: "Modern Neutral",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Cool Gray", hex: "#CBD5E1" },
        { name: "Charcoal", hex: "#334155" },
        { name: "Muted Teal", hex: "#3FA796" },
      ],
    };
  }

  /* ===============================
     3️⃣ HF PALETTE REFINEMENT (OPTIONAL)
     =============================== */
  // ✅ IMPORTANT: This section should NEVER crash the app.
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

Hard rules:
- Output ONLY valid JSON (no markdown, no commentary)
- Max 4 colors
- Use common interior color names
- Hex must be 6-digit #RRGGBB
- Avoid neon/fantasy colors

JSON shape:
{
  "name": "Palette Name",
  "colors": [
    { "name": "Color Name", "hex": "#RRGGBB" }
  ]
}
`.trim();

    try {
      const res = await fetch(HF_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HF_MODEL,
          messages: [
            { role: "system", content: "You output strictly valid JSON only." },
            { role: "user", content: prompt },
          ],
          temperature: 0.25,
          top_p: 0.9,
          max_tokens: 220,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data?.choices?.[0]?.message?.content;

        const parsed = safeParsePaletteJSON(raw);
        const validated = validatePalette(parsed);
        if (validated) return validated;
      } else {
        // ✅ log only; do not throw
        const errText = await res.text().catch(() => "");
        console.warn("HF palette error:", res.status, res.statusText, errText);
      }
    } catch (err) {
      console.warn("HF palette exception (ignored):", err?.message || err);
    }
  }

  /* ===============================
     4️⃣ STYLE-BASED FALLBACK (SAFE)
     =============================== */
  const styleName =
    typeof styleInput === "string"
      ? styleInput.toLowerCase()
      : styleInput?.name?.toLowerCase() || "modern";

  const palettes = {
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

    // ✅ ADD: more fallbacks (still safe + realistic)
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

  return palettes[styleName] || palettes.modern;
}

/* ===============================
   Helpers
   =============================== */

function dedupeByHex(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const hex = (item.hex || "").toUpperCase();
    if (!seen.has(hex)) {
      seen.add(hex);
      out.push(item);
    }
  }
  return out;
}

function safeParsePaletteJSON(raw) {
  if (!raw || typeof raw !== "string") return null;

  // Direct parse
  try {
    return JSON.parse(raw);
  } catch {}

  // Extract first JSON block
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function validatePalette(p) {
  if (!p || typeof p !== "object") return null;
  if (typeof p.name !== "string" || !Array.isArray(p.colors)) return null;

  const colors = p.colors
    .filter((c) => c && typeof c.name === "string" && typeof c.hex === "string")
    .map((c) => ({ name: cleanName(c.name), hex: normalizeHex(c.hex) }))
    .filter((c) => c.name && isHex(c.hex))
    .slice(0, 4);

  if (colors.length === 0) return null;

  return {
    name: cleanName(p.name) || "Suggested Palette",
    colors,
  };
}

function cleanName(s) {
  return String(s).trim().replace(/\s+/g, " ").slice(0, 40);
}

function normalizeHex(h) {
  const v = String(h).trim().toUpperCase();
  if (/^[0-9A-F]{6}$/.test(v)) return `#${v}`;
  return v;
}

function isHex(h) {
  return /^#[0-9A-F]{6}$/.test(h);
}
