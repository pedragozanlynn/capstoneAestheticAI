import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL =
  "https://api-inference.huggingface.co/models/google/flan-t5-large";

/**
 * Parse user intent ONLY (logic)
 */
export async function parseIntent(message) {
  const prompt = `
Classify the intent of this interior design request.

Possible intents:
- GENERATE_LAYOUT
- APPLY_COLOR_PALETTE
- CHANGE_STYLE
- DECOR_TIPS
- UNKNOWN

Message:
"${message}"

Respond ONLY in JSON:
{ "intent": "..." }
`;

  const response = await fetch(HF_MODEL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  const result = await response.json();

  try {
    return JSON.parse(result[0].generated_text);
  } catch {
    return { intent: "UNKNOWN" };
  }
}
