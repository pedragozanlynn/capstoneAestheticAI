import cors from "cors";
import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { startAIDesignFlow } from "./index.js";

const app = express();

/* ===============================
   CONFIG
   =============================== */
const PORT = process.env.PORT || 3001;
const MAX_IMAGE_MB = 10;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/* ===============================
   MULTER (MEMORY) - keep as-is
   We'll manually write to temp file.
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

function extFromMime(mime = "") {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function writeTempImageFromBuffer(buffer, mime) {
  const ext = extFromMime(mime);
  const filename = `aestheticai_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}.${ext}`;
  const tempPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
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

  // Helps prevent server crash when client aborts mid-request
  req.on("aborted", () => console.warn("⚠️ Request aborted by client."));
  req.on("close", () => {
    // do not spam logs; optional
  });

  let tempImagePath = null;

  try {
    let { message, mode, sessionId } = req.body;
    const hasImage = Boolean(req.file);

    console.log("➡ Message:", message);
    console.log("➡ Mode:", mode);
    console.log("➡ Session:", sessionId || "(new)");
    console.log("➡ Has image:", hasImage);

    /* ---------- Image validation + TEMP PATH for detection ---------- */
    let base64Image = null;

    if (hasImage) {
      const mime = req.file.mimetype || "";
      if (!ALLOWED_MIME.has(mime)) {
        return res.status(400).json({
          error: "Unsupported image type. Use JPG, PNG, or WEBP.",
        });
      }

      // ✅ Create a TEMP FILE PATH for object detection (prevents ENAMETOOLONG)
      tempImagePath = writeTempImageFromBuffer(req.file.buffer, mime);

      // ✅ Optional: base64 ONLY for UI preview (do NOT pass to detector)
      // If you want to reduce payload, you can comment these 2 lines out.
      const base64 = req.file.buffer.toString("base64");
      base64Image = `data:${mime};base64,${base64}`;
    }

    /* ---------- Message rules ---------- */
    if (!hasImage && (!message || typeof message !== "string" || !message.trim())) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (hasImage && isPlaceholderMessage(message)) {
      message = defaultPromptForImage(mode);
      console.log("🧩 Injected default prompt for image-based request");
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    /* ---------- Resolve mode ---------- */
    const normalizedMode = resolveMode({ rawMode: mode, hasImage, message });

    // ✅ IMPORTANT:
    // Pass BOTH:
    // - imagePath for object detection (short)
    // - image base64 for any img2img model (if your flow still needs it)
    const result = await startAIDesignFlow({
      message,
      mode: normalizedMode,
      image: base64Image,       // keep for HF / UI if needed
      imagePath: tempImagePath, // ✅ NEW: used for detector
      sessionId,
    });

    console.log("✅ AI response generated");

    return res.status(200).json({
      ...result,
      inputImage: base64Image || null, // UI original display
    });
  } catch (error) {
    console.error("❌ AI ERROR:", error?.message || error);

    return res.status(500).json({
      error: "AI processing failed",
      details: error?.message || String(error),
    });
  } finally {
    // ✅ Cleanup temp file
    if (tempImagePath) {
      try {
        fs.unlinkSync(tempImagePath);
      } catch {}
    }
  }
});

/* ===============================
   START SERVER (with longer timeouts)
   =============================== */
const server = http.createServer(app);

// reduce "Error: aborted" when heavy work
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 AI Design Server running on port ${PORT}`);
});
