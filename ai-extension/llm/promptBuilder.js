// buildInteriorPrompt.js
// ✅ UPDATED to integrate with your classifier output (spaceType + room.type = roomType snake_case)
// ✅ FIX: balcony vs bedroom drift
// ✅ FIX: living_room TV becomes REQUIRED only when user/layout mentions TV/console
// ✅ FIX: "terrace/lanai/roof deck" normalization → balcony/roof_deck
// ✅ NEW FIX (KIDS ROOM BUG):
//    - if user asks "kids/child/children" + roomKey === bedroom -> treat as kids_bedroom
//    - enforce kids-scale bed + desk + toy storage
//    - strong negatives to prevent adult/master bedroom drift
// ✅ NEW FIX (MISSING HOUSE PARTS SUPPORT):
//    - adds service_area + maids_room catalogs + routing aliases + negatives
//    - adds PH/Taglish aliases (kwarto/sala/kusina/etc.) to avoid drift
// ✅ Keeps your strict layout + palette logic intact (no unrelated UI/style changes)

/**
 * buildInteriorPrompt({ room, style, palette, userMessage, previousPrompt, isEdit, spaceType, layoutSuggestions, forceFixedCamera })
 */
export function buildInteriorPrompt({
  room,
  style,
  palette,
  userMessage,
  previousPrompt,
  isEdit = false,

  // ✅ from classifier/orchestrator: "residential" | "commercial"
  spaceType,

  // ✅ from orchestrator
  layoutSuggestions = [],
  forceFixedCamera = true,
}) {
  const safeMessage = String(userMessage || "").trim();

  const paletteNames = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.name).filter(Boolean)
    : [];

  const paletteHexes = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.hex).filter(Boolean)
    : [];

  // ✅ NEW: kids intent detector (minimal)
  const lcMsg = safeMessage.toLowerCase();
  const isKidsIntent = /\b(kids|kid|child|children|pang\s*bata|pambata|for\s*kids|for\s*child)\b/i.test(
    lcMsg
  );

  const baseQuality = `
photorealistic interior photograph,
ultra realistic,
high detail,
sharp focus,
real materials and textures,
professional interior photography,
no illustration,
no sketch,
no drawing,
no CGI look,
no text,
no watermark,
no logo
`.trim();

  const absoluteLock = `
ABSOLUTE LOCK:
- Same camera angle and height
- Same perspective and framing
- Same room layout and proportions
- Same furniture placement
- Do NOT redesign the room
`.trim();

  const hasLayout = Array.isArray(layoutSuggestions) && layoutSuggestions.length > 0;

  const strictLayoutBlock = hasLayout
    ? `
STRICT LAYOUT PLACEMENT RULES (MUST FOLLOW):
${layoutSuggestions.map((s) => `- ${String(s).trim()}`).join("\n")}

LAYOUT CONSISTENCY:
- Keep walkways clear and realistic
- Keep furniture scale believable for the stated room size
`.trim()
    : "";

  const strictPaletteBlock =
    paletteHexes.length || paletteNames.length
      ? `
STRICT COLOR PALETTE (MUST FOLLOW):
- Use ONLY these palette colors as dominant accents and materials.
- Avoid random colors outside the palette.

PALETTE HEX:
${
  paletteHexes.length
    ? paletteHexes
        .slice(0, 8)
        .map((h) => `- ${String(h).toUpperCase()}`)
        .join("\n")
    : "- (no hex provided)"
}

PALETTE NAMES:
${
  paletteNames.length
    ? paletteNames.slice(0, 12).map((n) => `- ${n}`).join("\n")
    : "- neutral tones"
}
`.trim()
      : "";

  // ✅ NEW: Extra-strong palette enforcement to prevent neutral-only outputs
  const paletteEnforcementBlock = buildPaletteEnforcementBlock(palette);

  /* ===============================
     ✅ Signals (aligned to classifier)
     =============================== */
  const roomTypeRaw = room?.type || "unknown";
  const normalizedSpaceType = normalizeSpaceType(spaceType);

  const width = room?.width ?? 4;
  const length = room?.length ?? 4;
  const area = room?.area ?? Number((width * length).toFixed(2));
  const ceilingHeight = room?.ceilingHeight ?? 2.7;

  const hasWindow = typeof room?.hasWindow === "boolean" ? room.hasWindow : true;
  const windowSide = room?.windowSide || (hasWindow ? "left" : "none");
  const lighting = room?.lighting || (hasWindow ? "ambient + natural" : "ambient");

  const constraints = room?.constraints || "no special constraints";
  const useCase =
    room?.useCase || (normalizedSpaceType === "commercial" ? "small business" : "general");
  const mood = room?.mood || style?.mood || "neutral";

  const materialsLine = room?.materialNotes
    ? room.materialNotes
    : `Mix of ${style?.materials?.join(", ") || "light wood, linen fabric, matte metal"}; avoid glossy plastic`;

  /* ===============================
     ✅ OBJECT CATALOG (Home + Small Business only)
     =============================== */
  const OBJECT_CATALOG = {
    // Residential
    living_room: [
      "sofa or sectional",
      "coffee table",
      "tv console / media console (optional unless user requested TV)",
      "television (visible) (optional unless user requested TV)",
      "area rug (optional)",
      "side table (optional)",
      "accent chair (optional)",
      "floor lamp or table lamp (optional)",
      "wall art (optional)",
      "indoor plants (optional)",
    ],

    // ✅ NEW: kids bedroom (prevents adult/master bedroom drift)
    kids_bedroom: [
      "child-sized bed or bunk bed (NOT king/queen)",
      "kids desk + chair",
      "toy storage (bins/shelves)",
      "wardrobe / closet (optional)",
      "soft area rug (optional)",
      "kid-friendly lighting (optional)",
      "playful but controlled accents (optional)",
    ],

    bedroom: [
      "bed",
      "nightstand",
      "wardrobe / closet",
      "dresser (optional)",
      "area rug (optional)",
      "desk + chair (optional)",
    ],

    home_office: [
      "desk",
      "office chair",
      "storage (shelves or cabinet)",
      "task lamp (optional)",
      "area rug (optional)",
    ],

    kitchen: [
      "base cabinets",
      "countertop",
      "sink",
      "cooktop / stove",
      "backsplash (optional)",
      "range hood (optional)",
      "refrigerator (optional)",
      "kitchen island (optional)",
      "bar stools (optional if island)",
    ],

    pantry: ["pantry shelving", "organized food storage", "storage containers (optional)"],

    dining_room: [
      "dining table",
      "dining chairs",
      "pendant light / chandelier (optional)",
      "area rug (optional)",
      "sideboard / buffet (optional)",
    ],

    bathroom: ["vanity", "mirror", "toilet", "shower area or bathtub", "storage shelves (optional)"],

    laundry_room: ["washer", "dryer (optional)", "counter/folding area", "storage shelves", "laundry basket (optional)"],

    walk_in_closet: ["closet system (shelves + hanging rods)", "shoe storage", "full-length mirror (optional)", "bench (optional)"],

    kids_playroom: ["kids storage (bins/shelves)", "play mat (optional)", "kids table + chair (optional)", "toys (optional)"],

    storage_room: ["storage shelves", "stackable bins/boxes", "clear floor pathway"],

    // ✅ NEW: Service Area (utility)
    service_area: [
      "utility counter or work surface",
      "storage shelves/cabinets",
      "cleaning tools storage (optional)",
      "clear walkway",
    ],

    // ✅ NEW: Maids/Helper room
    maids_room: [
      "single bed (or bunk bed if shared)",
      "small wardrobe or storage cabinet",
      "small side table (optional)",
      "simple lighting",
    ],

    entryway: ["shoe storage (rack/cabinet)", "bench (optional)", "console table (optional)", "mirror (optional)"],

    hallway: ["hallway lighting", "wall decor (optional)", "runner rug (optional)"],

    stairs_area: ["staircase", "handrail/railing", "stair lighting"],

    // ✅ Outdoor
    balcony: ["outdoor seating", "outdoor side table (optional)", "plants (optional)", "railings/guardrail (visible)"],
    patio: ["outdoor seating", "outdoor side table (optional)", "plants (optional)", "outdoor flooring (visible)"],
    roof_deck: ["outdoor seating", "deck surface", "plants (optional)", "shade element (optional)", "railings/guardrail (visible)"],
    garden: ["landscaping/greenery", "pathway (optional)", "outdoor seating (optional)"],
    garage: ["parking bay", "tool/storage wall (optional)", "shelving (optional)"],
    studio_apartment: ["sleeping zone (bed or sofa bed)", "compact seating", "compact dining/work surface (optional)", "storage"],
    residential_generic: ["primary seating", "storage", "lighting fixture", "area rug (optional)", "side table (optional)"],

    // Small business (commercial)
    sari_sari_store: ["service counter", "display shelves", "product display (organized)", "signage area (optional, no readable text)"],
    retail_store: ["display racks", "display shelves", "checkout counter", "feature display table (optional)", "fitting area (optional if clothing store)"],
    bakery: ["display case", "service counter", "menu board area (optional, no readable text)", "packaging/ordering zone"],
    milktea_shop: ["order counter", "prep bar (behind counter)", "menu board area (optional, no readable text)", "seating (optional depending on size)"],
    coffee_shop: ["order counter", "espresso/prep bar (behind counter)", "seating (tables + chairs)", "menu board area (optional, no readable text)"],
    restaurant: ["tables", "chairs/booths", "service counter (optional)", "simple service circulation path"],
    computer_shop: ["computer stations (rows)", "chairs", "cashier counter (optional)", "cable management / clean wiring look"],
    printing_shop: ["service counter", "work table", "printer/copier zone", "display shelves (optional)"],
    laundry_shop: ["washing machines", "folding counter", "waiting bench (optional)", "service counter (optional)"],
    pharmacy: ["service counter", "medicine display shelves (behind counter)", "customer waiting space (small)", "storage (optional)"],
    commercial_generic: ["customer area", "display/storage", "clear circulation", "service counter (optional)"],

    generic_interior: ["primary seating", "storage", "lighting fixture", "area rug (optional)", "side table (optional)"],
  };

  /* ===============================
     ✅ Room normalization (classifier-aligned)
     =============================== */
  const ROOM_ALIASES = {
    // Residential legacy
    living: "living_room",
    livingroom: "living_room",
    office: "home_office",
    study: "home_office",

    // ✅ PH/Taglish room aliases (prevents drift)
    tulugan: "bedroom",
    kwarto: "bedroom",
    silid: "bedroom",
    sala: "living_room",
    kusina: "kitchen",
    kainan: "dining_room",
    banyo: "bathroom",
    palikuran: "bathroom",
    labahan: "laundry_room",
    bodega: "storage_room",
    damitan: "walk_in_closet",
    hagdan: "stairs_area",
    garahe: "garage",
    bakuran: "garden",

    // ✅ Service/Maid aliases
    "service area": "service_area",
    "utility area": "service_area",
    "service kitchen": "service_area",
    "maids room": "maids_room",
    "maid's room": "maids_room",
    "helper room": "maids_room",
    "house helper room": "maids_room",

    // ✅ Outdoor synonyms → correct buckets
    terrace: "balcony",
    lanai: "balcony",
    veranda: "balcony",
    rooftop: "roof_deck",
    "roof top": "roof_deck",

    // Small business legacy
    cafe: "coffee_shop",
    coffee: "coffee_shop",
    store: "retail_store",

    // Generic
    generic: "generic_interior",
    unknown: "unknown",
  };

  function normalizeRoomKey(t) {
    const k = String(t || "unknown").toLowerCase().trim();
    const aliased = ROOM_ALIASES[k] || k;

    if (!aliased || aliased === "unknown") {
      return normalizedSpaceType === "commercial" ? "commercial_generic" : "residential_generic";
    }

    if (!OBJECT_CATALOG[aliased]) {
      return normalizedSpaceType === "commercial" ? "commercial_generic" : "residential_generic";
    }

    return aliased;
  }

  let roomKey = normalizeRoomKey(roomTypeRaw);

  // ✅ NEW: If classifier says bedroom but user asked kids room, use kids_bedroom catalog
  if (roomKey === "bedroom" && isKidsIntent) {
    roomKey = "kids_bedroom";
  }

  // ✅ Detect outdoor so we can prevent bed/wardrobe drift
  const isOutdoorRoom =
    roomKey === "balcony" || roomKey === "patio" || roomKey === "roof_deck" || roomKey === "garden";

  /* ===============================
     ✅ Lighting line (outdoor-aware)
     =============================== */
  const lightingLine = isOutdoorRoom
    ? `Outdoor natural light, realistic sky bounce; ${lighting || "daylight"}`
    : hasWindow
    ? `Natural light from ${windowSide} side window + ${lighting}`
    : `No direct window light; rely on ${lighting}`;

  /* ===============================
     ✅ Required objects extraction
     =============================== */
  const OBJECT_KEYWORDS = [
    // Residential
    { keys: ["tv console", "media console", "tv stand"], obj: "tv console / media console" },
    { keys: ["tv", "television"], obj: "television (visible)" },
    { keys: ["rug", "area rug"], obj: "area rug" },
    { keys: ["sofa", "sectional", "couch"], obj: "sofa or sectional" },
    { keys: ["coffee table"], obj: "coffee table" },
    { keys: ["wardrobe", "closet"], obj: "wardrobe / closet" },
    { keys: ["bed"], obj: "bed" },
    { keys: ["nightstand"], obj: "nightstand" },
    { keys: ["desk"], obj: "desk" },
    { keys: ["sink"], obj: "sink" },
    { keys: ["stove", "cooktop", "range"], obj: "cooktop / stove" },
    { keys: ["island"], obj: "kitchen island (optional)" },
    { keys: ["dining table"], obj: "dining table" },
    { keys: ["toilet"], obj: "toilet" },
    { keys: ["shower", "bathtub", "tub"], obj: "shower area or bathtub" },
    { keys: ["washer"], obj: "washer" },

    // ✅ NEW: service/maid keywords
    { keys: ["service area", "utility area", "service kitchen"], obj: "utility counter or work surface" },
    { keys: ["cleaning", "mop", "walis", "linis"], obj: "cleaning tools storage (optional)" },
    { keys: ["maid", "helper", "house helper"], obj: "single bed (or bunk bed if shared)" },

    // ✅ NEW: kids hints -> push kids objects
    { keys: ["kids", "kid", "child", "children", "pambata", "pang bata"], obj: "toy storage (bins/shelves)" },
    { keys: ["bunk", "bunk bed"], obj: "child-sized bed or bunk bed (NOT king/queen)" },
    { keys: ["study", "desk"], obj: "kids desk + chair" },

    // Outdoor
    { keys: ["balcony", "balkonahe", "terrace", "lanai", "veranda"], obj: "railings/guardrail (visible)" },
    { keys: ["outdoor chair", "outdoor seating"], obj: "outdoor seating" },
    { keys: ["plants", "planters"], obj: "plants (optional)" },

    // Small business
    { keys: ["counter", "cashier", "checkout"], obj: "service counter" },
    { keys: ["shelves", "shelf"], obj: "display shelves" },
    { keys: ["rack", "racks"], obj: "display racks" },
    { keys: ["display case"], obj: "display case" },
    { keys: ["machines", "washing machine"], obj: "washing machines" },
    { keys: ["computer", "pcs", "stations"], obj: "computer stations (rows)" },
    { keys: ["printer", "copier", "xerox"], obj: "printer/copier zone" },
    { keys: ["menu"], obj: "menu board area (optional, no readable text)" },
  ];

  function extractRequiredObjects({ userText = "", layoutList = [], roomKeyLocal = "generic_interior" }) {
    const src = `${userText}\n${layoutList.join("\n")}`.toLowerCase();
    const required = new Set();

    const baseline = OBJECT_CATALOG[roomKeyLocal] || OBJECT_CATALOG.generic_interior;

    // ✅ For living room: keep TV items optional unless explicitly requested
    if (roomKeyLocal === "living_room") {
      for (const o of baseline) {
        if (String(o).toLowerCase().includes("television") || String(o).toLowerCase().includes("tv console")) continue;
        required.add(o);
      }
    } else {
      baseline.forEach((o) => required.add(o));
    }

    for (const rule of OBJECT_KEYWORDS) {
      if (rule.keys.some((k) => src.includes(String(k).toLowerCase()))) required.add(rule.obj);
    }

    // ✅ Only enforce TV if user asked for it
    const userWantsTV =
      src.includes("tv") ||
      src.includes("television") ||
      src.includes("tv console") ||
      src.includes("media console");

    if (roomKeyLocal === "living_room" && userWantsTV) {
      required.add("tv console / media console");
      required.add("television (visible)");
    }

    // ✅ Outdoor rooms: explicitly disallow indoor bedroom core objects via "required"
    if (roomKeyLocal === "balcony" || roomKeyLocal === "patio" || roomKeyLocal === "roof_deck") {
      required.delete("bed");
      required.delete("nightstand");
      required.delete("wardrobe / closet");
    }

    // ✅ Kids bedroom: remove adult bedroom drift if any leaked
    if (roomKeyLocal === "kids_bedroom") {
      required.delete("bed");
      required.add("child-sized bed or bunk bed (NOT king/queen)");
      required.add("kids desk + chair");
      required.add("toy storage (bins/shelves)");
    }

    return Array.from(required);
  }

  const requiredObjects = extractRequiredObjects({
    userText: safeMessage,
    layoutList: layoutSuggestions,
    roomKeyLocal: roomKey,
  });

  const requiredObjectsBlock = requiredObjects.length
    ? `
REQUIRED OBJECTS (MUST BE PRESENT AND VISIBLE IN FRAME):
${requiredObjects.map((o) => `- ${o}`).join("\n")}

VISIBILITY RULES:
- Use wide framing that shows all required objects clearly.
- Keep objects unobstructed and realistically spaced.
`.trim()
    : "";

  /* ===============================
     ✅ Negative constraints (space + room)
     =============================== */
  const spaceDriftNegatives =
    normalizedSpaceType === "commercial"
      ? "no bed, no wardrobe, no home living-room TV staging, no residential kitchen-only scene"
      : "no cashier counter, no retail racks, no checkout counter, no store-like product displays";

  const outdoorNegatives = isOutdoorRoom
    ? "no bed, no wardrobe, no indoor bedroom scene, no indoor ceiling fixtures, no closed-room walls; must read as outdoor/semI-outdoor space"
    : "";

  // ✅ kids bedroom negatives (strong)
  const kidsBedroomNegatives =
    roomKey === "kids_bedroom"
      ? "no king-size bed, no queen-size bed, no hotel-style master bedroom headboard, no luxury adult bedroom staging, no dark moody master suite look; must read clearly as a child/teen room"
      : "";

  const roomSpecificNegatives =
    roomKey === "living_room"
      ? "no bed, no wardrobe, no kitchen island, no sink, no retail racks, no cashier counter"
      : roomKey === "bedroom"
      ? "no living-room tv console + sofa composition, no kitchen island, no retail racks, no cashier counter"
      : roomKey === "kids_bedroom"
      ? "no master-bedroom staging, no hotel headboard, no king bed; include kids-scale bed + study + toy storage"
      : roomKey === "kitchen"
      ? "no bed, no wardrobe, no living-room tv console + sofa composition, no retail racks"
      : roomKey === "bathroom"
      ? "no sofa, no tv console, no kitchen island, no retail racks"
      : roomKey === "service_area"
      ? "no sofa living-room staging, no tv console focus, no full bedroom suite; must read as a utility/service area"
      : roomKey === "maids_room"
      ? "no luxury master-bedroom staging, no king/queen bed dominance, no hotel headboard; must read as simple helper/maid room"
      : roomKey === "balcony" || roomKey === "patio" || roomKey === "roof_deck"
      ? "no bed, no wardrobe, no indoor walls, no indoor bedroom staging; include railing/guardrail and outdoor light"
      : roomKey === "sari_sari_store"
      ? "no bed, no sofa-living-room staging, no wardrobe, no home dining setup"
      : roomKey === "retail_store"
      ? "no bed, no sofa-living-room staging, no home kitchen-only scene"
      : roomKey === "coffee_shop" || roomKey === "milktea_shop" || roomKey === "bakery"
      ? "no bed, no wardrobe, no home living-room TV staging, no readable text on menu boards"
      : "no unintended room type changes";

  const negativeBlock = `
NEGATIVE CONSTRAINTS:
- no text, no watermark, no labels, no readable signage
- no empty scene, no missing key furniture
- ${spaceDriftNegatives}
- ${roomSpecificNegatives}
${kidsBedroomNegatives ? `- ${kidsBedroomNegatives}` : ""}
${outdoorNegatives ? `- ${outdoorNegatives}` : ""}
`.trim();

  const furnitureList =
    Array.isArray(room?.furniture) && room.furniture.length
      ? room.furniture.join(", ")
      : inferFurnitureDefaults(roomKey, normalizedSpaceType);

  /* ===============================
     Camera preset (outdoor-aware)
     =============================== */
  const signature = stableHash(safeMessage);

  const emphases = [
    "light flow",
    "material contrast",
    "spatial openness",
    "furniture proportion",
    "mood and atmosphere",
    "storage efficiency",
    "circulation/walkway clarity",
    "accent layering",
  ];
  const emphasis = emphases[signature % emphases.length];

  const cameraPreset =
    forceFixedCamera && hasLayout
      ? {
          angle: "eye-level",
          lens: "24–28mm wide-angle",
          framing: isOutdoorRoom
            ? "wide view showing outdoor railing/guardrail + seating clearly"
            : "wide corner-to-corner view showing the whole layout clearly",
          height: "1.5m",
        }
      : pickCameraPreset(emphasis);

  /* ===============================
     ✅ EDIT MODE
     =============================== */
  if (isEdit && previousPrompt) {
    return {
      emphasis: "edit-only",
      prompt: `
${previousPrompt}

STRICT IMAGE EDIT MODE.
REFERENCE IMAGE IS THE SOURCE OF TRUTH.

${absoluteLock}

${strictLayoutBlock ? strictLayoutBlock : ""}
${strictPaletteBlock ? strictPaletteBlock : ""}
${paletteEnforcementBlock ? paletteEnforcementBlock : ""}
${requiredObjectsBlock ? requiredObjectsBlock : ""}

${negativeBlock}

ONLY APPLY THIS CHANGE:
"${safeMessage}"

${baseQuality}
`.trim(),
    };
  }

  if (isEdit && !previousPrompt) {
    return {
      emphasis: "edit-only",
      prompt: `
PHOTOREALISTIC INTERIOR PHOTO EDIT (IMG2IMG).

REFERENCE IMAGE IS THE SOURCE OF TRUTH.
Preserve the identity of the original room.

${absoluteLock}

${strictLayoutBlock ? strictLayoutBlock : ""}
${strictPaletteBlock ? strictPaletteBlock : ""}
${paletteEnforcementBlock ? paletteEnforcementBlock : ""}
${requiredObjectsBlock ? requiredObjectsBlock : ""}

${negativeBlock}

EDIT GOAL:
- Keep the same room structure (walls, doors, windows)
- Keep the same layout and furniture positions
- Only change: style, materials, finishes, color, lighting, decor
- No new architecture, no new room

SPACE TYPE:
${normalizedSpaceType}

ROOM TYPE:
${roomKey}

STYLE TARGET:
${style?.name || "Modern"}

ONLY APPLY THIS CHANGE:
"${safeMessage}"

${baseQuality}
`.trim(),
    };
  }

  /* ===============================
     ✅ GENERATE MODE (TEXT2IMG)
     =============================== */
  const prompt = `
PHOTOREALISTIC INTERIOR PHOTOGRAPH.

SPACE:
- Space type: ${normalizedSpaceType}
- Room type: ${roomKey}
- Use case: ${useCase}

STYLE DIRECTION:
${style?.name || "Modern"}

USER REQUEST (HIGHEST PRIORITY):
"${safeMessage}"

${strictLayoutBlock ? strictLayoutBlock : ""}
${strictPaletteBlock ? strictPaletteBlock : ""}
${paletteEnforcementBlock ? paletteEnforcementBlock : ""}
${requiredObjectsBlock ? requiredObjectsBlock : ""}

${negativeBlock}

DESIGN FACTS:
- Size: ${length} x ${width} meters (approx), area ${area} sqm
- Ceiling height: ${ceilingHeight}m
- Mood target: ${mood}
- Key furniture present: ${furnitureList}
- Constraints: ${constraints}

LIGHTING CONDITIONS:
- ${lightingLine}

MATERIAL DIRECTION:
- ${materialsLine}

DESIGN EMPHASIS:
- Primary focus: ${emphasis}

CAMERA:
- Angle: ${cameraPreset.angle}
- Lens: ${cameraPreset.lens}
- Framing: ${cameraPreset.framing}
- Height: ${cameraPreset.height}

DESIGN RULES:
- Follow user request exactly
- Follow layout placement rules exactly (if provided)
- Follow palette exactly (if provided)
- All REQUIRED OBJECTS must be visible in the final image
- Realistic proportions and believable staging
- No diagrams, no labels, no text overlay

${baseQuality}
`.trim();

  return { prompt, emphasis };
}

