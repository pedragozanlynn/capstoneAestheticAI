import fetch from "node-fetch";
import crypto from "crypto";

const HF_API_KEY = process.env.HF_API_KEY;
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

/**
 * getDecorTips
 * ✅ Different explanation/tips per prompt (stable variation)
 * ✅ Strict format + validation
 * ✅ 1 retry with stricter constraints
 * ✅ Fallback is also varied (not identical every time)
 */
export async function getDecorTips({
  style,
  roomType,
  palette,
  userMessage,
  imagePrompt,
  emphasis = null, // optional if you pass it from promptBuilder
}) {
  const safeStyle = style?.name || "Modern";
  const safeRoom = roomType || "room";
  const safeUser = (userMessage || "").trim();
  const paletteNames = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.name).filter(Boolean)
    : [];

  // ✅ Signature drives deterministic variation per prompt
  const signature = stableSignature(
    `${safeRoom}|${safeStyle}|${paletteNames.join(",")}|${safeUser}|${imagePrompt || ""}`
  );

  // Derive an emphasis if not provided (based on signature)
  const emphases = [
    "light flow",
    "material contrast",
    "spatial openness",
    "furniture proportion",
    "mood and atmosphere",
    "storage efficiency",
    "circulation/walkway clarity",
    "accent layering",
    "window treatment + glare control",
    "texture layering",
  ];
  const finalEmphasis = emphasis || emphases[signature.mod % emphases.length];

  // Rotate tip categories so tips are not always the same
  const tipBuckets = [
    "lighting",
    "layout",
    "materials",
    "color_accents",
    "storage",
    "window",
    "decor_layers",
    "rug_art",
    "plants",
    "hardware_finishes",
  ];
  const bucketA = tipBuckets[(signature.mod + 0) % tipBuckets.length];
  const bucketB = tipBuckets[(signature.mod + 3) % tipBuckets.length];
  const bucketC = tipBuckets[(signature.mod + 6) % tipBuckets.length];

  // Reject common generic phrases (your complaint)
  const bannedPhrases = [
    "balanced layout",
    "cohesive materials",
    "visually inviting atmosphere",
    "cozy atmosphere",
    "clean lines and neutral tones",
    "timeless look",
    "adds warmth and character",
  ];

  // ✅ Prompt includes signature + bucket constraints (forces variation)
  const prompt = buildPrompt({
    imagePrompt,
    safeUser,
    safeRoom,
    safeStyle,
    paletteNames,
    finalEmphasis,
    signature: signature.hex,
    buckets: [bucketA, bucketB, bucketC],
    bannedPhrases,
  });

  // If no HF key, return deterministic varied fallback
  if (!HF_API_KEY) return variedFallback({ safeRoom, safeStyle, signature, paletteNames, finalEmphasis });

  // Try once, then retry with stricter constraints if needed
  const first = await callHF(prompt, 0.85);
  const parsed1 = parseAndValidate(first, bannedPhrases);

  if (parsed1.ok) return parsed1.data;

  const retryPrompt = prompt + `

STRICT RETRY RULES:
- Avoid ALL generic interior design wording
- Each tip must start with a different verb
- Each tip must mention a concrete object (e.g., lamp, curtain, rug, shelf, mirror, chair, table)
- Output must be exactly 2–3 sentences in EXPLANATION and exactly 3 bullet tips
`;

  const second = await callHF(retryPrompt, 0.65);
  const parsed2 = parseAndValidate(second, bannedPhrases);

  if (parsed2.ok) return parsed2.data;

  // Final fallback (still varied)
  return variedFallback({ safeRoom, safeStyle, signature, paletteNames, finalEmphasis });
}

/* ===============================
   HF Call
   =============================== */
async function callHF(prompt, temperature = 0.85) {
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
          { role: "system", content: "You output strictly the requested format. No extra text." },
          { role: "user", content: prompt },
        ],
        temperature,
        top_p: 0.9,
        max_tokens: 320,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("HF ERROR STATUS:", res.status, res.statusText);
      console.error("HF ERROR BODY:", errText);
      return "";
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("HF CALL ERROR:", e?.message || e);
    return "";
  }
}

/* ===============================
   Prompt Builder
   =============================== */
