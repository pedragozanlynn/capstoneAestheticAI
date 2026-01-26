const HF_API = "https://api-inference.huggingface.co/models";

const SDXL = "stabilityai/stable-diffusion-xl-base-1.0";
const CONTROLNET_CANNY = "lllyasviel/controlnet-canny";

export const callHFImageToImage = async ({
  hfToken,
  prompt,
  imageBase64,
}) => {
  if (!hfToken) throw new Error("Missing HF token");
  if (!imageBase64) throw new Error("Missing reference image");

  const res = await fetch(`${HF_API}/${SDXL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        image: imageBase64,
        strength: 0.35, // 🔑 controls how much it changes
        guidance_scale: 7.5,
      },
      options: {
        wait_for_model: true,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.log("HF ERROR:", t);
    throw new Error("HF image-to-image failed");
  }

  const blob = await res.blob();

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // base64
    reader.readAsDataURL(blob);
  });
};
