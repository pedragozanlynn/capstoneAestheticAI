// services/chatImageService.js
import { uploadAIImageToSupabase } from "../fileUploadService";

// ------------------------------
// small helpers
// ------------------------------
export const isHttpUrl = (u) => {
  const s = typeof u === "string" ? u.trim() : "";
  return s.startsWith("http://") || s.startsWith("https://");
};

export const normalizeImageDataToUri = (imageData) => {
  if (!imageData) return null;

  if (typeof imageData === "string") {
    const s = imageData.trim();
    if (!s) return null;
    return s;
  }

  if (typeof imageData === "object") {
    const b64 = imageData?.base64 || imageData?.Base64 || imageData?.data || null;
    if (typeof b64 === "string" && b64.trim()) {
      return b64.startsWith("data:image/") ? b64 : `data:image/jpeg;base64,${b64}`;
    }
  }

  return null;
};

// ------------------------------
// uploads
// ------------------------------
export const uploadUserImageForHistory = async ({
  uri,
  promptText,
  conversationId,
  kind = "refs",
  bucket = "chat-files",
}) => {
  const safeUri = typeof uri === "string" ? uri.trim() : "";
  if (!safeUri) return null;

  // already public url
  if (isHttpUrl(safeUri)) return safeUri;

  if (!conversationId) {
    throw new Error("uploadUserImageForHistory: conversationId is required for local file upload");
  }

  const publicUrl = await uploadAIImageToSupabase({
    file: {
      uri: safeUri,
      name: `user_${Date.now()}.jpg`,
      mimeType: "image/jpeg",
    },
    conversationId,
    kind, // "refs"
    bucket,
  });

  return publicUrl || null;
};

export const uploadAIResultForHistory = async ({
  imageData,
  promptText,
  conversationId,
  kind = "results",
  bucket = "chat-files",
}) => {
  const uri = normalizeImageDataToUri(imageData);
  if (!uri) return null;

  // already public url
  if (isHttpUrl(uri)) return uri;

  if (!conversationId) {
    throw new Error("uploadAIResultForHistory: conversationId is required for base64 upload");
  }

  const publicUrl = await uploadAIImageToSupabase({
    file: { uri, name: `ai_${Date.now()}.jpg` },
    conversationId,
    kind, // "results"
    bucket,
  });

  return publicUrl || null;
};
