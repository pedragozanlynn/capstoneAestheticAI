/**
 * ANALYZE ROOM / SPACE FROM USER MESSAGE
 * - Supports residential + commercial spaces
 * - Extracts size, type, usage, layout hints, lighting, windows, furniture
 * - Safe defaults if info is missing
 */
export function analyzeRoom(message = "") {
  const text = (message || "").toLowerCase();

  /* ===============================
     Helpers
     =============================== */
  const hasWord = (w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(text);
  const hasAny = (arr) => arr.some((w) => hasWord(w));

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /* ===============================
     1️⃣ SIZE DETECTION
     =============================== */
  // Supports: 3x4, 3 x 4, 3m x 4m, 3.5×4, 3 by 4, 12 sqm, 12 m2
  let width = 4;
  let length = 4;
  let area = Number((width * length).toFixed(2));
  const unit = "meters";

  // dimension patterns
  const dimMatch =
    text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:\*|times)\s*(\d+(?:\.\d+)?)/i);

  if (dimMatch) {
    width = parseFloat(dimMatch[1]);
    length = parseFloat(dimMatch[2]);
    // sanity clamp to reduce weird inputs (e.g., “300x400” accidentally)
    width = clamp(width, 1.5, 30);
    length = clamp(length, 1.5, 30);
    area = Number((width * length).toFixed(2));
  } else {
    // area patterns: 12 sqm, 12 m2, 12 sq m
    const areaMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sqm|sq\s*m|m2|square\s*meters?)\b/i);
    if (areaMatch) {
      const a = clamp(parseFloat(areaMatch[1]), 4, 500);
      area = Number(a.toFixed(2));
      // keep default ratio but adapt dimensions
      const side = Math.sqrt(area);
      width = Number(side.toFixed(2));
      length = Number(side.toFixed(2));
    }
  }

  /* ===============================
     2️⃣ SPACE TYPE DETECTION (ROOM TYPE + CATEGORY)
     =============================== */
  let type = "generic interior";
  let category = "residential";

  // Commercial first (more specific)
  if (hasAny(["cafe", "coffee shop", "coffee", "espresso bar"])) {
    type = "cafe interior";
    category = "commercial";
  } else if (hasAny(["restaurant", "diner", "bistro"])) {
    type = "restaurant interior";
    category = "commercial";
  } else if (hasAny(["shop", "store", "retail", "boutique"])) {
    type = "retail store interior";
    category = "commercial";
  } else if (hasAny(["salon", "barbershop", "barber"])) {
    type = "beauty salon interior";
    category = "commercial";
  } else if (hasAny(["clinic", "dental", "medical", "waiting area"])) {
    type = "clinic interior";
    category = "commercial";
  } else if (hasAny(["office", "workspace", "workstation", "startup"])) {
    type = "office interior";
    category = "commercial";
  }

  // Residential (if not overridden by commercial)
  if (category === "residential") {
    if (hasWord("bedroom")) type = "bedroom";
    else if (hasAny(["living room", "living"])) type = "living room";
    else if (hasWord("kitchen")) type = "kitchen";
    else if (hasWord("bathroom") || hasWord("toilet") || hasWord("cr")) type = "bathroom";
    else if (hasAny(["dining", "dining room"])) type = "dining room";
    else if (hasAny(["home office", "workspace", "study"])) type = "home office";
    else if (hasAny(["studio", "studio apartment"])) type = "studio apartment";
    else if (hasAny(["laundry", "utility"])) type = "utility room";
    else if (hasAny(["kids room", "nursery"])) type = "kids bedroom";
  }

  /* ===============================
     3️⃣ WINDOWS + LIGHTING
     =============================== */
  const hasWindow = hasAny(["window", "daylight", "natural light", "sunlight"]);
  let windowSide = null;

  if (hasAny(["window on the left", "left window", "window left"])) windowSide = "left";
  else if (hasAny(["window on the right", "right window", "window right"])) windowSide = "right";
  else if (hasAny(["window in front", "front window"])) windowSide = "front";
  else if (hasAny(["window behind", "back window"])) windowSide = "back";

  // Lighting type extraction
  let lighting = "ambient";
  if (hasAny(["no window", "windowless"])) lighting = "ambient";
  if (hasAny(["ceiling light", "downlight", "recessed"])) lighting = "ambient + ceiling";
  if (hasAny(["pendant", "chandelier"])) lighting = "ambient + pendant";
  if (hasAny(["lamp", "floor lamp", "table lamp"])) lighting = "ambient + lamp";
  if (hasAny(["led strip", "cove lighting"])) lighting = "ambient + accent";
  if (hasAny(["task light", "desk lamp"])) lighting = "ambient + task";

  /* ===============================
     4️⃣ FURNITURE + FEATURES (makes prompts unique)
     =============================== */
  const furnitureMap = [
    ["bed", ["bed", "mattress", "headboard"]],
    ["sofa", ["sofa", "couch", "sectional"]],
    ["tv", ["tv", "television"]],
    ["desk", ["desk", "study table", "work table"]],
    ["dining table", ["dining table", "table for dining"]],
    ["coffee table", ["coffee table"]],
    ["wardrobe", ["wardrobe", "closet", "cabinet"]],
    ["shelves", ["shelf", "shelves", "rack"]],
    ["rug", ["rug", "carpet"]],
    ["plants", ["plant", "plants", "greenery"]],
    ["mirror", ["mirror"]],
    ["island", ["kitchen island", "island"]],
  ];

  const furniture = [];
  for (const [name, keys] of furnitureMap) {
    if (keys.some((k) => text.includes(k))) furniture.push(name);
  }

  /* ===============================
     5️⃣ CONSTRAINTS / GOALS
     =============================== */
  const constraints = [];
  if (hasAny(["small", "compact", "tiny"])) constraints.push("compact space; avoid bulky pieces");
  if (hasAny(["keep it open", "more open", "open feel", "spacious"])) constraints.push("maintain openness and clear sightlines");
  if (hasAny(["storage", "organize", "clutter"])) constraints.push("add storage and reduce clutter");
  if (hasAny(["kids", "child", "baby"])) constraints.push("safe edges; easy-to-clean materials");
  if (hasAny(["pets", "cat", "dog"])) constraints.push("durable, stain-resistant fabrics");
  if (hasAny(["budget", "cheap", "affordable"])) constraints.push("budget-friendly finishes and easy upgrades");

  /* ===============================
     6️⃣ MOOD / USE CASE
     =============================== */
  let mood =
    hasAny(["cozy", "warm"]) ? "cozy" :
    hasAny(["luxury", "luxurious", "elegant"]) ? "luxurious" :
    hasAny(["minimal", "minimalist", "clean"]) ? "minimal" :
    hasAny(["bright", "airy", "light"]) ? "bright" :
    hasAny(["dark", "moody"]) ? "moody" :
    "neutral";

  let useCase = "general";
  if (hasAny(["study", "studying", "student", "homework"])) useCase = "study-focused";
  else if (hasAny(["sleep", "rest", "relax"])) useCase = "rest-focused";
  else if (hasAny(["family", "guests", "entertain"])) useCase = "social-focused";
  else if (category === "commercial" && hasAny(["clients", "customers"])) useCase = "customer-facing";

  /* ===============================
     7️⃣ CEILING HEIGHT (optional)
     =============================== */
  // default residential; commercial slightly higher if mentioned
  let ceilingHeight = 2.7;
  if (category === "commercial") ceilingHeight = 3.0;
  const ceilMatch = text.match(/ceiling\s*(?:height)?\s*(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b/i);
  if (ceilMatch) ceilingHeight = clamp(parseFloat(ceilMatch[1]), 2.2, 6);

  /* ===============================
     8️⃣ FINAL STRUCTURE
     =============================== */
  return {
    valid: true,

    // Core geometry
    type,
    category,
    width,
    length,
    area,
    unit,
    ceilingHeight,

    // Lighting + windows
    hasWindow,
    windowSide,
    lighting,

    // Semantic hints for prompt uniqueness
    mood,
    useCase,
    furniture,
    constraints: constraints.length ? constraints.join("; ") : "no special constraints",
  };
}