/* ===============================
   Helpers
   =============================== */

function normalizeSpaceType(spaceType) {
  const s = String(spaceType || "").toLowerCase().trim();
  return s === "commercial" ? "commercial" : "residential";
}

function stableHash(str) {
  let hash = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickCameraPreset(emphasis) {
  const presets = {
    "light flow": { angle: "eye-level", lens: "24–28mm wide-angle", framing: "toward window wall", height: "1.5m" },
    "material contrast": { angle: "eye-level", lens: "28–35mm", framing: "focus on texture-rich zone", height: "1.5m" },
    "spatial openness": { angle: "eye-level", lens: "20–24mm wide-angle", framing: "wide corner-to-corner view", height: "1.55m" },
    "furniture proportion": { angle: "eye-level", lens: "28–35mm", framing: "balanced full-room view", height: "1.5m" },
    "mood and atmosphere": { angle: "eye-level", lens: "28mm", framing: "warm vignette composition", height: "1.45m" },
    "storage efficiency": { angle: "eye-level", lens: "24–28mm", framing: "storage wall + main zone", height: "1.5m" },
    "circulation/walkway clarity": { angle: "eye-level", lens: "24mm", framing: "shows clear pathways", height: "1.55m" },
    "accent layering": { angle: "eye-level", lens: "28–35mm", framing: "accent corner + main furniture", height: "1.5m" },
  };

  return presets[emphasis] || {
    angle: "eye-level",
    lens: "24–28mm wide-angle",
    framing: "straight-on framing",
    height: "1.5m",
  };
}

function inferFurnitureDefaults(roomKey, spaceType) {
  const t = String(roomKey || "").toLowerCase();

  // ✅ Outdoor first (prevents bedroom defaults)
  if (t === "balcony") return "outdoor seating, small outdoor table, plants, railing";
  if (t === "patio") return "outdoor seating, outdoor flooring, plants";
  if (t === "roof_deck") return "outdoor seating, deck surface, optional shade, railing";
  if (t === "garden") return "landscaping/greenery, optional pathway, optional outdoor seating";

  // ✅ kids bedroom defaults
  if (t === "kids_bedroom") return "child-sized bed or bunk bed, kids desk and chair, toy storage, optional wardrobe";

  // ✅ NEW: service area defaults
  if (t === "service_area") return "utility counter/work surface, storage shelves/cabinets, cleaning tools storage, clear walkway";

  // ✅ NEW: maids room defaults
  if (t === "maids_room") return "single bed (or bunk), small wardrobe/storage cabinet, simple side table, simple lighting";

  // Residential defaults
  if (t.includes("bedroom")) return "bed, nightstand, wardrobe";
  if (t.includes("living")) return "sofa, coffee table, optional tv console, optional area rug";
  if (t.includes("kitchen")) return "base cabinets, countertop, sink, cooktop";
  if (t.includes("pantry")) return "pantry shelves, storage containers";
  if (t.includes("bathroom")) return "vanity, mirror, toilet, shower zone";
  if (t.includes("home_office")) return "desk, chair, shelves";
  if (t.includes("laundry")) return "washer, folding counter, storage shelves";
  if (t.includes("closet")) return "closet shelves, hanging rods, shoe storage";

  // Small business defaults
  if (t.includes("sari_sari")) return "service counter, display shelves, product display";
  if (t.includes("retail")) return "display racks, display shelves, checkout counter";
  if (t.includes("bakery")) return "display case, service counter";
  if (t.includes("milktea")) return "order counter, prep bar, optional seating";
  if (t.includes("coffee_shop")) return "order counter, espresso/prep bar, tables and chairs";
  if (t.includes("restaurant")) return "tables, chairs/booths, clear circulation";
  if (t.includes("computer_shop")) return "computer stations, chairs, clean wiring";
  if (t.includes("printing_shop")) return "service counter, work table, printer/copier zone";
  if (t.includes("laundry_shop")) return "washing machines, folding counter, optional waiting bench";
  if (t.includes("pharmacy")) return "service counter, display shelves (behind counter)";

  // Generic by space type
  if (spaceType === "commercial") return "customer area, display/storage, service counter (optional)";
  return "primary seating, storage, lighting fixture";
}

/* ===============================
   ✅ NEW: Strong palette enforcement (prevents gray-dominant outputs)
   =============================== */
function buildPaletteEnforcementBlock(pal) {
  const colors = Array.isArray(pal?.colors) ? pal.colors.filter(Boolean) : [];
  if (!colors.length) return "";

  const primary = colors[0] || {};
  const secondary = colors[1] || {};
  const tertiary = colors[2] || {};

  const pName = String(primary?.name || "Primary").trim();
  const pHex = String(primary?.hex || "").toUpperCase();

  const sName = String(secondary?.name || "").trim();
  const sHex = String(secondary?.hex || "").toUpperCase();

  const tName = String(tertiary?.name || "").trim();
  const tHex = String(tertiary?.hex || "").toUpperCase();

  const pNameLc = pName.toLowerCase();
  const isBluePrimary = pNameLc.includes("blue") || pHex === "#60A5FA";

  return `
PALETTE APPLICATION ENFORCEMENT (MANDATORY — NON-NEGOTIABLE):
- PRIMARY color MUST be clearly visible: ${pName}${pHex ? ` (${pHex})` : ""}

PRIMARY VISIBILITY MINIMUMS (MUST PASS):
- PRIMARY color must occupy ~15%–30% of the visible scene (NOT tiny accents).
- PRIMARY must appear on at least ONE LARGE SURFACE (choose at least one):
  • a full accent wall OR large wall panels
  • bed textiles (main bedding / duvet) OR headboard upholstery
  • large curtains/blinds OR a large rug with strong primary sections

ACCENT REQUIREMENTS:
- PRIMARY must also appear on at least THREE additional accents:
  • pillows, toys, wall art elements, desk accessories, lamp shade accent, storage bin fronts

${secondary?.hex ? `- SECONDARY color supports: ${sName} (${sHex}) but MUST NOT replace the PRIMARY.` : ""}
${tertiary?.hex ? `- THIRD color allowed in small amounts: ${tName} (${tHex}).` : ""}

ANTI-NEUTRAL-ONLY RULE (CRITICAL):
- Even if white/gray are in the palette, the final image MUST NOT look neutral-only.
- Do NOT produce an all-gray/all-beige look. The PRIMARY theme must be obvious at first glance.

${isBluePrimary ? `
BLUE THEME OVERRIDE (EXTRA STRICT):
- Include ONE clearly visible BLUE accent wall OR BLUE main bedding set (duvet/comforter).
- Add at least TWO BLUE accents (pillows/toys/decor) that are unmistakably blue.
- If walls are gray/white, BLUE elements must still dominate the focal area.
`.trim() : ""}

STRICT PALETTE RULES:
- Do NOT desaturate or mute the PRIMARY color.
- Do NOT introduce off-palette colors.
`.trim();
}
