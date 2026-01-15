import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;
const HF_TEXT_MODEL =
  "https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2";

/**
 * Returns a color palette object
 * Shape:
 * {
 *   name: string,
 *   colors: [{ name, hex }]
 * }
 */
export async function getColorPalette(styleInput, userMessage = "") {
  const text = userMessage.toLowerCase();

  /* ===============================
     1️⃣ EXPLICIT COLOR RULES (HIGHEST PRIORITY)
     =============================== */
  const COLOR_KEYWORDS = {
    white: "#FFFFFF",
    offwhite: "#F8FAFC",
    beige: "#E7D7C1",
    cream: "#F5F5DC",
    gray: "#CBD5E1",
    grey: "#CBD5E1",
    charcoal: "#334155",
    black: "#0F172A",
    brown: "#7C5C3B",
    wood: "#C19A6B",
    green: "#4ADE80",
    olive: "#6B8E23",
    blue: "#60A5FA",
    navy: "#1E3A8A",
    teal: "#3FA796",
  };

  const detected = Object.keys(COLOR_KEYWORDS).filter(c =>
    text.includes(c)
  );

  if (detected.length > 0) {
    return {
      name: "User Defined Palette",
      colors: detected.slice(0, 4).map(c => ({
        name: c,
        hex: COLOR_KEYWORDS[c],
      })),
    };
  }

  /* ===============================
     2️⃣ MOOD-BASED RULES
     =============================== */
  if (text.includes("warm")) {
    return {
      name: "Warm Neutral",
      colors: [
        { name: "Warm Beige", hex: "#E7D7C1" },
        { name: "Soft Cream", hex: "#F5F5DC" },
        { name: "Natural Wood", hex: "#C19A6B" },
      ],
    };
  }

  if (text.includes("dark")) {
    return {
      name: "Dark Contrast",
      colors: [
        { name: "Charcoal", hex: "#334155" },
        { name: "Deep Gray", hex: "#1F2937" },
        { name: "Muted Black", hex: "#0F172A" },
      ],
    };
  }

  if (text.includes("light")) {
    return {
      name: "Light & Airy",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Light Gray", hex: "#E5E7EB" },
        { name: "Pale Beige", hex: "#EFE6D8" },
      ],
    };
  }

  /* ===============================
     3️⃣ HF PALETTE REFINEMENT (OPTIONAL)
     =============================== */
  if (HF_API_KEY) {
    try {
      const styleName =
        typeof styleInput === "string"
          ? styleInput
          : styleInput?.name || "modern";

      const prompt = `
You are an interior designer.

Suggest a realistic interior color palette.

Context:
Style: ${styleName}
User request: "${userMessage}"

Rules:
- Suggest ONLY realistic interior colors
- No neon, no fantasy colors
- Max 4 colors
- Use common interior color names

Respond ONLY in JSON:
{
  "name": "...",
  "colors": [
    { "name": "...", "hex": "#XXXXXX" }
  ]
}
`;

      const response = await fetch(HF_TEXT_MODEL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            temperature: 0.2,
            max_new_tokens: 150,
            return_full_text: false,
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const parsed = JSON.parse(result[0].generated_text);

        if (parsed?.colors?.length) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("HF palette fallback triggered");
    }
  }

  /* ===============================
     4️⃣ STYLE-BASED FALLBACK (SAFE)
     =============================== */
  const styleName =
    typeof styleInput === "string"
      ? styleInput.toLowerCase()
      : styleInput?.name?.toLowerCase() || "modern";

  const palettes = {
    modern: {
      name: "Modern Neutral",
      colors: [
        { name: "Soft White", hex: "#F8FAFC" },
        { name: "Cool Gray", hex: "#CBD5E1" },
        { name: "Charcoal", hex: "#334155" },
        { name: "Muted Teal", hex: "#3FA796" },
      ],
    },
    minimalist: {
      name: "Minimalist Calm",
      colors: [
        { name: "Pure White", hex: "#FFFFFF" },
        { name: "Light Gray", hex: "#E5E7EB" },
        { name: "Warm Beige", hex: "#E7D7C1" },
      ],
    },
    industrial: {
      name: "Industrial Urban",
      colors: [
        { name: "Concrete Gray", hex: "#9CA3AF" },
        { name: "Steel Dark", hex: "#374151" },
        { name: "Rust Accent", hex: "#B45309" },
      ],
    },
  };

  return palettes[styleName] || palettes.modern;
}
