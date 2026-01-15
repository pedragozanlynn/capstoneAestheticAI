import { getColorPalette } from "../design-engine/colorEngine.js";
import { getDecorTips } from "../design-engine/decorTips.js";
import { analyzeRoom } from "../design-engine/layoutAnalyzer.js";
import { detectStyle } from "../design-engine/styleEngine.js";
import { parseIntent } from "../llm/intentParser.js";
import { buildInteriorPrompt } from "../llm/promptBuilder.js";
import { classifySpace } from "../llm/spaceClassifier.js";
import { getSession, saveSession } from "../memory/designSessionStore.js";
import { generateInteriorImage } from "../visualization/imageGenerator.js";
import { generateLayout } from "../design-engine/layoutGenerator.js"; // ✅ if you implemented layout gen

/* ===============================
   🧹 NORMALIZE MESSAGE
   =============================== */
function normalizeMessage(message = "") {
  return String(message)
    .toLowerCase()
    .replace(/[^a-z0-9\s.x]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ===============================
   🔍 SPACE DETECTION
   =============================== */
function mentionsNewSpace(message = "") {
  return /\b(bedroom|living\s*room|office|workspace|coffee\s*shop|cafe|restaurant|kitchen|studio|bathroom|dining|retail|salon|spa|hotel)\b/i.test(
    message
  );
}

/* ===============================
   🔒 LAST-RESORT FALLBACKS
   =============================== */
function fallbackExplanation(roomType, style) {
  return `This ${roomType} is designed in a ${String(style?.name || "modern").toLowerCase()} style with a clear layout and practical material choices.`;
}

const fallbackTips = [
  "Adjust lighting placement to better support how the room is used",
  "Add one contrasting material to create depth without clutter",
  "Keep clear walkways between key furniture pieces",
];

/* ===============================
   ✅ ADD: Placeholder/attachment message detection
   (so image + “Photo captured…” becomes a real edit prompt)
   =============================== */
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
   🚀 FINAL ORCHESTRATOR (UPDATED + MODE + IMAGE SUPPORT)
   =============================== */
export async function orchestrateChat({
  sessionId,
  message,
  mode = "generate",
  image = null,
  isEdit: forcedEdit = null,
} = {}) {
  console.log("\n================ AI ORCHESTRATOR ================");
  console.log("📩 Incoming message:", message);

  /* ===============================
     ✅ ADD: if an image is attached but message is placeholder,
     inject a strong default prompt so edit behavior is correct.
     =============================== */
  if (image && isPlaceholderMessage(message)) {
    message = defaultPromptForImage(mode);
  }

  const cleanMessage = normalizeMessage(message);
  if (!cleanMessage) throw new Error("No message provided");

  const previousSession = getSession(sessionId);

  /* ===============================
     1️⃣ INTENT
     =============================== */
  let intent = "UNKNOWN";
  try {
    const intentResult = await parseIntent(cleanMessage);
    intent = intentResult?.intent || "UNKNOWN";
  } catch {}

  /* ===============================
     2️⃣ SPACE CLASSIFICATION
     =============================== */
  const userMentionsSpace = mentionsNewSpace(cleanMessage);

  const spaceResult =
    !previousSession || userMentionsSpace
      ? await classifySpace(cleanMessage)
      : previousSession.space;

  const currentSpaceType = spaceResult?.spaceType || "residential";
  const currentRoomType = spaceResult?.roomType || "generic";

  /* ===============================
     3️⃣ SESSION MODE
     =============================== */
  const isNewDesign =
    !previousSession ||
    (userMentionsSpace && currentRoomType !== previousSession?.room?.type);

  const normalizedMode = String(mode || "generate").toLowerCase();
  const modeSaysEdit = normalizedMode === "edit" || normalizedMode === "update";

  const inferredEdit =
    !!previousSession &&
    !isNewDesign &&
    (modeSaysEdit ||
      /make it|add|remove|adjust|warmer|cooler|brighter|darker|bigger|smaller|switch|change/i.test(
        cleanMessage
      ) ||
      intent === "CHANGE_STYLE");

  /* ===============================
     ✅ ADD: if an image is present AND message looks like an edit request,
     force edit even if previousSession doesn't exist.
     (Key for: upload/capture photo + “make it minimalist”.)
     =============================== */
  const forceEditBecauseImageAndEditText = !!image && looksLikeEditRequest(cleanMessage);

  const isEdit =
    typeof forcedEdit === "boolean"
      ? forcedEdit
      : (inferredEdit || forceEditBecauseImageAndEditText || (modeSaysEdit && !!image));

  const activeSession = isNewDesign ? null : previousSession;

  /* ===============================
     4️⃣ ROOM ANALYSIS
     =============================== */
  const room = activeSession?.room || {
    ...analyzeRoom(cleanMessage),
    type: currentRoomType,
  };

  /* ===============================
     5️⃣ STYLE DETECTION (LOCKED)
     =============================== */
  const style = detectStyle({
    message: cleanMessage,
    previousStyle: activeSession?.style,
    isEdit,
    spaceType: currentSpaceType,
  });

  /* ===============================
     6️⃣ COLOR PALETTE (MEMORY-FIRST)
     =============================== */
  const palette =
    activeSession?.palette || (await getColorPalette(style, cleanMessage));

  /* ===============================
     7️⃣ IMAGE PROMPT (SOURCE OF TRUTH)
     =============================== */
  // ✅ buildInteriorPrompt returns { prompt, emphasis }
  const { prompt: imagePrompt, emphasis } = buildInteriorPrompt({
    userMessage: cleanMessage,
    room,
    style,
    palette,
    previousPrompt: activeSession?.lastPrompt,
    isEdit,
    spaceType: currentSpaceType,
  });

  console.log("🧠 IMAGE PROMPT:\n", imagePrompt);
  console.log("🎯 DECOR EMPHASIS:", emphasis);

  /* ===============================
     8️⃣ INIT IMAGE SOURCE (EDIT)
     =============================== */
  const initImage = isEdit ? image || activeSession?.lastImage || null : null;

  /* ===============================
     ✅ ADD: keep a copy of the “source/original” image for UI
     - If user uploaded/captured now -> use `image`
     - Else if continuing edits -> use last saved image
     =============================== */
  const inputImage = image || activeSession?.lastImage || null;

  /* ===============================
     9️⃣ IMAGE GENERATION
     =============================== */
  const imageOut = await generateInteriorImage({
    prompt: `3d interior render, ultra realistic, architectural visualization, ${imagePrompt}`,
    initImage,
    strength: isEdit ? 0.18 : 0.85,
  });

  /* ===============================
     🔟 OPTIONAL: LAYOUT GENERATION
     =============================== */
  const layout = generateLayout ? generateLayout(room) : null;

  /* ===============================
     1️⃣1️⃣ DECOR TIPS (PASS RAW PROMPT + EMPHASIS)
     =============================== */
  const decor = await getDecorTips({
    style,
    roomType: currentRoomType,
    palette,
    userMessage: cleanMessage,
    imagePrompt, // ✅ pass raw prompt (no wrapper string)
    emphasis,    // ✅ pass emphasis so tips vary by design
  });

  /* ===============================
     💾 SAVE SESSION
     =============================== */
  saveSession(sessionId, {
    lastImage: imageOut,
    lastPrompt: imagePrompt,
    room,
    style,
    palette,
    decor,
    emphasis,
    space: {
      spaceType: currentSpaceType,
      roomType: currentRoomType,
    },
  });

  /* ===============================
     ✅ FINAL RESPONSE (UI SAFE)
     =============================== */
  return {
    status: "SUCCESS",

    // ✅ ADD: return the original/source photo so frontend can display it
    inputImage,

    // existing field (generated)
    image: imageOut,

    data: {
      intent,
      space: currentSpaceType,
      room,
      style,
      palette,

      explanation:
        decor?.explanation || fallbackExplanation(currentRoomType, style),

      tips:
        Array.isArray(decor?.tips) && decor.tips.length === 3
          ? decor.tips
          : fallbackTips,

      layout,
      isEdit,
      isNewDesign,

      // ✅ ADD: also expose it inside data if you prefer frontend to read it here
      inputImage,
    },
  };
}
