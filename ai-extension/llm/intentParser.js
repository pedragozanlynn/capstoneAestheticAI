import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ Supported HF Router endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

// ✅ Model via router (stable with chat/completions)
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

/**
 * Parse user intent for interior design requests.
 * Always returns: { intent: "..." }
 */
export async function parseIntent(message = "") {
  const text = (message || "").trim();

  // ✅ Guaranteed fallback if no key or empty message
  if (!text) return { intent: "UNKNOWN" };
  if (!HF_API_KEY) return { intent: ruleBasedIntent(text) };

  const prompt = `
Classify the intent of this interior design request.

Possible intents:
- GENERATE_LAYOUT
- APPLY_COLOR_PALETTE
- CHANGE_STYLE
- DECOR_TIPS
- UNKNOWN

Rules:
- Return ONLY valid JSON (no markdown, no extra text)
- Choose the closest intent
- If not sure, use UNKNOWN

Message:
"${text}"

Return JSON exactly:
{ "intent": "..." }
`.trim();

  try {
    const res = await fetch(HF_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          { role: "system", content: "You output strictly valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0, // ✅ reduce randomness for classification
        top_p: 1,
        max_tokens: 60,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("HF intent error:", res.status, res.statusText, errText);
      return { intent: ruleBasedIntent(text) };
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;

    const parsed = safeParseJSON(raw);
    const intent = normalizeIntent(parsed?.intent);

    return { intent: intent || ruleBasedIntent(text) };
  } catch (err) {
    console.warn("HF intent exception:", err?.message || err);
    return { intent: ruleBasedIntent(text) };
  }
}

/* ===============================
   Rule-based fallback (never fails)
   =============================== */

function ruleBasedIntent(text) {
  const t = text.toLowerCase();

  // Change style
  if (/\b(change|switch)\s+(the\s+)?style\b/.test(t) || /\bmake it\b.*\bstyle\b/.test(t)) {
    return "CHANGE_STYLE";
  }

  // Color palette
  if (/\b(color|palette|hex|beige|cream|white|gray|grey|black|navy|teal|olive|wood)\b/.test(t)) {
    // only trigger if request is about applying color, not general description
    if (/\b(apply|use|set|change)\b/.test(t) || /\bpalette\b/.test(t)) return "APPLY_COLOR_PALETTE";
  }

  // Layout generation / arrangement
  if (
    /\b(layout|arrange|arrangement|floor plan|furniture placement|where to put|position)\b/.test(t) ||
    /\b(sofa|bed|desk|table|wardrobe)\b/.test(t) && /\b(where|place|put|move)\b/.test(t)
  ) {
    return "GENERATE_LAYOUT";
  }

  // Decor tips
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

  // Try direct parse
  try {
    return JSON.parse(raw);
  } catch {}

  // Extract first JSON object
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
    "UNKNOWN",
  ]);

  return allowed.has(v) ? v : null;
}
