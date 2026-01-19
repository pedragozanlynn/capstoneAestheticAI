export function buildInteriorPrompt({
  room,
  style,
  palette,
  userMessage,
  previousPrompt,
  isEdit = false,
  spaceType,

  // ✅ NEW: pass these from orchestrator
  layoutSuggestions = [],
  forceFixedCamera = true,
}) {
  const safeMessage = (userMessage || "").trim();

  const paletteNames = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.name).filter(Boolean)
    : [];

  const paletteHexes = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.hex).filter(Boolean)
    : [];

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

  // ✅ Make layout suggestions "strict rules" so SDXL follows better
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
${paletteHexes.length ? paletteHexes.slice(0, 8).map((h) => `- ${String(h).toUpperCase()}`).join("\n") : "- (no hex provided)"}

PALETTE NAMES:
${paletteNames.length ? paletteNames.slice(0, 12).map((n) => `- ${n}`).join("\n") : "- neutral tones"}
`.trim()
      : "";

  /* ===============================
     ✅ FIX: Room signals
     spaceType = residential/commercial, NOT room type
     =============================== */
  const roomType = room?.type || "generic_interior";
  const category = room?.category || spaceType || "residential";
  const useCase = room?.useCase || "general";
  const mood = room?.mood || style?.mood || "neutral";

  const width = room?.width ?? 4;
  const length = room?.length ?? 4;
  const area = room?.area ?? Number((width * length).toFixed(2));
  const ceilingHeight = room?.ceilingHeight ?? 2.7;

  const hasWindow = typeof room?.hasWindow === "boolean" ? room.hasWindow : true;
  const windowSide = room?.windowSide || (hasWindow ? "left" : "none");
  const lighting = room?.lighting || (hasWindow ? "ambient + natural" : "ambient");

  const lightingLine = hasWindow
    ? `Natural light from ${windowSide} side window + ${lighting}`
    : `No direct window light; rely on ${lighting}`;

  const constraints = room?.constraints || "no special constraints";

  const materialsLine = room?.materialNotes
    ? room.materialNotes
    : `Mix of ${style?.materials?.join(", ") || "light wood, linen fabric, matte metal"}; avoid glossy plastic`;

  /* ===============================
     ✅ MASTER INTERIOR OBJECT CATALOG
     (Used to force objects to appear)
     =============================== */
  const OBJECT_CATALOG = {
    living_room: [
      "sofa or sectional",
      "coffee table",
      "tv console / media console",
      "television (visible)",
      "area rug",
      "side table (optional)",
      "accent chair (optional)",
      "floor lamp or table lamp (optional)",
      "wall art (optional)",
      "indoor plants (optional)",
    ],
    bedroom: [
      "bed",
      "headboard (optional)",
      "nightstand",
      "wardrobe / closet",
      "dresser (optional)",
      "area rug (optional)",
      "desk + chair (optional)",
    ],
    home_office: [
      "desk",
      "office chair",
      "bookshelf / storage cabinet (optional)",
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
    dining_room: [
      "dining table",
      "dining chairs",
      "pendant light / chandelier (optional)",
      "area rug (optional)",
      "sideboard / buffet (optional)",
    ],
    bathroom: [
      "vanity",
      "mirror",
      "toilet",
      "shower area or bathtub",
      "storage shelves (optional)",
    ],
    cafe: [
      "service counter",
      "tables",
      "chairs",
      "pendant lighting (optional)",
      "indoor plants (optional)",
    ],
    retail_store: [
      "display racks",
      "display shelves",
      "cashier counter",
      "display table (optional)",
    ],
    generic_interior: [
      "primary seating",
      "side table",
      "storage",
      "area rug (optional)",
      "lighting fixture",
    ],
  };

  const ROOM_ALIASES = {
    living: "living_room",
    living_room: "living_room",
    bedroom: "bedroom",
    home_office: "home_office",
    office: "home_office",
    kitchen: "kitchen",
    dining: "dining_room",
    dining_room: "dining_room",
    bathroom: "bathroom",
    cafe: "cafe",
    coffee_shop: "cafe",
    retail: "retail_store",
    retail_store: "retail_store",
    store: "retail_store",
    generic: "generic_interior",
  };

  function normalizeRoomKey(t) {
    const k = String(t || "generic_interior").toLowerCase().trim();
    return ROOM_ALIASES[k] || k || "generic_interior";
  }

  const roomKey = normalizeRoomKey(roomType);

  // If user explicitly mentions certain objects, prioritize them as required
  const OBJECT_KEYWORDS = [
    { keys: ["tv console", "media console", "tv stand"], obj: "tv console / media console" },
    { keys: ["tv", "television"], obj: "television (visible)" },
    { keys: ["rug", "area rug"], obj: "area rug" },
    { keys: ["sofa", "sectional", "couch"], obj: "sofa or sectional" },
    { keys: ["coffee table"], obj: "coffee table" },
    { keys: ["wardrobe", "closet"], obj: "wardrobe / closet" },
    { keys: ["bed"], obj: "bed" },
    { keys: ["nightstand"], obj: "nightstand" },
    { keys: ["desk"], obj: "desk" },
    { keys: ["chair"], obj: "chair" },
    { keys: ["sink"], obj: "sink" },
    { keys: ["stove", "cooktop", "range"], obj: "cooktop / stove" },
    { keys: ["island"], obj: "kitchen island" },
    { keys: ["dining table"], obj: "dining table" },
    { keys: ["toilet"], obj: "toilet" },
    { keys: ["shower"], obj: "shower area" },
    { keys: ["bathtub", "tub"], obj: "bathtub" },
    { keys: ["counter"], obj: "service counter" },
    { keys: ["rack", "racks"], obj: "display racks" },
    { keys: ["shelves", "shelf"], obj: "display shelves" },
    { keys: ["cashier"], obj: "cashier counter" },
  ];

  function extractRequiredObjects({ userText = "", layoutList = [], roomKey = "generic_interior" }) {
    const src = `${userText}\n${layoutList.join("\n")}`.toLowerCase();
    const required = new Set();

    // Baseline required objects by room
    const baseline = OBJECT_CATALOG[roomKey] || OBJECT_CATALOG.generic_interior;
    baseline.forEach((o) => required.add(o));

    // User-specified / layout-specified objects become strictly required
    for (const rule of OBJECT_KEYWORDS) {
      if (rule.keys.some((k) => src.includes(k))) required.add(rule.obj);
    }

    // If living room layout indicates tv console, strongly enforce TV + rug visibility
    if (roomKey === "living_room" && src.includes("tv console")) {
      required.add("television (visible)");
      required.add("area rug");
    }

    return Array.from(required);
  }

  const requiredObjects = extractRequiredObjects({
    userText: safeMessage,
    layoutList: layoutSuggestions,
    roomKey,
  });

  const requiredObjectsBlock = requiredObjects.length
    ? `
