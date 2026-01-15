import { getColorPalette } from "../design-engine/colorEngine.js";
import { getDecorTips } from "../design-engine/decorTips.js";
import { analyzeRoom } from "../design-engine/layoutAnalyzer.js";
import { detectStyle } from "../design-engine/styleEngine.js";
import { parseIntent } from "../llm/intentParser.js";
import { buildInteriorPrompt } from "../llm/promptBuilder.js";
import { classifySpace } from "../llm/spaceClassifier.js";
import { getSession, saveSession } from "../memory/designSessionStore.js";
import { generateInteriorImage } from "../visualization/imageGenerator.js";

/* ===============================
   🧹 NORMALIZE MESSAGE
   =============================== */
function normalizeMessage(message = "") {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s.x]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ===============================
   🔍 SPACE DETECTION
   =============================== */
function mentionsNewSpace(message = "") {
  return /(bedroom|living room|office|workspace|coffee shop|cafe|restaurant|kitchen|studio)/i.test(
    message
  );
}

/* ===============================
   🔒 LAST-RESORT FALLBACKS
   =============================== */
function fallbackExplanation(roomType, style) {
  return `This ${roomType} is designed in a ${style.name.toLowerCase()} style with a clear layout, cohesive materials, and a comfortable visual balance.`;
}

const fallbackTips = [
  "Refine lighting placement to enhance spatial depth",
  "Balance structured elements with softer textures",
  "Maintain comfortable spacing between key furniture pieces",
];

/* ===============================
   🚀 FINAL ORCHESTRATOR (FIXED)
   =============================== */
export async function orchestrateChat({ sessionId, message }) {
  console.log("\n================ AI ORCHESTRATOR ================");
  console.log("📩 Incoming message:", message);

  if (!message) throw new Error("No message provided");

  const cleanMessage = normalizeMessage(message);
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
    (userMentionsSpace &&
      currentRoomType !== previousSession?.room?.type);

  const isEdit =
    !!previousSession &&
    !isNewDesign &&
    (/make it|add|remove|adjust|warmer|cooler|brighter|darker/i.test(
      cleanMessage
    ) ||
      intent === "CHANGE_STYLE");

  const activeSession = isNewDesign ? null : previousSession;

  /* ===============================
     4️⃣ ROOM ANALYSIS
     =============================== */
  const room = activeSession?.room || {
    ...analyzeRoom(cleanMessage),
    type: currentRoomType,
  };

  /* ===============================
     5️⃣ STYLE DETECTION
     =============================== */
  const style = detectStyle({
    message: cleanMessage,
    previousStyle: activeSession?.style,
    isEdit,
    spaceType: currentSpaceType,
  });

  /* ===============================
     6️⃣ COLOR PALETTE
     =============================== */
  const palette =
    activeSession?.palette ||
    (await getColorPalette(style, cleanMessage));

  /* ===============================
     7️⃣ IMAGE PROMPT (SOURCE OF TRUTH)
     =============================== */
  const imagePrompt = buildInteriorPrompt({
    userMessage: cleanMessage,
    room,
    style,
    palette,
    previousPrompt: activeSession?.lastPrompt,
    isEdit,
    spaceType: currentSpaceType,
  });

  console.log("🧠 IMAGE PROMPT:\n", imagePrompt);

  /* ===============================
     8️⃣ IMAGE GENERATION
     =============================== */
  const image = await generateInteriorImage({
    prompt: `3d interior render, ultra realistic, architectural visualization, ${imagePrompt}`,
    initImage: isEdit ? activeSession?.lastImage : null,
    strength: isEdit ? 0.18 : 0.85,
  });

  decor = await getDecorTips({
    style,
    roomType: currentRoomType,
    palette,
    userMessage: cleanMessage,
    imagePrompt, // 🔥 REQUIRED
  });
  
  /* ===============================
     💾 SAVE SESSION
     =============================== */
  saveSession(sessionId, {
    lastImage: image,
    lastPrompt: imagePrompt,
    room,
    style,
    palette,
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
    image,
    data: {
      intent,
      space: currentSpaceType,
      room,
      style,
      palette,

      explanation:
        decor?.explanation ||
        fallbackExplanation(currentRoomType, style),

      tips:
        Array.isArray(decor?.tips) && decor.tips.length === 3
          ? decor.tips
          : fallbackTips,

      isEdit,
      isNewDesign,
    },
  };
}
