import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ HF Router Chat Completions endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

/**
 * ✅ Use a fallback chain of chat-compatible models.
 */
const HF_CHAT_MODELS = [
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
];

/**
 * Parse user intent for interior design requests.
 * Always returns: { intent: "...", confidence: number, source: "rules"|"llm"|"fallback" }
 */
export async function parseIntent(message = "") {
  const rawText = (message || "").trim();

  if (!rawText) return { intent: "UNKNOWN", confidence: 0.3, source: "fallback" };

  // ✅ 1) QUICK PROMPT OVERRIDE (fast + stable)
  const quickIntent = quickPromptIntent(rawText);
  if (quickIntent) return { intent: quickIntent, confidence: 0.95, source: "rules" };

  // ✅ 2) Remove wrapper content from expandQuickPrompt() before classifying
  const cleanText = stripQuickPromptWrapper(rawText);

  // ✅ 3) Rule-based first (cheap + stable)
  const ruleIntent = ruleBasedIntent(cleanText);
  if (ruleIntent && ruleIntent !== "UNKNOWN") {
    return { intent: ruleIntent, confidence: 0.75, source: "rules" };
  }

  // ✅ 4) If no key, rule-based only
  if (!HF_API_KEY) return { intent: ruleIntent, confidence: 0.35, source: "fallback" };

  // ✅ 5) LLM fallback for ambiguous cases
  const prompt = `
Classify the intent of this interior design request.

Possible intents:
- GENERATE_LAYOUT
- APPLY_COLOR_PALETTE
- CHANGE_STYLE
- DECOR_TIPS
- EDIT_IMAGE
- GENERATE_IMAGE
- UNKNOWN

Rules:
- Return ONLY valid JSON (no markdown, no extra text)
- Choose the closest intent
- If user asks to keep the same room and only modify finishes/colors/decor -> EDIT_IMAGE
- If user asks to generate a new design/render from scratch -> GENERATE_IMAGE
- If not sure, use UNKNOWN

Message:
"${cleanText}"

Return JSON exactly:
{ "intent": "..." }
`.trim();

  try {
    const data = await hfChatWithFallback({
      messages: [
        { role: "system", content: "You output strictly valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 60,
    });

    const raw = data?.choices?.[0]?.message?.content;
    const parsed = safeParseJSON(raw);
    const intent = normalizeIntent(parsed?.intent);

    return {
      intent: intent || ruleIntent || "UNKNOWN",
      confidence: intent ? 0.65 : 0.45,
      source: intent ? "llm" : "fallback",
    };
  } catch (err) {
    console.warn("HF intent exception:", err?.message || err);
    return { intent: ruleIntent, confidence: 0.35, source: "fallback" };
  }
}

/* ===============================
   ✅ QUICK PROMPT SUPPORT
   =============================== */

function quickPromptIntent(text = "") {
  const t = String(text).toUpperCase();

  // Layout
  if (
    t.includes("QUICK LAYOUT REQUEST:") ||
    t.includes("LAYOUT EDIT:") ||
    t.includes("LAYOUT REQUEST:")
  ) {
    return "GENERATE_LAYOUT";
  }

  // Style change
  if (
    t.includes("STYLE REQUEST:") ||
    t.includes("STYLE/EDIT REQUEST:") ||
    t.includes("CHANGE STYLE:")
  ) {
    return "CHANGE_STYLE";
  }

  // Palette
  if (t.includes("PALETTE REQUEST:") || t.includes("COLOR PALETTE:") || t.includes("HEX:")) {
    return "APPLY_COLOR_PALETTE";
  }

  // Decor tips
  if (t.includes("DECOR REQUEST:") || t.includes("DECORATION TIPS:")) {
    return "DECOR_TIPS";
  }

  // Image edit (img2img)
  if (
    t.includes("CUSTOMIZE:") ||
    t.includes("EDIT IMAGE:") ||
    t.includes("KEEP SAME LAYOUT") ||
    t.includes("REFERENCE IMAGE")
  ) {
    return "EDIT_IMAGE";
  }

  // Generate image (text2img)
  if (t.includes("GENERATE:") || t.includes("NEW DESIGN:") || t.includes("NEW RENDER:")) {
    return "GENERATE_IMAGE";
  }

  return null;
}

/**
 * Removes wrapper phrases so the LLM/rules see the core user message.
 */
function stripQuickPromptWrapper(text = "") {
  let s = String(text || "").trim();

  // Remove known prefix labels if present
  s = s.replace(/^QUICK LAYOUT REQUEST:\s*/i, "");
  s = s.replace(/^LAYOUT EDIT:\s*/i, "");
  s = s.replace(/^LAYOUT REQUEST:\s*/i, "");
  s = s.replace(/^STYLE REQUEST:\s*/i, "");
  s = s.replace(/^STYLE\/EDIT REQUEST:\s*/i, "");
  s = s.replace(/^PALETTE REQUEST:\s*/i, "");
  s = s.replace(/^DECOR REQUEST:\s*/i, "");
  s = s.replace(/^CUSTOMIZE:\s*/i, "");
  s = s.replace(/^EDIT IMAGE:\s*/i, "");
  s = s.replace(/^GENERATE:\s*/i, "");
  s = s.replace(/^NEW DESIGN:\s*/i, "");

  // Remove "Provide:" boilerplate if present (keep only before Provide:)
  const idx = s.toLowerCase().indexOf("provide:");
  if (idx >= 0) s = s.slice(0, idx).trim();

  return s.trim();
}

/* ===============================
   HF Chat helper with model fallback
   =============================== */

async function hfChatWithFallback({ messages, temperature = 0, max_tokens = 120 }) {
  let lastErr = null;

  for (const model of HF_CHAT_MODELS) {
    try {
      const res = await fetch(HF_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          top_p: 1,
          max_tokens,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");

        if (res.status === 400 && body.includes("not a chat model")) {
          console.warn(`HF model not chat-compatible: ${model}`);
          lastErr = new Error(`${model} not chat-compatible`);
          continue;
        }

        if (res.status === 429 || res.status === 503) {
          console.warn(`HF model temporarily unavailable: ${model} (${res.status})`);
          lastErr = new Error(`${model} temporarily unavailable`);
          continue;
        }

        console.warn("HF intent error:", model, res.status, res.statusText, body);
        lastErr = new Error(`HF failed: ${model} ${res.status} ${body}`);
        continue;
      }

      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("HF chat failed: no compatible model worked");
}

/* ===============================
   Rule-based fallback (never fails)
   =============================== */

function ruleBasedIntent(text) {
  const t = String(text || "").toLowerCase();

  // ✅ Image edit cues (highest priority)
  if (
    /\b(edit|customize|revise|tweak)\b/.test(t) &&
    /\b(keep|same|preserve|huwag galawin|wag baguhin)\b/.test(t)
  ) {
    return "EDIT_IMAGE";
  }
  if (/\b(reference image|img2img|same layout|same camera|absolute lock)\b/.test(t)) {
    return "EDIT_IMAGE";
  }

  // ✅ Generate image cues
  if (/\b(generate|render|create|make)\b/.test(t) && /\b(interior|design|room|space)\b/.test(t)) {
    // If it explicitly says "from scratch/new"
    if (/\b(new|from scratch|bagong design|fresh)\b/.test(t)) return "GENERATE_IMAGE";
  }

  // ✅ Change style
  if (
    /\b(change|switch)\s+(the\s+)?style\b/.test(t) ||
    /\bmake it\b.*\b(style|modern|minimalist|cozy|industrial|scandinavian|japandi)\b/.test(t)
  ) {
    return "CHANGE_STYLE";
  }

  // ✅ Color palette
  if (
    /\b(palette|hex|colorway)\b/.test(t) ||
    /\b(color|colors)\b/.test(t)
  ) {
    if (
      /\b(apply|use|set|change|update|match|follow)\b/.test(t) ||
      /\b(#(?:[0-9a-f]{3}|[0-9a-f]{6}))\b/i.test(t)
    ) {
      return "APPLY_COLOR_PALETTE";
    }
  }

  // ✅ Layout generation / arrangement
  if (
    /\b(layout|arrange|arrangement|floor plan|furniture placement|where to put|position|zone|circulation|walkway|walking path)\b/.test(t) ||
    /\b(layout suggestions|placement rules)\b/.test(t) ||
    (/\b(sofa|bed|desk|table|wardrobe|cabinet|tv)\b/.test(t) && /\b(where|place|put|move|rearrange)\b/.test(t))
  ) {
    return "GENERATE_LAYOUT";
  }

  // ✅ Decor tips
  if (/\b(tips|decor|decorate|styling|accessories|curtains|rug|artwork|lighting tips)\b/.test(t)) {
    return "DECOR_TIPS";
  }

  return "UNKNOWN";
}

/* ===============================
   Helpers
   =============================== */

function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeIntent(intent) {
  if (!intent || typeof intent !== "string") return null;
  const v = intent.trim().toUpperCase();

  const allowed = new Set([
    "GENERATE_LAYOUT",
    "APPLY_COLOR_PALETTE",
    "CHANGE_STYLE",
    "DECOR_TIPS",
    "EDIT_IMAGE",
    "GENERATE_IMAGE",
    "UNKNOWN",
  ]);

  return allowed.has(v) ? v : null;
}
