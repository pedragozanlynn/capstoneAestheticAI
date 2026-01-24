// orchestrateChat.js (controller)

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

/**
 * ✅ UPDATED: include ALL spaceClassifier room types + PH/Taglish synonyms
 * (so re-classification triggers instead of reusing previous session)
 */
function mentionsNewSpace(message = "") {
  const re = new RegExp(
    String.raw`\b(` +
      [
        // Residential
        "bedroom","tulugan","kwarto","silid","nursery",
        "living\\s*room","livingroom","sala","family\\s*room","tv\\s*room","media\\s*room",
        "kitchen","kusina","dirty\\s*kitchen","pantry",
        "dining\\s*room","dining\\s*area","kainan",
        "bathroom","toilet","cr","banyo","palikuran",
        "home\\s*office","office","workspace","study\\s*room","desk",
        "kids\\s*playroom","playroom","toy\\s*room",
        "walk[\\s-]*in\\s*closet","closet\\s*room","wardrobe\\s*room","damitan",
        "laundry\\s*room","laundry","labahan","utility\\s*room",
        "storage\\s*room","storeroom","storage","bodega",
        "service\\s*area","utility\\s*area","service\\s*kitchen",
        "maids\\s*room","maid'?s\\s*room","helper\\s*room",
        "entryway","foyer","entrance","mudroom",
        "hallway","corridor","passage",
        "stairs","staircase","hagdan","stairs\\s*area",
        "balcony","balkonahe","terrace","terasa","lanai","veranda","beranda",
        "patio",
        "roof\\s*deck","roof\\s*top","rooftop","roof\\s*terrace",
        "garden","yard","bakuran","landscape",
        "garage","carport","garahe",
        "studio\\s*apartment","studio\\s*unit","studio",

        // Commercial (small biz)
        "sari[\\s-]*sari\\s*store","sari\\s*sari","tindahan","corner\\s*store","mini\\s*store",
        "retail\\s*store","clothing\\s*store","convenience\\s*store","boutique","retail","shop","store",
        "bakery","panaderya","bakeshop","bread\\s*shop",
        "milktea","milk\\s*tea\\s*shop","milktea\\s*shop",
        "coffee\\s*shop","cafe","espresso\\s*bar",
        "restaurant","bistro","diner","canteen","karinderya",
        "computer\\s*shop","internet\\s*cafe","comshop","net\\s*cafe","pisonet",
        "printing\\s*shop","print\\s*shop","xerox","tarpaulin","printing\\s*services","photocopy",
        "laundry\\s*shop","laundromat","wash\\s*and\\s*dry","wash\\s*dry\\s*fold",
        "pharmacy","drugstore","botika",
      ].join("|") +
      String.raw`)\b`,
    "i"
  );

  return re.test(String(message || ""));
}

