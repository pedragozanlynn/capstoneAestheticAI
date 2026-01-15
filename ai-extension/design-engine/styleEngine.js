/**
 * STYLE DETECTION ENGINE (PRODUCTION-GRADE)
 * ✅ ONE dominant style per session
 * ✅ ZERO style drift
 * ✅ Explicit change only
 * ✅ Deterministic (no LLM)
 */
export function detectStyle({
  message = "",
  previousStyle = null,
  isEdit = false,
  spaceType = "residential",
}) {
  const text = message.toLowerCase();

  /* ===============================
     🔒 HARD STYLE LOCK (CRITICAL)
     =============================== */
  const explicitStyleChange =
    /change style|switch style|new style|make it .* style/i.test(text);

  // If style already chosen, DO NOT change unless explicitly requested
  if (previousStyle?.name && !explicitStyleChange) {
    return {
      name: previousStyle.name,
      confidence: previousStyle.confidence ?? 1,
      locked: true,
    };
  }

  // Edit mode always locks style
  if (isEdit && previousStyle?.name) {
    return {
      name: previousStyle.name,
      confidence: previousStyle.confidence ?? 1,
      locked: true,
    };
  }

  /* ===============================
     🎨 STYLE DEFINITIONS
     =============================== */
  const STYLES = [
    {
      name: "Modern",
      weight: 1.1,
      keywords: ["modern", "clean", "sleek", "neutral", "contemporary"],
    },
    {
      name: "Minimalist",
      weight: 1.25,
      keywords: ["minimal", "minimalist", "decluttered", "less"],
    },
    {
      name: "Industrial",
      weight: 1.35,
      keywords: ["industrial", "concrete", "cement", "metal", "loft", "urban"],
    },
    {
      name: "Scandinavian",
      weight: 1.25,
      keywords: ["scandinavian", "scandi", "cozy", "warm", "light wood"],
    },
    {
      name: "Japandi",
      weight: 1.35,
      keywords: ["japandi", "zen", "wabi sabi", "japanese"],
    },
    {
      name: "Bohemian",
      weight: 1.2,
      keywords: ["boho", "bohemian", "earthy", "relaxed", "layered"],
    },
    {
      name: "Luxury",
      weight: 1.45,
      keywords: ["luxury", "luxurious", "premium", "high-end", "marble", "gold"],
    },
    {
      name: "Rustic",
      weight: 1.2,
      keywords: ["rustic", "farmhouse", "raw wood", "country"],
    },
    {
      name: "Coastal",
      weight: 1.15,
      keywords: ["coastal", "beach", "ocean", "sea", "breezy"],
    },
  ];

  /* ===============================
     📊 SCORE STYLES
     =============================== */
  let best = { name: "Modern", score: 0 };

  for (const style of STYLES) {
    let score = 0;

    for (const keyword of style.keywords) {
      if (text.includes(keyword)) score += style.weight;
    }

    // Commercial bias
    if (spaceType === "commercial") {
      if (style.name === "Industrial") score += 0.4;
      if (style.name === "Modern") score += 0.3;
      if (style.name === "Luxury") score += 0.2;
    }

    if (score > best.score) best = { name: style.name, score };
  }

  /* ===============================
     🧠 SMART FALLBACK
     =============================== */
  if (best.score === 0) {
    if (spaceType === "commercial") {
      return { name: "Modern", confidence: 0.6, locked: false };
    }

    if (text.includes("cozy") || text.includes("warm")) {
      return { name: "Scandinavian", confidence: 0.6, locked: false };
    }

    return { name: "Modern", confidence: 0.5, locked: false };
  }

  /* ===============================
     ✅ FINAL OUTPUT
     =============================== */
  return {
    name: best.name,
    confidence: Number(Math.min(1, best.score / 3).toFixed(2)),
    locked: false,
  };
}
