// orchestrateChat.js (controller)
// ✅ Updated: integrates OBJECT DETECTION from image -> accurate layoutSuggestions + detected objects positions
// ✅ Updated: supports BOTH detector output shapes:
//    A) { image:{width,height}, objects:[{label,score,bbox:{x,y,w,h}}] }  (pixel bbox)
//    B) { boxes:[{label,x,y,w,h,score|confidence}] }                     (normalized bbox 0..1)
// ✅ Updated: passes detections into generateLayout(room, detections)
// ✅ Updated: uses detected needs to prioritize furniture list (overrideNeeds) IF your matcher supports it
// ✅ Still guarantees furniture links always
//
// IMPORTANT:
// - Your objectDetector.js currently exports detectFurnitureObjectsFromImage + normalizeDetectedNeeds.
// - This orchestrator imports detectRoomObjects; so we provide a small wrapper name here:
//   detectRoomObjects(imagePath) -> calls detectFurnitureObjectsFromImage(imagePath) and returns a unified format.

import crypto from "crypto";
import { getColorPalette } from "../design-engine/colorEngine.js";
import { getDecorTips } from "../design-engine/decorTips.js";
import { getFurnitureMatches } from "../design-engine/furnitureMatcher.js";
import { analyzeRoom } from "../design-engine/layoutAnalyzer.js";
import { generateLayout } from "../design-engine/layoutGenerator.js";
import { detectStyle } from "../design-engine/styleEngine.js";
import { parseIntent } from "../llm/intentParser.js";
import { buildInteriorPrompt } from "../llm/promptBuilder.js";
import { classifySpace } from "../llm/spaceClassifier.js";
import { getSession, saveSession } from "../memory/designSessionStore.js";
import { generateInteriorImage } from "../visualization/imageGenerator.js";

// ✅ Use your existing exports (DO NOT rename your detect.py)
import {
  detectFurnitureObjectsFromImage,
  normalizeDetectedNeeds,
} from "../visualization/objectDetector.js";

/* ===============================
   NORMALIZE (intent/classify only)
   =============================== */
