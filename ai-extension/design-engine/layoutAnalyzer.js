/**
 * ANALYZE ROOM / SPACE FROM USER MESSAGE (MORE ACCURATE)
 * - Supports residential + commercial spaces
 * - Extracts: size, type, usage, layout hints, lighting, windows, furniture, constraints
 * - Normalizes type to match layoutGenerator.js (living_room, bedroom, home_office, coffee_shop, retail_store, kitchen, etc.)
 * - Converts ft/feet to meters
 */
export function analyzeRoom(message = "") {
  const raw = String(message || "");
  const text = raw.toLowerCase();

  /* ===============================
     Helpers
     =============================== */
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasWord = (w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(text);
  const hasAny = (arr) => arr.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(text));
  const hasAnyLoose = (arr) => arr.some((w) => new RegExp(escapeRegExp(w), "i").test(text));

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const toNumber = (v) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  // unit conversions
  const FT_TO_M = 0.3048;
  const IN_TO_M = 0.0254;

  /* ===============================
     1) SIZE DETECTION (better)
     =============================== */
  let width = 4;
  let length = 4;
  let unit = "meters";

  // Patterns:
  // - "3x4", "3 x 4", "3m x 4m", "3.5×4", "3 by 4"
  // - optionally "ft", "feet", "meters", "m"
  // We'll interpret the unit from nearby suffix if present, otherwise meters.
  const dimRegexes = [
    /(\d+(?:[.,]\d+)?)\s*(m|meter|meters|ft|feet|foot|in|inch|inches)?\s*(?:x|×|by|\*)\s*(\d+(?:[.,]\d+)?)\s*(m|meter|meters|ft|feet|foot|in|inch|inches)?/i,
  ];

  let dimMatch = null;
  for (const r of dimRegexes) {
    const m = text.match(r);
    if (m) {
      dimMatch = m;
      break;
    }
  }

  const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(sqm|sq\s*m|m2|square\s*meters?|sq\s*ft|ft2|square\s*feet)\b/i);

  // Convert dimension pair to meters, intelligently
  const parseDimsToMeters = (aStr, aUnit, bStr, bUnit) => {
    const a = toNumber(aStr);
    const b = toNumber(bStr);
    if (a == null || b == null) return null;

    const ua = (aUnit || "").toLowerCase();
    const ub = (bUnit || "").toLowerCase();

    const unitA = ua || ub; // if only one unit provided, apply to both
    const unitB = ub || ua;

    const conv = (val, u) => {
      if (!u) return val; // assume meters
      if (u.startsWith("m")) return val;
      if (u === "ft" || u === "feet" || u === "foot") return val * FT_TO_M;
      if (u === "in" || u === "inch" || u === "inches") return val * IN_TO_M;
      return val; // default meters
    };

    const am = conv(a, unitA);
    const bm = conv(b, unitB);

    // sanity clamp for rooms
    const w = clamp(am, 1.5, 30);
    const l = clamp(bm, 1.5, 30);
    return { width: w, length: l, unit: "meters" };
  };

  if (dimMatch) {
    const parsed = parseDimsToMeters(dimMatch[1], dimMatch[2], dimMatch[3], dimMatch[4]);
    if (parsed) {
      width = parsed.width;
      length = parsed.length;
      unit = parsed.unit;
    }
  } else if (areaMatch) {
    const a = toNumber(areaMatch[1]);
    const u = (areaMatch[2] || "").toLowerCase();

    if (a != null) {
      let areaM2 = a;

      // convert square feet -> m2
      if (u.includes("ft") || u.includes("feet")) {
        areaM2 = a * (FT_TO_M * FT_TO_M);
      }

      areaM2 = clamp(areaM2, 4, 500);
      const side = Math.sqrt(areaM2);
      width = clamp(side, 1.5, 30);
      length = clamp(side, 1.5, 30);
      unit = "meters";
    }
  }

  width = Number(width.toFixed(2));
  length = Number(length.toFixed(2));
  const area = Number((width * length).toFixed(2));

  /* ===============================
     2) SPACE TYPE DETECTION (normalized to layoutGenerator.js)
     =============================== */
  // IMPORTANT: Keep types consistent with layoutGenerator.js:
  // bedroom, living_room, kitchen, home_office, office, coffee_shop, retail_store, etc.
  let type = "unknown";
  let category = "residential";

  // Commercial detection (strong signals)
  const isCafe = hasAnyLoose(["cafe", "coffee shop", "espresso bar", "milktea", "milk tea"]);
  const isRestaurant = hasAnyLoose(["restaurant", "diner", "bistro", "eatery"]);
  const isRetail = hasAnyLoose(["boutique", "retail store", "retail", "store", "shop"]);
  const isSalon = hasAnyLoose(["salon", "barbershop", "barber"]);
  const isClinic = hasAnyLoose(["clinic", "dental", "medical", "waiting area", "reception"]);
  const isCommercialOffice = hasAnyLoose(["startup office", "workspace", "workstation", "open office", "office space"]);

  if (isCafe || isRestaurant || isRetail || isSalon || isClinic || isCommercialOffice) {
    category = "commercial";
    if (isCafe) type = "coffee_shop";
    else if (isRestaurant) type = "restaurant";
    else if (isRetail) type = "retail_store";
    else if (isSalon) type = "salon";
    else if (isClinic) type = "clinic";
    else type = "office";
  }

  // Residential overrides (only if not clearly commercial)
  if (category === "residential") {
    if (hasAny(["bedroom", "kwarto", "room"])) type = "bedroom";
    if (hasAnyLoose(["living room", "living"])) type = "living_room";
    if (hasAny(["kitchen", "kusina"])) type = "kitchen";
    if (hasAnyLoose(["bathroom", "toilet", "cr", "comfort room"])) type = "bathroom";
    if (hasAnyLoose(["dining room", "dining"])) type = "dining";
    if (hasAnyLoose(["home office", "study", "workspace"])) type = "home_office";
    if (hasAnyLoose(["studio apartment", "studio"])) type = "studio";
    if (hasAnyLoose(["laundry", "utility"])) type = "utility";
    if (hasAnyLoose(["kids room", "nursery"])) type = "kids_bedroom";
  }

  // fallback if still unknown but "office" appears
  if (type === "unknown" && hasAnyLoose(["office"])) type = category === "commercial" ? "office" : "home_office";

  /* ===============================
     3) WINDOWS + LIGHTING (more accurate)
     =============================== */
  const noWindow = hasAnyLoose(["no window", "windowless", "without window", "walang bintana", "wala bintana"]);
  const hasWindowMention = hasAnyLoose(["window", "windows", "bintana", "daylight", "natural light", "sunlight"]);

  const hasWindow = !noWindow && hasWindowMention;

  // Side should only be inferred if window is mentioned OR the phrase contains bintana/window nearby.
  // This reduces false positives from random "kaliwa/kanan/harap/likod".
  let windowSide = null;

  const windowContext = /(window|windows|bintana)/i.test(text);

  if (hasWindow && windowContext) {
    const sideRules = [
      { side: "left", patterns: ["window on the left", "left window", "window left", "bintana sa kaliwa"] },
      { side: "right", patterns: ["window on the right", "right window", "window right", "bintana sa kanan"] },
      { side: "front", patterns: ["window in front", "front window", "bintana sa harap"] },
      { side: "back", patterns: ["window behind", "back window", "bintana sa likod"] },
    ];

    for (const rule of sideRules) {
      if (rule.patterns.some((p) => text.includes(p))) {
        windowSide = rule.side;
        break;
      }
    }

    // weaker Filipino cues but require "bintana" near the side word
    if (!windowSide) {
      const near = (a, b) => new RegExp(`${escapeRegExp(a)}.{0,18}${escapeRegExp(b)}|${escapeRegExp(b)}.{0,18}${escapeRegExp(a)}`, "i");
      if (near("bintana", "kaliwa").test(raw)) windowSide = "left";
      else if (near("bintana", "kanan").test(raw)) windowSide = "right";
      else if (near("bintana", "harap").test(raw)) windowSide = "front";
      else if (near("bintana", "likod").test(raw)) windowSide = "back";
    }
  }

  let lighting = "ambient";
  if (noWindow) lighting = "ambient";
  if (hasAnyLoose(["ceiling light", "downlight", "recessed", "spotlight"])) lighting = "ambient + ceiling";
  if (hasAnyLoose(["pendant", "chandelier"])) lighting = "ambient + pendant";
  if (hasAnyLoose(["lamp", "floor lamp", "table lamp"])) lighting = "ambient + lamp";
  if (hasAnyLoose(["led strip", "cove lighting", "strip light"])) lighting = "ambient + accent";
  if (hasAnyLoose(["task light", "desk lamp"])) lighting = "ambient + task";

  /* ===============================
     4) FURNITURE + FEATURES (more robust)
     =============================== */
  // Use canonical names that align with LABEL_TO_ID keys (so later mapping is cleaner)
  const furnitureRules = [
    { name: "bed", keys: ["bed", "mattress", "headboard", "kama"] },
    { name: "sofa", keys: ["sofa", "couch", "sectional", "loveseat"] },
    { name: "accent chair", keys: ["armchair", "accent chair"] },
    { name: "chair", keys: ["chair", "upuan"] },
    { name: "tv", keys: ["tv", "television", "smart tv"] },
    { name: "coffee table", keys: ["coffee table", "center table"] },
    { name: "desk", keys: ["desk", "study table", "work table", "study desk", "mesa", "lamesa"] },
    { name: "nightstand", keys: ["nightstand", "bedside table"] },
    { name: "wardrobe", keys: ["wardrobe", "closet", "aparador"] },
    { name: "cabinet", keys: ["cabinet", "storage cabinet"] },
    { name: "bookshelf", keys: ["bookshelf", "shelf", "shelves"] },
    { name: "rug", keys: ["rug", "carpet", "banig"] },
    { name: "mirror", keys: ["mirror", "salamin"] },
    { name: "dining table", keys: ["dining table", "mesa kainan", "table for dining"] },
    { name: "dining chair", keys: ["dining chair"] },
    { name: "island", keys: ["kitchen island", "island"] },
    { name: "counter", keys: ["counter", "service counter"] },
    { name: "rack", keys: ["rack", "display rack"] },
    { name: "cashier", keys: ["cashier", "checkout"] },
  ];

  const furniture = [];
  for (const r of furnitureRules) {
    if (r.keys.some((k) => text.includes(k))) furniture.push(r.name);
  }

  /* ===============================
     5) CONSTRAINTS / GOALS
     =============================== */
  const constraints = [];
  if (hasAnyLoose(["small", "compact", "tiny", "maliit"])) constraints.push("compact space; avoid bulky pieces");
  if (hasAnyLoose(["keep it open", "more open", "open feel", "spacious", "maluwag"])) constraints.push("maintain openness and clear sightlines");
  if (hasAnyLoose(["storage", "organize", "clutter", "imbakan", "kalat"])) constraints.push("add storage and reduce clutter");
  if (hasAnyLoose(["kids", "child", "baby", "bata"])) constraints.push("safe edges; easy-to-clean materials");
  if (hasAnyLoose(["pets", "cat", "dog", "pusa", "aso"])) constraints.push("durable, stain-resistant fabrics");
  if (hasAnyLoose(["budget", "cheap", "affordable", "tipid"])) constraints.push("budget-friendly finishes and easy upgrades");

  /* ===============================
     6) MOOD / USE CASE
     =============================== */
  let mood =
    hasAnyLoose(["cozy", "warm", "homey"]) ? "cozy" :
    hasAnyLoose(["luxury", "luxurious", "elegant"]) ? "luxurious" :
    hasAnyLoose(["minimal", "minimalist", "clean"]) ? "minimal" :
    hasAnyLoose(["bright", "airy", "light", "maliwanag"]) ? "bright" :
    hasAnyLoose(["dark", "moody"]) ? "moody" :
    "neutral";

  let useCase = "general";
  if (hasAnyLoose(["study", "studying", "student", "homework", "aral"])) useCase = "study-focused";
  else if (hasAnyLoose(["sleep", "rest", "relax", "tulog", "pahinga"])) useCase = "rest-focused";
  else if (hasAnyLoose(["family", "guests", "entertain", "bisita"])) useCase = "social-focused";
  else if (category === "commercial" && hasAnyLoose(["clients", "customers", "customer"])) useCase = "customer-facing";

  /* ===============================
     7) CEILING HEIGHT
     =============================== */
  let ceilingHeight = category === "commercial" ? 3.0 : 2.7;

  const ceilMatch = text.match(/ceiling\s*(?:height)?\s*(\d+(?:[.,]\d+)?)\s*(m|meter|meters|ft|feet|foot)\b/i);
  if (ceilMatch) {
    const val = toNumber(ceilMatch[1]);
    const u = (ceilMatch[2] || "").toLowerCase();
    if (val != null) {
      let h = val;
      if (u === "ft" || u === "feet" || u === "foot") h = val * FT_TO_M;
      ceilingHeight = clamp(h, 2.2, 6);
    }
  }

  ceilingHeight = Number(ceilingHeight.toFixed(2));

  /* ===============================
     8) CONFIDENCE (simple heuristic)
     =============================== */
  let confidence = 0.55;
  if (dimMatch || areaMatch) confidence += 0.15;
  if (type !== "unknown") confidence += 0.15;
  if (hasWindowMention) confidence += 0.05;
  if (furniture.length) confidence += 0.1;
  confidence = clamp(Number(confidence.toFixed(2)), 0.3, 0.95);

  /* ===============================
     9) FINAL STRUCTURE
     =============================== */
  return {
    valid: true,

    // Core geometry
    type,        // normalized to layoutGenerator.js expectations
    category,    // residential | commercial
    width,
    length,
    area,
    unit,
    ceilingHeight,

    // Lighting + windows
    hasWindow,
    windowSide,
    lighting,

    // Semantic hints
    mood,
    useCase,
    furniture,
    constraints: constraints.length ? constraints.join("; ") : "no special constraints",

    // Diagnostics (optional)
    confidence,
    _debug: {
      dimParsed: Boolean(dimMatch || areaMatch),
      windowContextUsed: Boolean(hasWindow && windowContext),
    },
  };
}
