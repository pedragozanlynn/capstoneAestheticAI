import cors from "cors";
import "dotenv/config";
import express from "express";
import multer from "multer";
import { startAIDesignFlow } from "./index.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

/* ===============================
   MIDDLEWARE
   =============================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===============================
   HEALTH CHECK
   =============================== */
app.get("/", (req, res) => {
  console.log("🟢 Health check hit");
  res.send("AI Design Server is running");
});

/* ===============================
   AI DESIGN ENDPOINT
   =============================== */
app.post("/ai/design", upload.single("image"), async (req, res) => {
  console.log("📩 /ai/design endpoint HIT");

  try {
    const { message, mode } = req.body;

    console.log("➡ Message:", message);
    console.log("➡ Mode:", mode);
    console.log("➡ Has image:", !!req.file);

    if (!message) {
      console.warn("⚠️ No message provided");
      return res.status(400).json({
        error: "Message is required",
      });
    }

    const result = await startAIDesignFlow({
      message,
      mode,
      image: req.file || null,
    });

    console.log("✅ AI response generated successfully");

    res.json(result);
  } catch (error) {
    console.error("❌ AI ERROR:", error.message);
    console.error(error.stack);

    res.status(500).json({
      error: "AI processing failed",
      details: error.message,
    });
  }
});

/* ===============================
   START SERVER
   =============================== */
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 AI Design Server running on port ${PORT}`);
});
