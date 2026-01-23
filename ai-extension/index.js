import crypto from "crypto";
import sharp from "sharp";
import { orchestrateChat } from "./chatbot/orchestrator.js";

/**
 * startAIDesignFlow
 * ✅ Stable session
 * ✅ Supports img2img edit (base64)
 * ✅ Supports object detection (imagePath)
 * ✅ Returns layoutSuggestions + furniture links for UI
 * ✅ NEVER returns undefined fields
 */
export async function startAIDesignFlow({
  message,
  mode = "generate",
  image = null,      // base64 data URL (for img2img + UI preview)
  imagePath = null,  // ✅ NEW: local temp file path for Python detection
  sessionId = null,
    // ✅ NEW (size lock)
    width = null,
    height = null,
} = {}) {
  console.log("🚀 startAIDesignFlow CALLED");

  const rawMessage = typeof message === "string" ? message.trim() : "";
  if (!rawMessage) throw new Error("Message is required");

    // ✅ NEW: output size request (exact match)
    const targetWidth = Number.isFinite(Number(width)) ? parseInt(width, 10) : null;
    const targetHeight = Number.isFinite(Number(height)) ? parseInt(height, 10) : null;
  
    const hasTargetSize =
      targetWidth && targetHeight && targetWidth > 0 && targetHeight > 0;
  

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
    imagePath,
    isEdit: forcedEdit,
    width: hasTargetSize ? targetWidth : undefined,
    height: hasTargetSize ? targetHeight : undefined,
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
  const layoutSuggestions = Array.isArray(data.layoutSuggestions) ? data.layoutSuggestions : [];

  // ✅ CRITICAL: Furniture links
  const furniture = Array.isArray(data.furniture) ? data.furniture : [];
  const furnitureMatches = Array.isArray(data.furnitureMatches)
    ? data.furnitureMatches
    : furniture;

  // For image comparison UI
  const inputImage =
    result?.inputImage || data?.inputImage || (hasImage ? image : null);
  // ✅ NEW: force AI output image to match requested size (if provided)
  let finalImage = result?.image || null;

  if (hasTargetSize && finalImage) {
    try {
      let base64 = null;

      // data URL case: "data:image/jpeg;base64,...."
      if (typeof finalImage === "string" && finalImage.startsWith("data:image/")) {
        const idx = finalImage.indexOf("base64,");
        base64 = idx !== -1 ? finalImage.slice(idx + "base64,".length) : null;
      }
      // raw base64 case (common): long string without prefix
      else if (typeof finalImage === "string" && finalImage.length > 200 && !finalImage.startsWith("http")) {
        base64 = finalImage;
      }
      // URL case: fetch then resize (only if fetch exists)
      else if (typeof finalImage === "string" && finalImage.startsWith("http")) {
        if (typeof fetch === "function") {
          const resp = await fetch(finalImage);
          const buf = Buffer.from(await resp.arrayBuffer());
          const resized = await sharp(buf)
            .resize(targetWidth, targetHeight, { fit: "fill" })
            .jpeg({ quality: 95 })
            .toBuffer();
          finalImage = `data:image/jpeg;base64,${resized.toString("base64")}`;
        }
      }

      // If we got base64, resize it
      if (base64) {
        const inputBuf = Buffer.from(base64, "base64");
        const resized = await sharp(inputBuf)
          .resize(targetWidth, targetHeight, { fit: "fill" }) // exact WxH
          .jpeg({ quality: 95 })
          .toBuffer();

        finalImage = `data:image/jpeg;base64,${resized.toString("base64")}`;
      }
    } catch (e) {
      // ✅ Fail-safe: if resize fails, return original (no break)
      console.log("⚠️ resize failed, returning original image:", e?.message || e);
    }
  }

  // Optional debug/meta
  const emphasis = data.emphasis || null;
  const imagePrompt = data.imagePrompt || null;

  // ✅ DEBUG
  console.log(
    "[AI FLOW] furniture items:",
    furnitureMatches.length,
    furnitureMatches.map((f) => f?.name).filter(Boolean)
  );

  /* ===============================
     FRONTEND RESPONSE CONTRACT
     =============================== */
  return {
    sessionId: finalSessionId,
    inputImage,
    image: finalImage,
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
      furniture: furnitureMatches,
      furnitureMatches: furnitureMatches,

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
