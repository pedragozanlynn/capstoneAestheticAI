import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ HF Router Chat Completions endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

/**
 * ✅ Use a fallback chain of chat-compatible models.
 * NOTE: Do NOT hardcode mistralai/Mistral-7B-Instruct-v0.3 here, since router may reject it as "not a chat model".
 */
const HF_CHAT_MODELS = [
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
];

/**
 * Parse user intent for interior design requests.
 * Always returns: { intent: "..." }
 */
export async function parseIntent(message = "") {
  const rawText = (message || "").trim();

  // ✅ Guaranteed fallback if empty
  if (!rawText) return { intent: "UNKNOWN" };

  // ✅ 1) QUICK PROMPT OVERRIDE (fast + stable)
  const quickIntent = quickPromptIntent(rawText);
  if (quickIntent) return { intent: quickIntent };

  // ✅ 2) Remove "wrapper" content from expandQuickPrompt() before classifying
  const cleanText = stripQuickPromptWrapper(rawText);

  // ✅ 3) If no key, rule-based only
  if (!HF_API_KEY) return { intent: ruleBasedIntent(cleanText) };

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

    return { intent: intent || ruleBasedIntent(cleanText) };
  } catch (err) {
    console.warn("HF intent exception:", err?.message || err);
    return { intent: ruleBasedIntent(cleanText) };
  }
}

/* ===============================
   ✅ QUICK PROMPT SUPPORT
   - Detects your expandQuickPrompt() wrappers
   - Ensures quick chips always map to correct intent
   =============================== */

function quickPromptIntent(text = "") {
  const t = String(text).toUpperCase();

  // From your UI expander:
  // "QUICK LAYOUT REQUEST: ..."
  // "LAYOUT EDIT: ..."
  // "STYLE REQUEST: ..."
  // "STYLE/EDIT REQUEST: ..."

  if (t.includes("QUICK LAYOUT REQUEST:") || t.includes("LAYOUT EDIT:")) {
    return "GENERATE_LAYOUT";
  }

  if (t.includes("STYLE REQUEST:") || t.includes("STYLE/EDIT REQUEST:")) {
    return "CHANGE_STYLE";
  }

  // Optional: if you later add "PALETTE REQUEST:"
  if (t.includes("PALETTE REQUEST:") || t.includes("COLOR PALETTE")) {
    // only if it's clearly asking to apply/change palette
    return "APPLY_COLOR_PALETTE";
  }

  // Optional: if you later add "DECOR REQUEST:"
  if (t.includes("DECOR REQUEST:") || t.includes("DECORATION TIPS")) {
    return "DECOR_TIPS";
  }

  return null;
}

/**
 * Removes your wrapper phrases so the LLM/rules see the core user message.
 * (This increases accuracy and reduces false UNKNOWN)
 */
function stripQuickPromptWrapper(text = "") {
  let s = String(text || "").trim();

  // Remove prefix labels if present
  s = s.replace(/^QUICK LAYOUT REQUEST:\s*/i, "");
  s = s.replace(/^LAYOUT EDIT:\s*/i, "");
  s = s.replace(/^STYLE REQUEST:\s*/i, "");
  s = s.replace(/^STYLE\/EDIT REQUEST:\s*/i, "");

  // Remove common "Provide:" boilerplate (optional, but helps)
  s = s.replace(/Provide:\s*\(1\)[\s\S]*$/i, (m) => {
    // keep only the user action part BEFORE "Provide:"
    const idx = s.toLowerCase().indexOf("provide:");
    return idx >= 0 ? s.slice(0, idx).trim() : s;
  });

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

        // ✅ If router says "not a chat model", try next model
        if (res.status === 400 && body.includes("not a chat model")) {
          console.warn(`HF model not chat-compatible: ${model}`);
          lastErr = new Error(`${model} not chat-compatible`);
          continue;
        }

        // ✅ If model/provider is unavailable or rate-limited, try next
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

  // Change style
  if (/\b(change|switch)\s+(the\s+)?style\b/.test(t) || /\bmake it\b.*\b(style|modern|minimalist|cozy|industrial|scandinavian)\b/.test(t)) {
    return "CHANGE_STYLE";
  }

  // Color palette
  if (/\b(color|palette|hex|beige|cream|white|gray|grey|black|navy|teal|olive|wood)\b/.test(t)) {
    if (/\b(apply|use|set|change|update)\b/.test(t) || /\bpalette\b/.test(t)) return "APPLY_COLOR_PALETTE";
  }

  // Layout generation / arrangement
  if (
    /\b(layout|arrange|arrangement|floor plan|furniture placement|where to put|position|zone|circulation|walking path)\b/.test(t) ||
    (/\b(sofa|bed|desk|table|wardrobe|cabinet|tv)\b/.test(t) && /\b(where|place|put|move|rearrange)\b/.test(t))
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
    "UNKNOWN",
  ]);

  return allowed.has(v) ? v : null;
}
