/**
 * ANALYZE ROOM / SPACE FROM USER MESSAGE
 * - Supports residential + commercial spaces
 * - Extracts size, type, usage, layout hints, lighting, windows, furniture
 * - Safe defaults if info is missing
 */
export function analyzeRoom(message = "") {
  const text = String(message || "").toLowerCase();

  /* ===============================
     Helpers
     =============================== */
  const hasWord = (w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(text);
  const hasAny = (arr) => arr.some((w) => new RegExp(escapeRegExp(w), "i").test(text));

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /* ===============================
     1) SIZE DETECTION
     =============================== */
  // Supports: 3x4, 3 x 4, 3m x 4m, 3.5×4, 3 by 4, 12 sqm, 12 m2
  let width = 4;
  let length = 4;
  let area = Number((width * length).toFixed(2));
  const unit = "meters";

  const dimMatch =
    text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:\*|times)\s*(\d+(?:\.\d+)?)/i);

  if (dimMatch) {
    width = clamp(parseFloat(dimMatch[1]), 1.5, 30);
    length = clamp(parseFloat(dimMatch[2]), 1.5, 30);
    area = Number((width * length).toFixed(2));
  } else {
    const areaMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sqm|sq\s*m|m2|square\s*meters?)\b/i);
    if (areaMatch) {
      const a = clamp(parseFloat(areaMatch[1]), 4, 500);
      area = Number(a.toFixed(2));
      const side = Math.sqrt(area);
      width = Number(side.toFixed(2));
      length = Number(side.toFixed(2));
    }
  }

  /* ===============================
     2) SPACE TYPE DETECTION
     =============================== */
  let type = "generic interior";
  let category = "residential";

  // NOTE: check "office" after "home office" keywords later (to avoid mislabeling)
  if (hasAny(["cafe", "coffee shop", "espresso bar"])) {
    type = "cafe";
    category = "commercial";
  } else if (hasAny(["restaurant", "diner", "bistro"])) {
    type = "restaurant";
    category = "commercial";
  } else if (hasAny(["boutique", "retail", "store", "shop"])) {
    type = "retail";
    category = "commercial";
  } else if (hasAny(["salon", "barbershop", "barber"])) {
    type = "salon";
    category = "commercial";
  } else if (hasAny(["clinic", "dental", "medical", "waiting area"])) {
    type = "clinic";
    category = "commercial";
  } else if (hasAny(["office", "workspace", "workstation", "startup"])) {
    type = "office";
    category = "commercial";
  }

  // Residential
  if (category === "residential") {
    if (hasWord("bedroom")) type = "bedroom";
    else if (hasAny(["living room", "living"])) type = "living";
    else if (hasWord("kitchen")) type = "kitchen";
    else if (hasAny(["bathroom", "toilet", "cr"])) type = "bathroom";
    else if (hasAny(["dining", "dining room"])) type = "dining";
    else if (hasAny(["home office", "study", "workspace"])) type = "office";
    else if (hasAny(["studio apartment", "studio"])) type = "studio";
    else if (hasAny(["laundry", "utility"])) type = "utility";
    else if (hasAny(["kids room", "nursery"])) type = "kids bedroom";
  }

  /* ===============================
     3) WINDOWS + LIGHTING (more accurate)
     =============================== */
  // If the user says "no window", don't set hasWindow true.
  const noWindow = hasAny(["no window", "windowless", "without window", "walang bintana"]);
  const hasWindow =
    !noWindow && hasAny(["window", "windows", "daylight", "natural light", "sunlight", "bintana"]);

  let windowSide = null;

  // English + Filipino hints
  if (hasAny(["window on the left", "left window", "window left", "bintana sa kaliwa", "kaliwa"])) {
    windowSide = "left";
  } else if (
    hasAny(["window on the right", "right window", "window right", "bintana sa kanan", "kanan"])
  ) {
    windowSide = "right";
  } else if (hasAny(["window in front", "front window", "bintana sa harap", "harap"])) {
    windowSide = "front";
  } else if (hasAny(["window behind", "back window", "bintana sa likod", "likod"])) {
    windowSide = "back";
  }

  // Lighting extraction (keep simple but consistent)
  let lighting = "ambient";
  if (noWindow) lighting = "ambient";
  if (hasAny(["ceiling light", "downlight", "recessed"])) lighting = "ambient + ceiling";
  if (hasAny(["pendant", "chandelier"])) lighting = "ambient + pendant";
  if (hasAny(["lamp", "floor lamp", "table lamp"])) lighting = "ambient + lamp";
  if (hasAny(["led strip", "cove lighting"])) lighting = "ambient + accent";
  if (hasAny(["task light", "desk lamp"])) lighting = "ambient + task";

  /* ===============================
     4) FURNITURE + FEATURES
     =============================== */
  const furnitureMap = [
    ["bed", ["bed", "mattress", "headboard", "kama"]],
    ["sofa", ["sofa", "couch", "sectional"]],
    ["tv", ["tv", "television"]],
    ["desk", ["desk", "study table", "work table", "study desk", "mesa", "lamesa"]],
    ["dining table", ["dining table", "table for dining", "mesa kainan"]],
    ["coffee table", ["coffee table"]],
    ["wardrobe", ["wardrobe", "closet", "cabinet", "aparador"]],
    ["shelves", ["shelf", "shelves", "rack"]],
    ["rug", ["rug", "carpet", "banig"]],
    ["plants", ["plant", "plants", "greenery", "halaman"]],
    ["mirror", ["mirror", "salamin"]],
    ["island", ["kitchen island", "island"]],
  ];

  const furniture = [];
  for (const [name, keys] of furnitureMap) {
    if (keys.some((k) => text.includes(k))) furniture.push(name);
  }

  /* ===============================
     5) CONSTRAINTS / GOALS
     =============================== */
  const constraints = [];
  if (hasAny(["small", "compact", "tiny", "maliit"])) constraints.push("compact space; avoid bulky pieces");
  if (hasAny(["keep it open", "more open", "open feel", "spacious", "maluwag"])) constraints.push("maintain openness and clear sightlines");
  if (hasAny(["storage", "organize", "clutter", "imbakan", "kalat"])) constraints.push("add storage and reduce clutter");
  if (hasAny(["kids", "child", "baby", "bata"])) constraints.push("safe edges; easy-to-clean materials");
  if (hasAny(["pets", "cat", "dog", "pusa", "aso"])) constraints.push("durable, stain-resistant fabrics");
  if (hasAny(["budget", "cheap", "affordable", "tipid"])) constraints.push("budget-friendly finishes and easy upgrades");

  /* ===============================
     6) MOOD / USE CASE
     =============================== */
  let mood =
    hasAny(["cozy", "warm", "homey"]) ? "cozy" :
    hasAny(["luxury", "luxurious", "elegant"]) ? "luxurious" :
    hasAny(["minimal", "minimalist", "clean"]) ? "minimal" :
    hasAny(["bright", "airy", "light", "maliwanag"]) ? "bright" :
    hasAny(["dark", "moody"]) ? "moody" :
    "neutral";

  let useCase = "general";
  if (hasAny(["study", "studying", "student", "homework", "aral"])) useCase = "study-focused";
  else if (hasAny(["sleep", "rest", "relax", "tulog", "pahinga"])) useCase = "rest-focused";
  else if (hasAny(["family", "guests", "entertain", "bisita"])) useCase = "social-focused";
  else if (category === "commercial" && hasAny(["clients", "customers", "customer"])) useCase = "customer-facing";

  /* ===============================
     7) CEILING HEIGHT (optional)
     =============================== */
  let ceilingHeight = category === "commercial" ? 3.0 : 2.7;

  const ceilMatch = text.match(/ceiling\s*(?:height)?\s*(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\b/i);
  if (ceilMatch) ceilingHeight = clamp(parseFloat(ceilMatch[1]), 2.2, 6);

  /* ===============================
     8) FINAL STRUCTURE
     =============================== */
  return {
    valid: true,

    // Core geometry
    type,        // normalized (bedroom/living/kitchen/office/cafe/retail/...)
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
  };
}
