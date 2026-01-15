export function buildInteriorPrompt({
  room,
  style,
  palette,
  userMessage,
  previousPrompt,
  isEdit = false,
  spaceType,
}) {
  const safeMessage = (userMessage || "").trim();
  const paletteNames = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.name).filter(Boolean)
    : [];

  const baseQuality = `
photorealistic interior photography,
ultra realistic,
high detail,
sharp focus,
real materials and textures,
professional interior photography,
no illustration,
no sketch,
no drawing,
no CGI look
`.trim();

  const absoluteLock = `
ABSOLUTE LOCK:
- Same camera angle and height
- Same perspective and framing
- Same room layout and proportions
- Same furniture placement
- Do NOT redesign the room
`.trim();

  // ✅ If edit mode, keep strict lock and reuse previous prompt
  if (isEdit && previousPrompt) {
    return {
      emphasis: "edit-only",
      prompt: `
${previousPrompt}

STRICT IMAGE EDIT MODE.

${absoluteLock}

ONLY APPLY THIS CHANGE:
"${safeMessage}"

${baseQuality}
`.trim(),
    };
  }

  // ✅ ADD: If edit mode but NO previousPrompt yet (first upload/capture)
  // Forces strict img2img behavior: preserve layout/structure, only style refinements.
  if (isEdit && !previousPrompt) {
    const roomType = spaceType || room?.type || "generic interior";

    return {
      emphasis: "edit-only",
      prompt: `
PHOTOREALISTIC INTERIOR PHOTO EDIT (IMG2IMG).

REFERENCE IMAGE IS THE SOURCE OF TRUTH.
Preserve the identity of the original room.

${absoluteLock}

EDIT GOAL:
- Keep the same room structure (walls, doors, windows)
- Keep the same layout and furniture positions
- Only change: style, materials, finishes, color, lighting, decor
- No new room, no redesign, no new architecture

ROOM TYPE:
${roomType}

STYLE TARGET:
${style?.name || "Modern"}

COLOR PALETTE TARGET:
${paletteNames.length ? paletteNames.join(", ") : "neutral tones"}

ONLY APPLY THIS CHANGE:
"${safeMessage}"

${baseQuality}
`.trim(),
    };
  }

  /* ===============================
     Deterministic emphasis (stable per message)
     =============================== */
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

  const signature = stableHash(safeMessage);
  const emphasis = emphases[signature % emphases.length];

  /* ===============================
     Use enriched room signals (from analyzeRoom)
     =============================== */
  const roomType = spaceType || room?.type || "generic interior";
  const category = room?.category || "residential";
  const useCase = room?.useCase || "general";
  const mood = room?.mood || style?.mood || "neutral";

  const width = room?.width ?? 4;
  const length = room?.length ?? 4;
  const area = room?.area ?? Number((width * length).toFixed(2));
  const ceilingHeight = room?.ceilingHeight ?? 2.7;

  const hasWindow =
    typeof room?.hasWindow === "boolean" ? room.hasWindow : true;
  const windowSide = room?.windowSide || (hasWindow ? "left" : "none");
  const lighting =
    room?.lighting || (hasWindow ? "ambient + natural" : "ambient");

  const furnitureList =
    Array.isArray(room?.furniture) && room.furniture.length
      ? room.furniture.join(", ")
      : inferFurnitureDefaults(roomType);

  const constraints = room?.constraints || "no special constraints";

  /* ===============================
     Camera variation (small, controlled)
     =============================== */
  const cameraPreset = pickCameraPreset(emphasis);

  /* ===============================
     Material direction
     =============================== */
  const materialsLine = room?.materialNotes
    ? room.materialNotes
    : `Mix of ${
        style?.materials?.join(", ") || "light wood, linen fabric, matte metal"
      }; avoid glossy plastic`;

  /* ===============================
     Lighting condition line
     =============================== */
  const lightingLine = hasWindow
    ? `Natural light from ${windowSide} side window + ${lighting}`
    : `No direct window light; rely on ${lighting}`;

  const prompt = `
PHOTOREALISTIC INTERIOR PHOTOGRAPH.

SPACE:
- Type: ${roomType}
- Category: ${category}
- Use case: ${useCase}

STYLE DIRECTION:
${style?.name || "Modern"}

COLOR PALETTE:
${paletteNames.length ? paletteNames.join(", ") : "neutral tones"}

USER REQUEST (HIGHEST PRIORITY):
"${safeMessage}"

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

PROMPT SIGNATURE:
- ${signature}

DESIGN RULES:
- Follow user request exactly
- No diagrams, no text overlays, no illustration
- Realistic proportions and believable staging

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
  // Controlled variation so prompts don't look identical every time
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

function inferFurnitureDefaults(roomType) {
  const t = (roomType || "").toLowerCase();
  if (t.includes("bedroom")) return "bed, side table, wardrobe";
  if (t.includes("living")) return "sofa, coffee table, media console";
  if (t.includes("kitchen")) return "base cabinets, countertop, dining nook";
  if (t.includes("bathroom")) return "vanity, mirror, shower zone";
  if (t.includes("office")) return "desk, chair, shelves";
  if (t.includes("cafe")) return "service counter, seating tables, chairs";
  if (t.includes("restaurant")) return "dining tables, chairs, service area";
  if (t.includes("retail")) return "display shelves, racks, cashier counter";
  return "primary seating, side table, storage";
}
