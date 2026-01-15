// design-engine/decorTips.js
import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ CHANGE MODEL (IMPORTANT)
const HF_TEXT_MODEL =
  "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

export async function getDecorTips({
  style,
  roomType,
  palette,
  userMessage,
  imagePrompt, // REQUIRED
}) {
  if (!HF_API_KEY) return fallback(roomType, style);

  const prompt = `
You are a professional interior designer writing a DESIGN REPORT.

THIS DESIGN WAS GENERATED FROM THE FOLLOWING CONTEXT:
"""
${imagePrompt}
"""

USER REQUEST:
"${userMessage}"

ROOM TYPE:
${roomType}

STYLE DIRECTION:
${style.name}

COLOR PALETTE:
${palette.colors.map(c => c.name).join(", ")}

CRITICAL RULES:
- Treat this as a BRAND NEW design
- Do NOT reuse wording from previous responses
- Avoid generic phrases such as:
  "balanced layout"
  "cohesive materials"
  "visually inviting atmosphere"
- Use different sentence structure every time
- Be specific to THIS space

TASK:
1. Write a 2–3 sentence explanation describing what THIS design looks and feels like
2. Mention layout, lighting, materials, and mood
3. Provide EXACTLY 3 decoration tips that improve THIS specific design

FORMAT (STRICT):
EXPLANATION:
<your explanation>

TIPS:
- tip one
- tip two
- tip three
`;

  try {
    const res = await fetch(HF_TEXT_MODEL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          temperature: 0.95,          // 🔥 creativity
          top_p: 0.9,
          repetition_penalty: 1.15,   // 🔥 stops phrase reuse
          max_new_tokens: 260,
          return_full_text: false,
        },
      }),
    });

    if (!res.ok) throw new Error("HF request failed");

    const data = await res.json();
    const text = data?.[0]?.generated_text;
    if (!text) throw new Error("Empty model response");

    // 🔎 DEBUG (keep while testing)
    console.log("🧠 RAW DECOR OUTPUT:\n", text);

    // -------- PARSE --------
    const expMatch = text.match(/EXPLANATION:\s*([\s\S]*?)TIPS:/i);
    const tipsMatch = text.match(/TIPS:\s*([\s\S]*)/i);

    if (!expMatch || !tipsMatch) throw new Error("Bad response format");

    const explanation = expMatch[1].trim();
    const tips = tipsMatch[1]
      .split("\n")
      .map(l => l.replace(/^[-•\d.]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!explanation || tips.length !== 3) {
      throw new Error("Incomplete explanation or tips");
    }

    return { explanation, tips };
  } catch (err) {
    console.error("⚠️ DecorTips fallback:", err.message);
    return fallback(roomType, style);
  }
}

/* ===============================
   🔒 NEUTRAL FALLBACK (SAFE)
   =============================== */
function fallback(roomType, style) {
  return {
    explanation: `This ${roomType} follows a ${style.name.toLowerCase()} design direction with practical spatial organization and functional material choices.`,
    tips: [
      "Review lighting placement based on how the room is used",
      "Introduce subtle material contrast to avoid visual flatness",
      "Reassess furniture spacing for movement and comfort",
    ],
  };
}