function buildPrompt({
  imagePrompt,
  safeUser,
  safeRoom,
  safeStyle,
  paletteNames,
  finalEmphasis,
  signature,
  buckets,
  bannedPhrases,
}) {
  return `
You are a professional interior designer writing a DESIGN REPORT.

THIS DESIGN WAS GENERATED FROM THE FOLLOWING CONTEXT:
"""
${imagePrompt || "(no image context provided)"}
"""

USER REQUEST:
"${safeUser}"

ROOM TYPE:
${safeRoom}

STYLE DIRECTION:
${safeStyle}

COLOR PALETTE:
${paletteNames.length ? paletteNames.join(", ") : "neutral tones"}

DECOR EMPHASIS (must shape wording + tips):
${finalEmphasis}

PROMPT SIGNATURE (do not repeat, only use to diversify):
${signature}

TIP REQUIREMENTS:
- Provide exactly 3 tips
- Tip #1 must focus on: ${buckets[0]}
- Tip #2 must focus on: ${buckets[1]}
- Tip #3 must focus on: ${buckets[2]}
- Tips must be actionable and reference concrete items and placement
- Do not repeat the same verb across tips

BANNED PHRASES (do not use these exact phrases):
${bannedPhrases.map((p) => `- ${p}`).join("\n")}

FORMAT (STRICT):
EXPLANATION:
<2–3 sentences. Mention layout, lighting, materials, and mood. Must be specific to THIS space.>

TIPS:
- tip one
- tip two
- tip three
`.trim();
}

/* ===============================
   Parsing + Validation
   =============================== */
function parseAndValidate(text, bannedPhrases) {
  if (!text || typeof text !== "string") return { ok: false };

  const expMatch = text.match(/EXPLANATION:\s*([\s\S]*?)\bTIPS:\b/i);
  const tipsMatch = text.match(/\bTIPS:\s*([\s\S]*)/i);

  if (!expMatch || !tipsMatch) return { ok: false };

  const explanation = expMatch[1].trim();
  const tipsRaw = tipsMatch[1]
    .split("\n")
    .map((l) => l.replace(/^[-•\d.]+\s*/, "").trim())
    .filter(Boolean);

  const tips = tipsRaw.slice(0, 3);

  if (!explanation || tips.length !== 3) return { ok: false };

  // Must be 2–3 sentences
  const sentenceCount = explanation.split(/[.!?]+/).map(s => s.trim()).filter(Boolean).length;
  if (sentenceCount < 2 || sentenceCount > 3) return { ok: false };

  // Ban generic phrases
  const lower = (explanation + "\n" + tips.join("\n")).toLowerCase();
  for (const p of bannedPhrases) {
    if (lower.includes(p.toLowerCase())) return { ok: false };
  }

  // Ensure tips are not duplicates and not too short
  const normTips = tips.map((t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim());
  if (new Set(normTips).size !== 3) return { ok: false };
  if (tips.some((t) => t.length < 18)) return { ok: false };

  // Different starting verbs (rough check)
  const starts = tips.map((t) => (t.split(" ")[0] || "").toLowerCase());
  if (new Set(starts).size < 3) return { ok: false };

  return { ok: true, data: { explanation, tips } };
}

/* ===============================
   Deterministic Signature
   =============================== */
function stableSignature(input) {
  const hash = crypto.createHash("sha256").update(String(input)).digest("hex");
  // mod for bucket rotation
  const mod = parseInt(hash.slice(0, 8), 16) >>> 0;
  return { hex: hash, mod };
}

/* ===============================
   Varied Fallback (NOT identical each time)
   =============================== */
function variedFallback({ safeRoom, safeStyle, signature, paletteNames, finalEmphasis }) {
  const verbs = ["Shift", "Add", "Swap", "Layer", "Move", "Anchor", "Frame", "Raise", "Group", "Trim"];
  const v1 = verbs[(signature.mod + 1) % verbs.length];
  const v2 = verbs[(signature.mod + 4) % verbs.length];
  const v3 = verbs[(signature.mod + 7) % verbs.length];

  const paletteHint = paletteNames.length ? paletteNames.slice(0, 3).join(", ") : "neutral tones";

  return {
    explanation:
      `This ${safeRoom} follows a ${safeStyle.toLowerCase()} direction with decisions centered on ${finalEmphasis}. ` +
      `The palette leans on ${paletteHint}, with lighting and material choices framed to match the user’s request.`,
    tips: [
      `${v1} the main light source (floor lamp or ceiling fixture) closer to the primary activity zone to improve task brightness without glare.`,
      `${v2} one tactile material (linen curtain, woven rug, or matte wood accent) near the focal wall to prevent the space from feeling flat.`,
      `${v3} furniture spacing so the walkway stays clear; leave a consistent passage line between key pieces for smoother movement.`,
    ],
  };
}
