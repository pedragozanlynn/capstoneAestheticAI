/**
 * STYLE DETECTION ENGINE (PRODUCTION-GRADE)
 * ✅ One dominant style per session
 * ✅ Zero drift (locked unless explicit change)
 * ✅ Explicit change only (strong patterns)
 * ✅ Deterministic (no LLM)
 * ✅ Better keyword matching (word boundaries + synonyms)
 */
export function detectStyle({
  message = "",
  previousStyle = null,
  isEdit = false,
  spaceType = "residential",
}) {
  const text = (message || "").toLowerCase();

  /* ===============================
     🔒 HARD STYLE LOCK (CRITICAL)
     =============================== */
  // Explicit change patterns must be strong to avoid accidental switches.
  // Examples supported:
  // "change style to japandi", "switch to industrial", "make it bohemian style", "new style: luxury"
  const explicitStyleChange =
    /\b(change|switch)\s+(the\s+)?style\b/.test(text) ||
    /\b(new\s+style)\b/.test(text) ||
    /\b(make\s+it)\s+.*\bstyle\b/.test(text) ||
    /\bstyle\s*:\s*\w+/.test(text) ||
    // ✅ ADD: treat "make it minimalist / japandi / industrial" as explicit style change (even without the word "style")
    (/\bmake\s+it\b/.test(text) && mentionsStyleKeyword(text)) ||
    // ✅ ADD: allow short, direct style-only messages like "japandi" / "industrial please"
    (mentionsStyleKeyword(text) && text.split(/\s+/).length <= 3);

  // ✅ UPDATED: Edit mode locks style ONLY if user is NOT explicitly changing style
  if (isEdit && previousStyle?.name && !explicitStyleChange) {
    return {
      name: previousStyle.name,
      confidence: previousStyle.confidence ?? 1,
      locked: true,
    };
  }

  // If style already chosen, do not change unless explicitly requested
  if (previousStyle?.name && !explicitStyleChange) {
    return {
      name: previousStyle.name,
      confidence: previousStyle.confidence ?? 1,
      locked: true,
    };
  }

  /* ===============================
     🎨 STYLE DEFINITIONS
     =============================== */
  // Use regex-based keyword matching to avoid substring false positives.
  const STYLES = [
    {
      name: "Modern",
      weight: 1.1,
      patterns: [
        /\bmodern\b/,
        /\bcontemporary\b/,
        /\bsleek\b/,
        /\bclean\s+lines?\b/,
        /\bneutral(s)?\b/,
      ],
    },
    {
      name: "Minimalist",
      weight: 1.25,
      patterns: [
        /\bminimal(ist)?\b/,
        /\bdeclutter(ed|ing)?\b/,
        /\bless\s+is\s+more\b/,
        /\bsimple\b/,
      ],
    },
    {
      name: "Industrial",
      weight: 1.35,
      patterns: [
        /\bindustrial\b/,
        /\bloft\b/,
        /\burban\b/,
        /\bexposed\s+brick\b/,
        /\bconcrete\b|\bcement\b/,
        /\bmetal\b|\bsteel\b/,
        /\bblack\s+iron\b/,
      ],
    },
    {
      name: "Scandinavian",
      weight: 1.25,
      patterns: [
        /\bscandinavian\b|\bscandi\b/,
        /\bhygge\b/,
        /\blight\s+wood\b/,
        /\bsoft\s+neutral(s)?\b/,
        /\bcozy\b/, // NOTE: cozy alone is not enough; weighted lower via rule below
      ],
      // Style-specific dampener: "cozy" appears in many styles
      softSignals: [/\bcozy\b/],
    },
    {
      name: "Japandi",
      weight: 1.35,
      patterns: [
        /\bjapandi\b/,
        /\bwabi\s*sabi\b/,
        /\bzen\b/,
        /\bjapanese\b/,
        /\bcalm\s+minimal\b/,
      ],
    },
    {
      name: "Bohemian",
      weight: 1.2,
      patterns: [
        /\bboho\b|\bbohemian\b/,
        /\bearthy\b/,
        /\blayer(ed|ing)?\b/,
        /\bpattern(s)?\b/,
        /\bmacrame\b/,
        /\brattan\b/,
      ],
    },
    {
      name: "Luxury",
      weight: 1.45,
      patterns: [
        /\bluxury\b|\bluxurious\b/,
        /\bpremium\b|\bhigh[-\s]?end\b/,
        /\bmarble\b/,
        /\bgold\b|\bbrass\b/,
        /\bvelvet\b/,
        /\bcrystal\b/,
      ],
    },
    {
      name: "Rustic",
      weight: 1.2,
      patterns: [
        /\brustic\b/,
        /\bfarmhouse\b/,
        /\bcountry\b/,
        /\breclaimed\s+wood\b/,
        /\bbarn\b/,
        /\braw\s+wood\b/,
      ],
    },
    {
      name: "Coastal",
      weight: 1.15,
      patterns: [
        /\bcoastal\b/,
        /\bbeach\b/,
        /\bocean\b|\bsea\b/,
        /\bbreezy\b/,
        /\bwhite\s+and\s+blue\b/,
      ],
    },
  ];

  /* ===============================
     🧩 OPTIONAL: If explicit change, bias toward requested style name
     =============================== */
  // If user explicitly wrote a style name, short-circuit.
  const explicitNamed = extractExplicitStyleName(text);
  if (explicitStyleChange && explicitNamed) {
    return { name: explicitNamed, confidence: 0.95, locked: false };
  }

  /* ===============================
     📊 SCORE STYLES
     =============================== */
  let best = { name: "Modern", score: 0 };

  for (const style of STYLES) {
    let score = 0;

    for (const re of style.patterns) {
      if (re.test(text)) score += style.weight;
    }

    // Reduce impact of very broad signals (e.g., "cozy")
    if (style.softSignals) {
      for (const re of style.softSignals) {
        if (re.test(text)) score -= 0.35; // keeps "cozy" from dominating alone
      }
      // If scandi has other signals, it will still win.
      if ((/\bscandinavian\b|\bscandi\b|\bhygge\b|\blight\s+wood\b/).test(text)) {
        score += 0.35;
      }
    }

    // Commercial bias (light, to avoid forcing industrial everywhere)
    if (spaceType === "commercial") {
      if (style.name === "Industrial") score += 0.25;
      if (style.name === "Modern") score += 0.2;
      if (style.name === "Luxury") score += 0.15;
      if (style.name === "Bohemian") score += 0.05; // cafés sometimes
    }

    if (score > best.score) best = { name: style.name, score };
  }

  /* ===============================
     🧠 SMART FALLBACK
     =============================== */
  if (best.score <= 0) {
    if (spaceType === "commercial") {
      // safer default for commercial
      return { name: "Modern", confidence: 0.65, locked: false };
    }

    // Warm/cozy but no explicit style keywords
    if (/\b(cozy|warm)\b/.test(text)) {
      return { name: "Scandinavian", confidence: 0.6, locked: false };
    }

    return { name: "Modern", confidence: 0.55, locked: false };
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

/* ===============================
   Helpers
   =============================== */

// ✅ ADD: detects if user is naming a style directly (for "make it minimalist" etc.)
function mentionsStyleKeyword(text = "") {
  return /\b(minimal(ist)?|industrial|japandi|scandinavian|scandi|modern|contemporary|boho|bohemian|luxury|rustic|farmhouse|coastal|beach)\b/.test(
    text
  );
}

function extractExplicitStyleName(text) {
  // Look for "style: X" or "to X style" or "make it X"
  const candidates = [
    { re: /\b(japandi)\b/, name: "Japandi" },
    { re: /\b(scandinavian|scandi)\b/, name: "Scandinavian" },
    { re: /\b(industrial)\b/, name: "Industrial" },
    { re: /\b(minimalist|minimal)\b/, name: "Minimalist" },
    { re: /\b(modern|contemporary)\b/, name: "Modern" },
    { re: /\b(bohemian|boho)\b/, name: "Bohemian" },
    { re: /\b(luxury|luxurious|high[-\s]?end|premium)\b/, name: "Luxury" },
    { re: /\b(rustic|farmhouse|country)\b/, name: "Rustic" },
    { re: /\b(coastal|beach)\b/, name: "Coastal" },
  ];

  // Only treat as explicit if the user is actually asking to change
  // handled by caller before invoking this helper.
  for (const c of candidates) {
    if (c.re.test(text)) return c.name;
  }
  return null;
}
