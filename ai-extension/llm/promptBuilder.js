export function buildInteriorPrompt({
  room,
  style,
  palette,
  userMessage,
  previousPrompt,
  isEdit = false,
  spaceType,
}) {
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
`;

  const absoluteLock = `
ABSOLUTE LOCK:
- Same camera angle and height
- Same perspective and framing
- Same room layout and proportions
- Same furniture placement
- Do NOT redesign the room
`;

  if (isEdit && previousPrompt) {
    return `
${previousPrompt}

STRICT IMAGE EDIT MODE.

${absoluteLock}

ONLY APPLY THIS CHANGE:
"${userMessage}"

${baseQuality}
`;
  }

  // 🔥 VARIATION SEED (CRITICAL)
  const variationSeed = `
DESIGN EMPHASIS:
- Primary focus: ${["light flow", "material contrast", "spatial openness", "furniture proportion", "mood and atmosphere"][Math.floor(Math.random() * 5)]}
`;

  return `
PHOTOREALISTIC INTERIOR PHOTOGRAPH.

SPACE TYPE:
${spaceType || room.type}

STYLE DIRECTION:
${style.name}

COLOR PALETTE:
${palette.colors.map(c => c.name).join(", ")}

USER REQUEST (HIGHEST PRIORITY):
"${userMessage}"

DESIGN FACTS:
- Approximate size: ${room.length} x ${room.width} meters
- Ceiling height: standard residential scale
- Layout type: ${room.layout || "open-plan"}
- Intended mood: ${style.mood || "functional and comfortable"}

LIGHTING CONDITIONS:
- Combination of natural and ambient lighting
- Shadows and highlights consistent with real photography

MATERIAL DIRECTION:
- Wood, fabric upholstery, metal accents
- Realistic surface textures, no stylization

${variationSeed}

CAMERA:
- Eye-level interior photography
- Wide-angle lens
- Straight-on framing

DESIGN RULES:
- Follow user request exactly
- No diagrams or illustrations

${baseQuality}
`;
}
