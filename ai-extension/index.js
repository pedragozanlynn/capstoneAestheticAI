import crypto from "crypto";
import { orchestrateChat } from "./chatbot/orchestrator.js";

/**
 * startAIDesignFlow
 * ✅ Stable session
 * ✅ Supports img2img edit
 * ✅ Returns layoutSuggestions + furniture links for UI
 * ✅ NEVER returns undefined fields
 */
export async function startAIDesignFlow({
  message,
  mode = "generate",
  image = null, // base64 data URL
  sessionId = null,
} = {}) {
  console.log("🚀 startAIDesignFlow CALLED");

  const rawMessage = typeof message === "string" ? message.trim() : "";
  if (!rawMessage) throw new Error("Message is required");

  // Stable session
  const finalSessionId = sessionId || crypto.randomUUID();

  const normalizedMode = String(mode || "generate").toLowerCase();
  const modeSaysEdit = normalizedMode === "edit" || normalizedMode === "update";
  const hasImage = Boolean(image);

  // Force edit if image exists
  const effectiveMode = hasImage ? "edit" : normalizedMode;
  const forcedEdit = hasImage || modeSaysEdit;

  const result = await orchestrateChat({
    sessionId: finalSessionId,
    message: rawMessage,
    mode: effectiveMode,
    image,
    isEdit: forcedEdit,
  });

  /* ===============================
     SAFE EXTRACTION
     =============================== */
  const data = result?.data || {};

  const style = data.style || { name: "Modern" };
  const palette = data.palette || null;
  const room = data.room || {};

  const explanation = typeof data.explanation === "string" ? data.explanation : "";
  const tips = Array.isArray(data.tips) ? data.tips : [];

  const layout = data.layout || null;
  const layoutSuggestions = Array.isArray(data.layoutSuggestions)
    ? data.layoutSuggestions
    : [];

  // ✅ CRITICAL: Furniture links
  const furniture = Array.isArray(data.furniture) ? data.furniture : [];

  // For image comparison UI
  const inputImage =
    result?.inputImage || data?.inputImage || (hasImage ? image : null);

  // Optional debug/meta
  const emphasis = data.emphasis || null;
  const imagePrompt = data.imagePrompt || null;

  // ✅ DEBUG (remove later)
  console.log(
    "[AI FLOW] furniture items:",
    furniture.length,
    furniture.map((f) => f.name)
  );

  /* ===============================
     FRONTEND RESPONSE CONTRACT
     =============================== */
  return {
    sessionId: finalSessionId,
    inputImage,
    image: result?.image || null,
    data: {
      intent: data.intent || "UNKNOWN",
      space: data.space || "residential",

      style,
      palette,

      room: {
        type: room?.type || room?.roomType || "generic",
        category: room?.category || "residential",
        width: room?.width,
        length: room?.length,
        area: room?.area,
        hasWindow: room?.hasWindow,
        windowSide: room?.windowSide,
        lighting: room?.lighting,
        mood: room?.mood,
        useCase: room?.useCase,
        furniture: room?.furniture,
        constraints: room?.constraints,
      },

      explanation,
      tips,

      // ✅ REQUIRED FOR UI
      layout,
      layoutSuggestions,
      furniture, // ✅ THIS FIXES YOUR UI ISSUE

      // UI flags
      isEdit: Boolean(data.isEdit),
      isNewDesign: Boolean(data.isNewDesign),

      // Meta
      mode: effectiveMode,
      hasImage,

      emphasis,
      imagePrompt,
    },
  };
}
