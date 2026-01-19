import cors from "cors";
import "dotenv/config";
import express from "express";
import multer from "multer";
import { startAIDesignFlow } from "./index.js";

const app = express();

/* ===============================
   CONFIG
   =============================== */
const PORT = process.env.PORT || 3001;
const MAX_IMAGE_MB = 10;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/* ===============================
   MULTER (MEMORY)
   =============================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
});

/* ===============================
   MIDDLEWARE
   =============================== */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["POST", "GET"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ===============================
   HELPERS
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
    return `Use the attached photo as reference.
Keep the same room layout, camera angle, and furniture positions.
Only apply design refinements (materials, colors, lighting, styling).
Do not change the room structure.`;
  }

  return `Use the attached photo as reference.
Keep the same room layout and camera perspective.
Improve the design realistically with better styling, materials, and lighting.`;
}

function looksLikeEditRequest(message = "") {
  const t = String(message || "").toLowerCase();
  return /(make it|change|switch|convert|turn it|adjust|improve|upgrade|refine|minimalist|modern|industrial|scandinavian|japandi|boho|luxury|rustic|coastal|warmer|cooler|brighter|darker|add|remove)/i.test(
    t
  );
}

function resolveMode({ rawMode, hasImage, message }) {
  const normalized = String(rawMode || "generate").toLowerCase();

  // No image: keep requested mode (generate/edit) — backend can return text-only.
  if (!hasImage) {
    return normalized === "update" ? "edit" : normalized;
  }

  // With image: enforce edit when appropriate
  if (normalized === "edit" || normalized === "update") return "edit";
  if (looksLikeEditRequest(message)) return "edit";

  // Requirement: any attached photo behaves like img2img edit
  return "edit";
}

/* ===============================
   HEALTH CHECK
   =============================== */
app.get("/", (_, res) => {
  res.status(200).send("AI Design Server is running");
});

/* ===============================
   AI DESIGN ENDPOINT
   =============================== */
app.post("/ai/design", upload.single("image"), async (req, res) => {
  console.log("📩 /ai/design HIT");

  try {
    let { message, mode, sessionId } = req.body;
    const hasImage = Boolean(req.file);

    console.log("➡ Message:", message);
    console.log("➡ Mode:", mode);
    console.log("➡ Session:", sessionId || "(new)");
    console.log("➡ Has image:", hasImage);

    /* ---------- Image validation + base64 ---------- */
    let base64Image = null;

    if (hasImage) {
      const mime = req.file.mimetype || "";
      if (!ALLOWED_MIME.has(mime)) {
        return res.status(400).json({
          error: "Unsupported image type. Use JPG, PNG, or WEBP.",
        });
      }

      const base64 = req.file.buffer.toString("base64");
      base64Image = `data:${mime};base64,${base64}`;
    }

    /* ---------- Message rules ---------- */
    // If no image, message is required
    if (!hasImage && (!message || typeof message !== "string" || !message.trim())) {
      return res.status(400).json({ error: "Message is required" });
    }

    // If image exists but message is placeholder/empty, inject default prompt
    if (hasImage && isPlaceholderMessage(message)) {
      message = defaultPromptForImage(mode);
      console.log("🧩 Injected default prompt for image-based request");
    }

    // Final message validation
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    /* ---------- Resolve mode ---------- */
    const normalizedMode = resolveMode({ rawMode: mode, hasImage, message });

    // ✅ IMPORTANT CHANGE:
    // Do NOT block "edit" without image.
    // We allow text-only customization responses; image generation is decided in orchestrator.
    const result = await startAIDesignFlow({
      message,
      mode: normalizedMode,
      image: base64Image, // base64 data URL (or null)
      sessionId,
    });

    console.log("✅ AI response generated");

    // Return input image too (for UI original photo display)
    return res.status(200).json({
      ...result,
      inputImage: base64Image || null,
    });
  } catch (error) {
    console.error("❌ AI ERROR:", error?.message || error);

    return res.status(500).json({
      error: "AI processing failed",
      details: error?.message || String(error),
    });
  }
});

/* ===============================
   START SERVER
   =============================== */
app.listen(PORT, () => {
  console.log(`🚀 AI Design Server running on port ${PORT}`);
});
