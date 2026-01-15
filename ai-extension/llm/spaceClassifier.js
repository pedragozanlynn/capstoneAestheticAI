import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;
const HF_TEXT_MODEL =
  "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

/**
 * SPACE CLASSIFIER (HYBRID)
 * ✅ Rule-based first (fast & reliable)
 * ✅ LLM fallback for ambiguous cases
 * ✅ Normalized output for image consistency
 */
export async function classifySpace(userMessage = "") {
  const text = userMessage.toLowerCase();

  /* ===============================
     1️⃣ RULE-BASED (PRIMARY)
     =============================== */

  // ☕ Hospitality
  if (text.includes("coffee") || text.includes("cafe")) {
    return {
      spaceType: "commercial",
      roomType: "coffee shop",
      confidence: 0.95,
      source: "rules",
    };
  }

  if (text.includes("restaurant") || text.includes("dining")) {
    return {
      spaceType: "commercial",
      roomType: "restaurant",
      confidence: 0.95,
      source: "rules",
    };
  }

  // 🛍 Retail
  if (
    text.includes("retail") ||
    text.includes("boutique") ||
    text.includes("clothing store")
  ) {
    return {
      spaceType: "commercial",
      roomType: "retail store",
      confidence: 0.9,
      source: "rules",
    };
  }

  // 🏢 Office
  if (text.includes("office") || text.includes("workspace") || text.includes("coworking")) {
    return {
      spaceType: "commercial",
      roomType: "office",
      confidence: 0.9,
      source: "rules",
    };
  }

  // 🏠 Residential
  if (text.includes("bedroom")) {
    return {
      spaceType: "residential",
      roomType: "bedroom",
      confidence: 0.95,
      source: "rules",
    };
  }

  if (text.includes("living room")) {
    return {
      spaceType: "residential",
      roomType: "living room",
      confidence: 0.95,
      source: "rules",
    };
  }

  if (text.includes("kitchen")) {
    return {
      spaceType: "residential",
      roomType: "kitchen",
      confidence: 0.95,
      source: "rules",
    };
  }

  /* ===============================
     2️⃣ LLM FALLBACK (SECONDARY)
     =============================== */

  const prompt = `
You are an expert interior architect.

Classify the space type.

Choose ONLY one:

bedroom
living_room
kitchen
bathroom
office
coffee_shop
restaurant
retail_store
studio
commercial_generic
unknown

User request:
"${userMessage}"

Respond ONLY in JSON:
{
  "roomType": "...",
  "spaceType": "residential or commercial"
}
`;

  try {
    const response = await fetch(HF_TEXT_MODEL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          temperature: 0,
          max_new_tokens: 60,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) throw new Error("HF failed");

    const result = await response.json();
    const parsed = JSON.parse(result[0].generated_text);

    return {
      spaceType: parsed.spaceType || "commercial",
      roomType: parsed.roomType || "generic",
      confidence: 0.6,
      source: "llm",
    };
  } catch (err) {
    console.warn("⚠️ Space classifier fallback triggered");

    return {
      spaceType: "residential",
      roomType: "generic",
      confidence: 0.3,
      source: "fallback",
    };
  }
}
