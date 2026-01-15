import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;
const HF_IMAGE_MODEL =
  "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";

/* ===============================
   🔁 RETRY WRAPPER
   =============================== */
async function fetchWithRetry(url, options, retries = 2) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= 0) throw err;

    console.warn("⚠️ HF image fetch failed, retrying...");
    await new Promise(r => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1);
  }
}

/**
 * Generate interior image using SDXL (HF Router)
 */
export async function generateInteriorImage({
  prompt,
  initImage = null,
  strength,
}) {
  if (!HF_API_KEY) {
    throw new Error("HF_API_KEY is missing");
  }

  /* ===============================
     🔒 STRENGTH SAFETY
     =============================== */
  const isEdit = !!initImage;

  const finalStrength = isEdit
    ? Math.min(Math.max(strength ?? 0.18, 0.12), 0.25)
    : Math.min(Math.max(strength ?? 0.85, 0.75), 0.95);

  /* ===============================
     🖼 IMAGE CLEANUP
     =============================== */
  const cleanImage =
    isEdit && initImage
      ? initImage.replace(/^data:image\/\w+;base64,/, "")
      : null;

  /* ===============================
     📦 REQUEST BODY
     =============================== */
  const body = isEdit
    ? {
        inputs: {
          prompt,
          image: cleanImage,
        },
        parameters: {
          strength: finalStrength,
          guidance_scale: 7.5,
        },
      }
    : {
        inputs: prompt,
        parameters: {
          guidance_scale: 7.5,
        },
      };

  /* ===============================
     ⏱ TIMEOUT PROTECTION
     =============================== */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70_000); // 70s (SDXL needs this)

  let response;

  try {
    response = await fetchWithRetry(
      HF_IMAGE_MODEL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      2
    );
  } catch (err) {
    console.error("❌ HF IMAGE NETWORK ERROR:", err.message);
    throw new Error("Image generation network failure");
  } finally {
    clearTimeout(timeout);
  }

  /* ===============================
     ❌ HF ERROR RESPONSE
     =============================== */
  if (!response.ok) {
    const errText = await response.text();
    console.error("❌ HF IMAGE ERROR:", {
      status: response.status,
      message: errText,
      strength: finalStrength,
      isEdit,
    });
    throw new Error("Image generation failed");
  }

  /* ===============================
     ✅ SUCCESS
     =============================== */
  const buffer = await response.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
}
