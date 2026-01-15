/**
 * ANALYZE ROOM / SPACE FROM USER MESSAGE
 * - Supports residential + commercial spaces
 * - Extracts size, type, usage
 * - Safe defaults if info is missing
 */
export function analyzeRoom(message = "") {
  const text = message.toLowerCase();

  /* ===============================
     1️⃣ SIZE DETECTION
     =============================== */
  // Matches: 3x4, 3 x 4, 3m x 4m
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m)?\s*x\s*(\d+(?:\.\d+)?)/);

  let width = 4;
  let length = 4;

  if (sizeMatch) {
    width = parseFloat(sizeMatch[1]);
    length = parseFloat(sizeMatch[2]);
  }

  /* ===============================
     2️⃣ SPACE TYPE DETECTION
     =============================== */
  let type = "generic interior";
  let category = "residential";

  if (text.includes("bedroom")) type = "bedroom";
  else if (text.includes("living")) type = "living room";
  else if (text.includes("kitchen")) type = "kitchen";
  else if (text.includes("bathroom")) type = "bathroom";
  else if (text.includes("dining")) type = "dining room";
  else if (text.includes("office") || text.includes("workspace")) type = "home office";
  else if (text.includes("studio")) type = "studio apartment";

  // Commercial / business
  if (
    text.includes("cafe") ||
    text.includes("restaurant") ||
    text.includes("coffee")
  ) {
    type = "cafe interior";
    category = "commercial";
  }

  if (text.includes("shop") || text.includes("store")) {
    type = "retail store interior";
    category = "commercial";
  }

  if (text.includes("salon")) {
    type = "beauty salon interior";
    category = "commercial";
  }

  /* ===============================
     3️⃣ QUALITY FLAGS (FOR AI PROMPTS)
     =============================== */
  const hasWindow =
    text.includes("window") || text.includes("daylight") || text.includes("natural light");

  const mood =
    text.includes("cozy")
      ? "cozy"
      : text.includes("luxury")
      ? "luxurious"
      : text.includes("minimal")
      ? "minimal"
      : "neutral";

  /* ===============================
     4️⃣ FINAL STRUCTURE
     =============================== */
  return {
    valid: true,

    // Core geometry
    type,
    category,
    width,
    length,
    area: Number((width * length).toFixed(2)),
    unit: "meters",

    // AI prompt helpers
    hasWindow,
    mood,

    // Useful defaults for rendering
    ceilingHeight: 2.7, // meters (standard residential)
  };
}