function normalizeMessage(message = "") {
  return String(message)
    .toLowerCase()
    .replace(/[^a-z0-9\s.x]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsNewSpace(message = "") {
  return /\b(bedroom|living\s*room|office|workspace|coffee\s*shop|cafe|restaurant|kitchen|studio|bathroom|dining|retail|salon|spa|hotel)\b/i.test(
    message
  );
}

/** ✅ ensure snake_case always */
function toSnakeRoomType(t = "") {
  return String(t || "").toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * ✅ SINGLE SOURCE OF TRUTH: Resolve final roomType used by ALL modules.
 */
function resolveFinalRoomType({ rawMessage = "", classified, previousSession } = {}) {
  const msg = String(rawMessage || "").toLowerCase();
  const rt = classified?.roomType;

  // 1) classifier result
  if (rt && rt !== "unknown" && rt !== "generic") return toSnakeRoomType(rt);

  // 2) keep previous session if user did not mention a new space
  const userMentionsSpace = mentionsNewSpace(msg);
  const prevRoomType = previousSession?.room?.type || previousSession?.space?.roomType;
  if (!userMentionsSpace && prevRoomType && prevRoomType !== "unknown" && prevRoomType !== "generic") {
    return toSnakeRoomType(prevRoomType);
  }

  // 3) heuristic rescue
  if (/\b(living\s*room|livingroom|sofa|couch|tv\s*console|tv\s*stand|coffee\s*table|sectional)\b/i.test(msg)) {
    return "living_room";
  }
  if (/\b(kitchen|sink|stove|cooktop|range|countertop|island|backsplash)\b/i.test(msg)) return "kitchen";
  if (/\b(dining\s*room|dining\s*area|dining\s*table)\b/i.test(msg)) return "dining_room";
  if (/\b(bedroom|bed|wardrobe|nightstand|dresser)\b/i.test(msg)) return "bedroom";
  if (/\b(bathroom|toilet|cr|shower|vanity)\b/i.test(msg)) return "bathroom";
  if (/\b(home\s*office|office|workspace|desk)\b/i.test(msg)) return "home_office";

  return "unknown";
}

function fallbackExplanation(roomType, style) {
  return `This ${roomType} is designed in a ${String(style?.name || "modern").toLowerCase()} style with a clear layout and practical material choices.`;
}

const fallbackTips = [
  "Adjust lighting placement to better support how the room is used",
  "Add one contrasting material to create depth without clutter",
  "Keep clear walkways between key furniture pieces",
];

function isPlaceholderMessage(msg = "") {
  const t = String(msg || "").trim().toLowerCase();
  if (!t) return true;
  return (
    t === "reference image attached." ||
    t === "photo captured and attached." ||
    t === "reference attached" ||
    t === "attached" ||
    t === "image attached"
  );
}

function defaultPromptForImage(mode = "generate") {
  const m = String(mode || "generate").toLowerCase();
  if (m === "edit" || m === "update") {
    return `Use the attached photo as reference. Keep the same room layout, camera angle, and furniture positions. Only apply design refinements (materials, colors, lighting, styling). Do not change the room structure.`;
  }
  return `Use the attached photo as reference. Keep the same room layout and camera perspective. Improve the design realistically with better styling, materials, and lighting.`;
}

function looksLikeEditRequest(message = "") {
  const t = String(message || "").toLowerCase();
  return /(make it|change|switch|convert|turn it|adjust|improve|upgrade|refine|more|less|minimalist|modern|industrial|scandinavian|japandi|boho|luxury|rustic|coastal|warmer|cooler|brighter|darker|add|remove)/i.test(
    t
  );
}

/* ===============================
   ✅ OBJECT DETECTOR WRAPPER
   - Keep your existing detectFurnitureObjectsFromImage()
   - Provide a unified result that layoutGenerator can consume
   =============================== */
async function detectRoomObjects(imagePath) {
  const res = await detectFurnitureObjectsFromImage(imagePath);

  // If your python currently returns ONLY objects list:
  // { objects:["sofa","bed"], raw:[], conf:{} }
  // we still return it, but layoutGenerator will fallback to procedural
  // unless you later extend detect.py to return boxes.

  // If later detect.py returns boxes, pass them through.
  // Support common field names (boxes, detections).
  const boxes =
    (Array.isArray(res?.boxes) && res.boxes) ||
    (Array.isArray(res?.detections) && res.detections) ||
    null;

  const image =
    res?.image && typeof res.image === "object"
      ? res.image
      : null;

  // Normalize objects as structured list if only strings exist
  // objectsStructured: [{label,score,bbox?}]
  const objectsStructured = Array.isArray(res?.objects)
    ? res.objects
        .map((o) => {
          if (typeof o === "string") return { label: o, score: (res?.conf?.[o] ?? 0.6) };
          return o;
        })
        .filter(Boolean)
    : [];

  return {
    image,
    boxes: boxes || undefined,       // normalized preferred
    objects: objectsStructured,       // may include bbox if your python provides it
    raw: res?.raw || [],
    conf: res?.conf || {},
    error: res?.error,
  };
}

/* ===============================
   OBJECT DETECTION -> NEEDS (for furniture)
   =============================== */
function extractDetectedNeeds(detectionResult) {
  // Prefer boxes labels if present, otherwise use objects labels
  const boxLabels = Array.isArray(detectionResult?.boxes)
    ? detectionResult.boxes.map((b) => b?.label).filter(Boolean)
    : [];

  const objLabels = Array.isArray(detectionResult?.objects)
    ? detectionResult.objects.map((o) => o?.label).filter(Boolean)
    : [];

  const needs = normalizeDetectedNeeds([...boxLabels, ...objLabels]);
  // dedupe preserve order
  const seen = new Set();
  const uniq = [];
  for (const n of needs) {
    const k = String(n).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(n);
  }
  return uniq;
}

/* ===============================
   STRICT VISUAL REQUIREMENTS
   =============================== */
function buildStrictVisualRequirements({ palette, layoutSuggestions, style, room }) {
  const paletteColors = Array.isArray(palette?.colors) ? palette.colors : [];
  const paletteLine =
    paletteColors.length > 0
      ? `Use this exact color palette (no new dominant colors): ${paletteColors
          .slice(0, 6)
          .map((c) => `${(c.name || "Color").trim()} ${String(c.hex || "").toUpperCase()}`.trim())
          .join(", ")}.`
      : `Use a palette consistent with the detected style; avoid random colors.`;

  const layoutLine =
    Array.isArray(layoutSuggestions) && layoutSuggestions.length > 0
      ? `Follow these layout placements: ${layoutSuggestions.join("; ")}.`
      : `Keep furniture placement logical with clear walkways; do not overcrowd.`;

  const styleLine = style?.name
    ? `Apply ${String(style.name).toLowerCase()} style consistently (materials, lighting, decor).`
    : `Apply a consistent modern interior style.`;

  const roomLine =
    room?.type || room?.width || room?.length
      ? `Room: ${room?.type || "interior"}; approx ${room?.width || "?"}m x ${room?.length || "?"}m.`
      : `Room: interior space.`;

  const t = toSnakeRoomType(room?.type || "");
  const negatives =
    t === "living_room"
      ? "No bed, no wardrobe, no kitchen island, no sink, no bar stools."
      : t === "bedroom"
      ? "No sofa TV-console layout, no kitchen island, no dining setup."
      : t === "kitchen"
      ? "No bed, no wardrobe, no living-room sofa TV-console composition."
      : "No unintended room type changes.";

  return [
    "STRICT REQUIREMENTS:",
    "- Photorealistic, realistic proportions.",
    "- No text, no watermark, no logo.",
    "- Do not invent extra rooms or remove walls.",
    `- ${roomLine}`,
    `- ${styleLine}`,
    `- ${paletteLine}`,
    `- ${layoutLine}`,
    `- ${negatives}`,
  ].join("\n");
}

/* ===============================
   ✅ GUARANTEED LINKS HELPERS
   =============================== */
function normalizeQuery(q = "") {
  return String(q || "").trim().replace(/\s+/g, " ");
}

function ensureLinks(query = "") {
  const q = encodeURIComponent(normalizeQuery(query));
  return {
    shopee: `https://shopee.ph/search?keyword=${q}`,
    lazada: `https://www.lazada.com.ph/catalog/?q=${q}`,
    ikea: `https://www.ikea.com/ph/en/search/?q=${q}`,
    marketplace: `https://www.facebook.com/marketplace/search/?query=${q}`,
  };
}

function hardGuaranteeFurnitureLinks(furniture = [], roomType = "interior") {
  const arr = Array.isArray(furniture) ? furniture : [];
  return arr
    .map((f) => {
      const name = String(f?.name || "").trim() || "Furniture Item";
      const query = normalizeQuery(f?.query || name || `${roomType} furniture`);
      const fallback = ensureLinks(query);
      const links = f?.links && typeof f.links === "object" ? f.links : {};

      return {
        id: f?.id || crypto.randomUUID(),
        name,
        placement:
          String(f?.placement || "").trim() ||
          "Place it where circulation stays clear; maintain a consistent walkway line.",
        query,
        links: {
          shopee: links.shopee || fallback.shopee,
          lazada: links.lazada || fallback.lazada,
          ikea: links.ikea || fallback.ikea,
          marketplace: links.marketplace || fallback.marketplace,
        },
      };
    })
    .filter((f) => f?.name && f?.links?.shopee && f?.links?.lazada && f?.links?.ikea && f?.links?.marketplace);
}

export async function orchestrateChat({
  sessionId,
  message,
  mode = "generate",
  image = null,
  isEdit: forcedEdit = null,
} = {}) {
  const resolvedSessionId = sessionId || crypto.randomUUID();

  // Placeholder message + image -> inject meaningful edit prompt
  if (image && isPlaceholderMessage(message)) {
    message = defaultPromptForImage(mode);
  }

  const rawMessage = String(message || "").trim();
  const cleanMessage = normalizeMessage(rawMessage);
  if (!cleanMessage) throw new Error("No message provided");

  const previousSession = getSession(resolvedSessionId);

  /* ===============================
     1) Intent
     =============================== */
  let intent = "UNKNOWN";
  try {
    const intentResult = await parseIntent(cleanMessage);
    intent = intentResult?.intent || "UNKNOWN";
  } catch {}

  /* ===============================
     2) Space classification
     =============================== */
  const userMentionsSpace = mentionsNewSpace(cleanMessage);
  const spaceResult =
    !previousSession || userMentionsSpace ? await classifySpace(cleanMessage) : previousSession.space;

  const currentSpaceType = spaceResult?.spaceType || "residential";

  const finalRoomType = resolveFinalRoomType({
    rawMessage,
    classified: spaceResult,
    previousSession,
  });

  if (finalRoomType === "unknown") {
    return {
      status: "NEEDS_CLARIFICATION",
      sessionId: resolvedSessionId,
      data: {
        intent,
        space: currentSpaceType,
        message:
          "I couldn’t confirm the room type. Are you designing a living room, bedroom, kitchen, dining room, or home office?",
        debug: { classifier: spaceResult, finalRoomType },
      },
    };
  }

  /* ===============================
     3) Mode / edit detection
     =============================== */
  const isNewDesign =
    !previousSession ||
    (userMentionsSpace && finalRoomType !== toSnakeRoomType(previousSession?.room?.type));

  const normalizedMode = String(mode || "generate").toLowerCase();
  const modeSaysEdit = normalizedMode === "edit" || normalizedMode === "update";

  const inferredEdit =
    !!previousSession &&
    !isNewDesign &&
    (modeSaysEdit ||
      /make it|add|remove|adjust|warmer|cooler|brighter|darker|bigger|smaller|switch|change/i.test(cleanMessage) ||
      intent === "CHANGE_STYLE");

  const forceEditBecauseImageAndEditText = !!image && looksLikeEditRequest(rawMessage);

  const isEdit =
    typeof forcedEdit === "boolean"
      ? forcedEdit
      : inferredEdit || forceEditBecauseImageAndEditText || (modeSaysEdit && !!image);

  const activeSession = isNewDesign ? null : previousSession;

  /* ===============================
     4) Room analysis
     =============================== */
  const room = activeSession?.room || {
    ...analyzeRoom(rawMessage),
    type: toSnakeRoomType(finalRoomType),
  };

  if (room?.hasWindow && !room?.windowSide) room.windowSide = "left";
  room.type = toSnakeRoomType(finalRoomType);

  /* ===============================
     5) Style
     =============================== */
  const style = detectStyle({
    message: rawMessage,
    previousStyle: activeSession?.style,
    isEdit,
    spaceType: currentSpaceType,
  });

  /* ===============================
     6) Palette
     =============================== */
  const palette = activeSession?.palette || (await getColorPalette(style, rawMessage));

  /* ===============================
     7) ✅ Object detection (only if image path is available on server)
     NOTE: Your image param MUST be a local file path.
     If it's a URL or base64, you must save it first.
     =============================== */
  let detectionResult = null;
  let detectedNeeds = [];

  if (image) {
    try {
      detectionResult = await detectRoomObjects(image);
      detectedNeeds = extractDetectedNeeds(detectionResult);
    } catch (e) {
      console.warn("Object detection failed:", e?.message || e);
      detectionResult = null;
      detectedNeeds = [];
    }
  }

  /* ===============================
     8) Layout + suggestions
     - Pass detections into generateLayout(room, detections)
     - layoutGenerator will use boxes/bbox if available, else procedural fallback
     =============================== */
  const layoutObj =
    typeof generateLayout === "function" ? generateLayout(room, detectionResult || null) : null;

  const layout = layoutObj || { summary: "", zones: [], placements: [], items: [] };

  // ✅ Use placements to form layoutSuggestions (human-readable and accurate)
  const layoutSuggestions =
    Array.isArray(layout?.placements) && layout.placements.length > 0
      ? layout.placements
          .slice(0, 8)
          .map((p) => `${p.item}: ${p.position}${p.confidence ? ` (conf ${p.confidence})` : ""}`)
      : [];

  /* ===============================
     9) Furniture matching + sourcing
     - If you add overrideNeeds support in furnitureMatcher, pass detectedNeeds
     =============================== */
  let furniture = [];
  try {
    const out = getFurnitureMatches({
      roomType: room.type,
      style,
      palette,
      layoutSuggestions,
      // ✅ enable this only if you implemented it in furnitureMatcher:
      // overrideNeeds: detectedNeeds,
    });
    furniture = Array.isArray(out) ? out : [];
  } catch (e) {
    console.warn("Furniture matching failed:", e?.message || e);
    furniture = [];
  }

  furniture = hardGuaranteeFurnitureLinks(furniture, room.type);

  /* ===============================
     10) Prompt
     =============================== */
  const { prompt: imagePrompt, emphasis } = buildInteriorPrompt({
    userMessage: rawMessage,
    room,
    style,
    palette,
    previousPrompt: activeSession?.lastPrompt,
    isEdit,
    spaceType: currentSpaceType,
    layoutSuggestions,
    forceFixedCamera: true,
  });

  /* ===============================
     11) init image handling
     =============================== */
  const initImage = isEdit ? image || activeSession?.lastImage || null : null;
  const inputImage = image || activeSession?.lastImage || null;

  /* ===============================
     12) strict wrapper
     =============================== */
  const strictReq = buildStrictVisualRequirements({
    palette,
    layoutSuggestions,
    style,
    room,
  });

  const finalImagePrompt = [
    "photorealistic interior photo, ultra realistic",
    strictReq,
    "USER REQUEST:",
    rawMessage,
    "DESIGN BRIEF:",
    imagePrompt,
  ].join("\n\n");

  /* ===============================
     13) generate image
     =============================== */
  const imageOut = await generateInteriorImage({
    prompt: finalImagePrompt,
    initImage,
    strength: isEdit ? 0.35 : 0.85,
  });

  /* ===============================
     14) decor tips
     =============================== */
  const decor = await getDecorTips({
    style,
    roomType: room.type,
    palette,
    userMessage: rawMessage,
    imagePrompt,
    emphasis,
    layoutSuggestions,
    isEdit,
  });

  /* ===============================
     15) Save session
     =============================== */
  saveSession(resolvedSessionId, {
    lastImage: imageOut,
    lastPrompt: imagePrompt,
    room,
    style,
    palette,
    decor,
    emphasis,
    furniture,
    space: {
      spaceType: currentSpaceType,
      roomType: room.type,
    },
  });

  /* ===============================
     16) Response
     =============================== */
  return {
    status: "SUCCESS",
    sessionId: resolvedSessionId,
    inputImage,
    image: imageOut,
    data: {
      intent,
      space: currentSpaceType,
      room,
      style,
      palette,

      explanation: decor?.explanation || fallbackExplanation(room.type, style),
      tips: Array.isArray(decor?.tips) && decor.tips.length === 3 ? decor.tips : fallbackTips,

      layout,
      layoutSuggestions,

      furnitureMatches: furniture,
      furniture,

      // Optional debug
      detections: detectionResult,
      detectedNeeds,

      isEdit,
      isNewDesign,
      inputImage,

      debug: {
        classifier: spaceResult,
        finalRoomType: room.type,
        layoutItemsCount: Array.isArray(layout?.items) ? layout.items.length : 0,
        furnitureCount: furniture.length,
        detectedObjectsCount: Array.isArray(detectionResult?.objects) ? detectionResult.objects.length : 0,
        detectedBoxesCount: Array.isArray(detectionResult?.boxes) ? detectionResult.boxes.length : 0,
      },
    },
  };
}