REQUIRED OBJECTS (MUST BE PRESENT AND VISIBLE IN FRAME):
${requiredObjects.map((o) => `- ${o}`).join("\n")}

VISIBILITY RULES:
- Use wide framing that shows all required objects clearly.
- Do not crop out the tv console, rug, and main furniture.
- Keep objects unobstructed (no blocking furniture in front of tv console).
`.trim()
    : "";

  // Room-specific negatives to reduce wrong-room drift
  const negativeBlock = `
NEGATIVE CONSTRAINTS:
- no text, no watermark, no labels
- no empty room, no missing key furniture
- ${
    roomKey === "living_room"
      ? "no bed, no wardrobe, no kitchen island, no sink, no bar stools"
      : roomKey === "bedroom"
      ? "no living-room tv console + sofa composition, no kitchen island, no dining setup"
      : roomKey === "kitchen"
      ? "no bed, no wardrobe, no living-room tv console + sofa composition"
      : roomKey === "bathroom"
      ? "no sofa, no tv console, no kitchen island"
      : "no unintended room type changes"
  }
`.trim();

  const furnitureList =
    Array.isArray(room?.furniture) && room.furniture.length
      ? room.furniture.join(", ")
      : inferFurnitureDefaults(roomKey);

  /* ===============================
     Camera: fixed when layout is important
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
          framing: "wide corner-to-corner view showing the whole layout clearly",
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
${requiredObjectsBlock ? requiredObjectsBlock : ""}

${negativeBlock}

EDIT GOAL:
- Keep the same room structure (walls, doors, windows)
- Keep the same layout and furniture positions
- Only change: style, materials, finishes, color, lighting, decor
- No new architecture, no new room

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
- Type: ${roomKey}
- Category: ${category}
- Use case: ${useCase}

STYLE DIRECTION:
${style?.name || "Modern"}

USER REQUEST (HIGHEST PRIORITY):
"${safeMessage}"

${strictLayoutBlock ? strictLayoutBlock : ""}
${strictPaletteBlock ? strictPaletteBlock : ""}
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

function stableHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickCameraPreset(emphasis) {
  const presets = {
    "light flow": {
      angle: "eye-level",
      lens: "24–28mm wide-angle",
      framing: "toward window wall",
      height: "1.5m",
    },
    "material contrast": {
      angle: "eye-level",
      lens: "28–35mm",
      framing: "focus on texture-rich zone",
      height: "1.5m",
    },
    "spatial openness": {
      angle: "eye-level",
      lens: "20–24mm wide-angle",
      framing: "wide corner-to-corner view",
      height: "1.55m",
    },
    "furniture proportion": {
      angle: "eye-level",
      lens: "28–35mm",
      framing: "balanced full-room view",
      height: "1.5m",
    },
    "mood and atmosphere": {
      angle: "eye-level",
      lens: "28mm",
      framing: "warm vignette composition",
      height: "1.45m",
    },
    "storage efficiency": {
      angle: "eye-level",
      lens: "24–28mm",
      framing: "storage wall + main zone",
      height: "1.5m",
    },
    "circulation/walkway clarity": {
      angle: "eye-level",
      lens: "24mm",
      framing: "shows clear pathways",
      height: "1.55m",
    },
    "accent layering": {
      angle: "eye-level",
      lens: "28–35mm",
      framing: "accent corner + main furniture",
      height: "1.5m",
    },
  };

  return presets[emphasis] || {
    angle: "eye-level",
    lens: "24–28mm wide-angle",
    framing: "straight-on framing",
    height: "1.5m",
  };
}

function inferFurnitureDefaults(roomKey) {
  const t = (roomKey || "").toLowerCase();
  if (t.includes("bedroom")) return "bed, nightstand, wardrobe";
  if (t.includes("living")) return "sofa, coffee table, tv console, area rug, television";
  if (t.includes("kitchen")) return "base cabinets, countertop, sink, cooktop";
  if (t.includes("bathroom")) return "vanity, mirror, toilet, shower zone";
  if (t.includes("office")) return "desk, chair, shelves";
  if (t.includes("cafe")) return "service counter, tables, chairs";
  if (t.includes("retail")) return "display shelves, racks, cashier counter";
  return "primary seating, side table, storage";
}
