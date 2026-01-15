import crypto from "crypto";
import { orchestrateChat } from "./chatbot/orchestrator.js";

/**
 * startAIDesignFlow
 * ✅ Validates inputs
 * ✅ Uses stable sessionId (if provided) so style/palette/layout don't reset every message
 * ✅ Passes mode + image through to orchestrator (supports edit flows)
 * ✅ Auto-forces edit when an image is provided (so upload/capture + prompt modifies the photo)
 * ✅ Returns a consistent frontend contract (never undefined fields)
 */
export async function startAIDesignFlow({
  message,
  mode = "generate",
  image = null, // base64 data URL from server (req.file -> base64)
  sessionId = null,
} = {}) {
  console.log("🚀 startAIDesignFlow CALLED");

  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (!cleanMessage) throw new Error("Message is required");

  // ✅ IMPORTANT: Keep session stable across messages
  const finalSessionId = sessionId || crypto.randomUUID();

  // ✅ Normalize mode + enforce edit when an image exists
  const normalizedMode = String(mode || "generate").toLowerCase();
  const modeSaysEdit = normalizedMode === "edit" || normalizedMode === "update";

  // If a photo is attached, we want img2img behavior (preserve layout, apply prompt)
  const hasImage = Boolean(image);
  const effectiveMode = hasImage ? "edit" : normalizedMode;

  // ✅ Drive orchestrator edit behavior deterministically
  // forcedEdit = true when we have image or explicit edit/update
  const forcedEdit = hasImage || modeSaysEdit;

  const result = await orchestrateChat({
    sessionId: finalSessionId,
    message: cleanMessage,
    mode: effectiveMode,
    image, // init image for edits (data URL/base64) or null
    isEdit: forcedEdit, // orchestrator supports forced edit
  });

  // ✅ Safe extraction
  const style = result?.data?.style || { name: "Modern" };
  const room = result?.data?.room || {};
  const tips = Array.isArray(result?.data?.tips) ? result.data.tips : [];
  const explanation = typeof result?.data?.explanation === "string" ? result.data.explanation : "";
  const palette = result?.data?.palette || null;

  // ✅ Frontend Response Contract (consistent shape)
  return {
    sessionId: finalSessionId, // ✅ send back so frontend can reuse on next message
    image: result?.image || null,
    data: {
      intent: result?.data?.intent || "UNKNOWN",
      space: result?.data?.space || "residential",

      style,   // { name, confidence?, locked? }
      palette, // { name, colors: [...] } or null

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

      // Helpful flags for UI
      isEdit: Boolean(result?.data?.isEdit),
      isNewDesign: Boolean(result?.data?.isNewDesign),

      // Optional extras if your orchestrator returns them
      layout: result?.data?.layout || null,

      // Debug/telemetry (optional but helpful)
      mode: effectiveMode,
      hasImage,
    },
  };
}