function toSnakeRoomType(t = "") {
  return String(t || "").toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * ✅ UPDATED: heuristic fallback now covers ALL spaceClassifier room types.
 * - Prioritize outdoor spaces (balcony/patio/roof_deck/garden) BEFORE bedroom tokens
 * - Add commercial small-business room types
 * - Keep everything else unchanged
 */
function resolveFinalRoomType({ rawMessage = "", classified, previousSession } = {}) {
  const msg = String(rawMessage || "").toLowerCase();
  const rt = classified?.roomType;

  if (rt && rt !== "unknown" && rt !== "generic") return toSnakeRoomType(rt);

  const userMentionsSpace = mentionsNewSpace(msg);
  const prevRoomType = previousSession?.room?.type || previousSession?.space?.roomType;
  if (!userMentionsSpace && prevRoomType && prevRoomType !== "unknown" && prevRoomType !== "generic") {
    return toSnakeRoomType(prevRoomType);
  }

  // ✅ Outdoor / exterior first (prevents "balcony" drifting into bedroom)
  if (/\b(roof\s*deck|rooftop|roof\s*top|roof\s*terrace|rooftop\s*terrace)\b/i.test(msg)) return "roof_deck";
  if (/\b(balcony|balkonahe|veranda|beranda|lanai|terrace|terasa)\b/i.test(msg)) return "balcony";
  if (/\b(patio)\b/i.test(msg)) return "patio";
  if (/\b(garden|yard|bakuran|landscape)\b/i.test(msg)) return "garden";
  if (/\b(garage|carport|garahe)\b/i.test(msg)) return "garage";

  // ✅ Residential
  if (/\b(living\s*room|livingroom|sala|family\s*room|tv\s*room|media\s*room|sofa|couch|tv\s*console|tv\s*stand|coffee\s*table|sectional)\b/i.test(msg)) {
    return "living_room";
  }
  if (/\b(kitchen|kusina|dirty\s*kitchen|sink|stove|cooktop|range|countertop|island|backsplash|fridge|refrigerator)\b/i.test(msg)) return "kitchen";
  if (/\b(pantry|walk[\s-]*in\s*pantry)\b/i.test(msg)) return "pantry";
  if (/\b(dining\s*room|dining\s*area|dining\s*table|kainan)\b/i.test(msg)) return "dining_room";
  if (/\b(bathroom|toilet|cr|shower|vanity|banyo|palikuran)\b/i.test(msg)) return "bathroom";
  if (/\b(home\s*office|office|workspace|study\s*room|desk)\b/i.test(msg)) return "home_office";
  if (/\b(kids\s*playroom|playroom|toy\s*room|play\s*mat)\b/i.test(msg)) return "kids_playroom";
  if (/\b(walk[\s-]*in\s*closet|closet\s*room|wardrobe\s*room|damitan)\b/i.test(msg)) return "walk_in_closet";
  if (/\b(laundry\s*room|laundry|labahan|washer|dryer|utility\s*room)\b/i.test(msg)) return "laundry_room";
  if (/\b(storage\s*room|storeroom|storage|bodega|boxes|shelves\s*storage)\b/i.test(msg)) return "storage_room";
  if (/\b(service\s*area|utility\s*area|service\s*kitchen)\b/i.test(msg)) return "service_area";
  if (/\b(maids\s*room|maid'?s\s*room|helper\s*room)\b/i.test(msg)) return "maids_room";
  if (/\b(entryway|foyer|entrance|mudroom)\b/i.test(msg)) return "entryway";
  if (/\b(hallway|corridor|passage)\b/i.test(msg)) return "hallway";
  if (/\b(stairs|staircase|hagdan|stairs\s*area|stair\s*landing)\b/i.test(msg)) return "stairs_area";
  if (/\b(studio\s*apartment|studio\s*unit|one\s*room\s*apartment|studio)\b/i.test(msg)) return "studio_apartment";
  if (/\b(bedroom|bed|wardrobe|nightstand|dresser|tulugan|kwarto|silid)\b/i.test(msg)) return "bedroom";

  // ✅ Commercial (Small business)
  if (/\b(sari[\s-]*sari\s*store|sari\s*sari|tindahan|corner\s*store|mini\s*store)\b/i.test(msg)) return "sari_sari_store";
  if (/\b(retail\s*store|clothing\s*store|convenience\s*store|boutique|retail)\b/i.test(msg)) return "retail_store";
  if (/\b(bakery|panaderya|bakeshop|bread\s*shop)\b/i.test(msg)) return "bakery";
  if (/\b(milktea|milk\s*tea\s*shop|milktea\s*shop)\b/i.test(msg)) return "milktea_shop";
  if (/\b(coffee\s*shop|cafe|espresso\s*bar)\b/i.test(msg)) return "coffee_shop";
  if (/\b(restaurant|bistro|diner|canteen|karinderya)\b/i.test(msg)) return "restaurant";
  if (/\b(computer\s*shop|internet\s*cafe|comshop|net\s*cafe|pisonet)\b/i.test(msg)) return "computer_shop";
  if (/\b(printing\s*shop|print\s*shop|xerox|tarpaulin|printing\s*services|photocopy)\b/i.test(msg)) return "printing_shop";
  if (/\b(laundry\s*shop|laundromat|wash\s*and\s*dry|wash\s*dry\s*fold)\b/i.test(msg)) return "laundry_shop";
  if (/\b(pharmacy|drugstore|botika)\b/i.test(msg)) return "pharmacy";

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
   ✅ OPTIONAL: detect explicit "new design/from scratch" (classification only)
   =============================== */
function looksLikeNewDesignRequest(message = "") {
  const t = String(message || "").toLowerCase();
  return /(from scratch|new design|start over|bagong design|ibang part|ibang bahagi|other part|other parts|gawa ulit|ulit|panibago)/i.test(t);
}

/* ===============================
   ✅ OBJECT DETECTOR WRAPPER
   ✅ IMPORTANT: imagePath MUST be a local file path
   =============================== */
async function detectRoomObjects(imagePath) {
  const res = await detectFurnitureObjectsFromImage(imagePath);

  const boxes =
    (Array.isArray(res?.boxes) && res.boxes) ||
    (Array.isArray(res?.detections) && res.detections) ||
    null;

  const image =
    res?.image && typeof res.image === "object"
      ? res.image
      : null;

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
    boxes: boxes || undefined,
    objects: objectsStructured,
    raw: res?.raw || [],
    conf: res?.conf || {},
    error: res?.error,
  };
}

function extractDetectedNeeds(detectionResult) {
  const boxLabels = Array.isArray(detectionResult?.boxes)
    ? detectionResult.boxes.map((b) => b?.label).filter(Boolean)
    : [];

  const objLabels = Array.isArray(detectionResult?.objects)
    ? detectionResult.objects.map((o) => o?.label).filter(Boolean)
    : [];

  const needs = normalizeDetectedNeeds([...boxLabels, ...objLabels]);
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
   ✅ NEW: infer roomType from detections (classification fix only)
   =============================== */
function inferRoomTypeFromDetections(detectionResult) {
  const labels = [];

  const boxes = Array.isArray(detectionResult?.boxes) ? detectionResult.boxes : [];
  for (const b of boxes) {
    const l = String(b?.label || "").toLowerCase().trim();
    if (l) labels.push(l);
  }

  const objs = Array.isArray(detectionResult?.objects) ? detectionResult.objects : [];
  for (const o of objs) {
    const l = String(o?.label || "").toLowerCase().trim();
    if (l) labels.push(l);
  }

  if (!labels.length) return null;

  // scoring map (minimal, extend as your detector labels evolve)
  const RULES = [
    { room: "bathroom", keys: ["toilet", "wc", "bidet", "shower", "bathtub", "sink", "vanity"] },
    { room: "kitchen", keys: ["stove", "cooktop", "oven", "range", "rangehood", "sink", "fridge", "refrigerator", "cabinet", "kitchen"] },
    { room: "bedroom", keys: ["bed", "pillow", "wardrobe", "closet", "nightstand", "headboard"] },
    { room: "living_room", keys: ["sofa", "couch", "tv", "television", "coffee table", "console", "media console", "living room"] },
    { room: "dining_room", keys: ["dining table", "dining chair", "table set"] },
    { room: "home_office", keys: ["desk", "monitor", "laptop", "office chair", "keyboard"] },
    { room: "laundry_room", keys: ["washing machine", "washer", "dryer", "laundry"] },

    // outdoor-ish
    { room: "balcony", keys: ["railing", "balustrade", "outdoor", "patio chair", "outdoor chair", "planter", "plants", "terrace"] },

    // small biz (generic cues)
    { room: "retail_store", keys: ["display rack", "shelves", "checkout", "cashier", "counter", "products"] },
  ];

  const scores = new Map();
  for (const rule of RULES) scores.set(rule.room, 0);

  for (const l of labels) {
    for (const rule of RULES) {
      for (const k of rule.keys) {
        if (l.includes(k)) {
          scores.set(rule.room, (scores.get(rule.room) || 0) + 1);
        }
      }
    }
  }

  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  const second = sorted[1];

  if (!best || best[1] <= 0) return null;

  const separation = second ? best[1] - second[1] : best[1];
  const confidence = Math.max(0.45, Math.min(0.9, 0.45 + best[1] * 0.08 + separation * 0.05));

  // require at least mild evidence
  if (best[1] < 2) return null;

  return {
    roomType: best[0],
    confidence,
    scores: Object.fromEntries(scores),
  };
}

/* ===============================
   STRICT VISUAL REQUIREMENTS
   =============================== */
/* ===============================
   ✅ PALETTE ENFORCEMENT HELPERS (NEW)
   ✅ Only affects prompt text; no behavior changes elsewhere
   =============================== */
function formatPaletteLine(palette) {
  const colors = Array.isArray(palette?.colors) ? palette.colors : [];
  if (!colors.length) return "";

  return colors
    .slice(0, 6)
    .map((c) => `${String(c?.name || "Color").trim()} ${String(c?.hex || "").toUpperCase()}`.trim())
    .join(", ");
}

function buildPaletteApplicationRules(palette) {
  const colors = Array.isArray(palette?.colors) ? palette.colors : [];
  if (!colors.length) return "";

  const c0 = colors[0] || {};
  const c1 = colors[1] || colors[0] || {};
  const c2 = colors[2] || colors[0] || {};
  const c3 = colors[3] || colors[1] || colors[0] || {};

  const n0 = String(c0.name || "Color 1").trim();
  const n1 = String(c1.name || "Color 2").trim();
  const n2 = String(c2.name || "Color 3").trim();
  const n3 = String(c3.name || "Color 4").trim();

  const h0 = String(c0.hex || "").toUpperCase();
  const h1 = String(c1.hex || "").toUpperCase();
  const h2 = String(c2.hex || "").toUpperCase();
  const h3 = String(c3.hex || "").toUpperCase();

  return [
    "PALETTE ENFORCEMENT (MANDATORY):",
    `- Use ONLY these colors: ${formatPaletteLine(palette)}`,
    "",
    "COLOR APPLICATION RULES (MUST FOLLOW):",
    `- Walls (dominant): ${n0} ${h0}`,
    `- Large furniture (bed/sofa/cabinets): ${n1} ${h1}`,
    `- Textiles (curtains, bedding, rug): ${n2} ${h2}`,
    `- Small accents (pillows, decor, toys): ${n3} ${h3}`,
    "",
    "STRICT PALETTE RULES:",
    "- No random colors outside the palette",
    "- No default white/gray substitution unless included in the palette",
    "- Ensure at least TWO visible accents use the palette accent colors",
    "- Do NOT desaturate or mute the palette colors",
  ].join("\n");
}

function buildStrictVisualRequirements({ palette, layoutSuggestions, style, room }) {
  const paletteColors = Array.isArray(palette?.colors) ? palette.colors : [];

  const paletteLine =
    paletteColors.length > 0
      ? `Use this EXACT color palette ONLY (no new dominant colors): ${formatPaletteLine(palette)}.`
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

/* ===============================
   ✅ MAIN ORCHESTRATOR
   =============================== */
export async function orchestrateChat({
  sessionId,
  message,
  mode = "generate",

  // ✅ image = base64 (img2img)
  image = null,

  // ✅ imagePath = local temp file path (python detect)
  imagePath = null,

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

  // ✅ Resolve roomType (text-based first)
  let finalRoomType = resolveFinalRoomType({
    rawMessage,
    classified: spaceResult,
    previousSession,
  });

  /* ===============================
     ✅ NEW: EARLY image-based room inference
     - fixes: "ibang part ng bahay" but still becomes living_room
     - fixes: placeholder message + photo uses previous session roomType
     =============================== */
  let detectionResult = null;
  let detectedNeeds = [];
  let inferredFromImage = null;

  const shouldTryImageInference =
    !!imagePath &&
    (
      finalRoomType === "unknown" ||
      isPlaceholderMessage(rawMessage) ||
      looksLikeNewDesignRequest(rawMessage)
    );

  if (shouldTryImageInference) {
    try {
      detectionResult = await detectRoomObjects(imagePath);
      detectedNeeds = extractDetectedNeeds(detectionResult);

      inferredFromImage = inferRoomTypeFromDetections(detectionResult);

      if (inferredFromImage?.roomType && inferredFromImage?.confidence >= 0.55) {
        finalRoomType = toSnakeRoomType(inferredFromImage.roomType);
      }
    } catch (e) {
      console.warn("Early image inference failed:", e?.message || e);
      detectionResult = null;
      detectedNeeds = [];
      inferredFromImage = null;
    }
  }

  if (finalRoomType === "unknown") {
    return {
      status: "NEEDS_CLARIFICATION",
      sessionId: resolvedSessionId,
      data: {
        intent,
        space: currentSpaceType,
        message:
          "I couldn’t confirm the room type. Please specify: bedroom, living room, kitchen, dining room, bathroom, home office, balcony/terrace, patio, roof deck, garden, laundry room, storage room, or a small business (sari-sari, retail, cafe, milktea, bakery, etc.).",
        debug: {
          classifier: spaceResult,
          finalRoomType,
          inferredFromImage,
        },
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
     7) ✅ Object detection uses imagePath ONLY
     (reuse early detection if already done)
     =============================== */
  if (!detectionResult && imagePath) {
    try {
      detectionResult = await detectRoomObjects(imagePath);
      detectedNeeds = extractDetectedNeeds(detectionResult);
    } catch (e) {
      console.warn("Object detection failed:", e?.message || e);
      detectionResult = null;
      detectedNeeds = [];
    }
  }

  /* ===============================
     8) Layout + suggestions
     =============================== */
  const layoutObj =
    typeof generateLayout === "function" ? generateLayout(room, detectionResult || null) : null;

  const layout = layoutObj || { summary: "", zones: [], placements: [], items: [] };

  const layoutSuggestions =
    Array.isArray(layout?.placements) && layout.placements.length > 0
      ? layout.placements
          .slice(0, 8)
          .map((p) => `${p.item}: ${p.position}${p.confidence ? ` (conf ${p.confidence})` : ""}`)
      : [];

  /* ===============================
     9) Furniture matching + sourcing
     =============================== */
  let furniture = [];
  try {
    const out = getFurnitureMatches({
      roomType: room.type,
      style,
      palette,
      layoutSuggestions,
      // overrideNeeds: detectedNeeds, // enable only if you implemented it
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
     ✅ initImage must be base64 (image), NOT imagePath
     =============================== */
  const initImage = isEdit ? image || activeSession?.lastImage || null : null;

  // for UI compare: prefer base64 image or lastImage
  const inputImage = image || activeSession?.lastImage || null;

  /* ===============================
     12) strict wrapper
     ✅ ONLY palette-related prompt enforcement is added here
     =============================== */
  const strictReq = buildStrictVisualRequirements({
    palette,
    layoutSuggestions,
    style,
    room,
  });

  const paletteRules = buildPaletteApplicationRules(palette);

  const finalImagePrompt = [
    "photorealistic interior photo, ultra realistic",
    strictReq,
    paletteRules,
    "USER REQUEST:",
    rawMessage,
    "DESIGN BRIEF:",
    imagePrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

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

      detections: detectionResult,
      detectedNeeds,

      isEdit,
      isNewDesign,
      inputImage,

      debug: {
        classifier: spaceResult,
        finalRoomType: room.type,
        inferredFromImage,
        layoutItemsCount: Array.isArray(layout?.items) ? layout.items.length : 0,
        furnitureCount: furniture.length,
        detectedObjectsCount: Array.isArray(detectionResult?.objects) ? detectionResult.objects.length : 0,
        detectedBoxesCount: Array.isArray(detectionResult?.boxes) ? detectionResult.boxes.length : 0,
      },
    },
  };
}
