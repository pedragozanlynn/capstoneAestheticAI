import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../config/supabase";

// ------------------------------
// Helpers
// ------------------------------
const safeStr = (v) => (v == null ? "" : String(v)).trim();

const uriToBlob = async (uri) => {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.onerror = () => reject(new TypeError("Network request failed (xhr)"));
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 0) {
            reject(new TypeError("Network request failed (status 0)"));
          } else {
            resolve(xhr.response);
          }
        }
      };
      xhr.open("GET", uri, true);
      xhr.responseType = "blob";
      xhr.send(null);
    } catch (e) {
      reject(e);
    }
  });
};

const guessContentType = (fileName = "", mimeType = "", fallback = "application/octet-stream") => {
  if (mimeType) return mimeType;
  const ext = safeStr(fileName).split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return fallback;
};

// ------------------------------
// Picker
// ------------------------------
export const pickFile = async () => {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });

    if (res.canceled) return null;

    const file = res.assets[0];

    return {
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType || "application/octet-stream",
    };
  } catch (error) {
    console.log("❌ File picker error:", error);
    return null;
  }
};

// ------------------------------
// Generic upload
// ------------------------------
export const uploadToSupabase = async (file) => {
  try {
    if (!file?.uri) throw new Error("uploadToSupabase: file.uri required");

    const fileName = file.name || `camera_${Date.now()}.jpg`;
    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `uploads/${Date.now()}.${fileExt}`;

    const contentType = guessContentType(fileName, file.mimeType || file.type, "image/jpeg");

    // ✅ FIX: Use XHR blob (do not fetch(file.uri))
    const blob = await uriToBlob(file.uri);

    const { error } = await supabase.storage.from("chat-files").upload(filePath, blob, {
      contentType,
      upsert: false,
    });

    // free memory (optional)
    try {
      blob?.close?.();
    } catch {}

    if (error) {
      console.log("❌ Supabase upload error:", error);
      return null;
    }

    const { data: publicURL } = supabase.storage.from("chat-files").getPublicUrl(filePath);

    return {
      fileUrl: publicURL.publicUrl,
      fileName,
      fileType: contentType,
    };
  } catch (err) {
    console.log("❌ uploadToSupabase error:", err);
    return null;
  }
};

// ------------------------------
// AI Conversation Upload
// ------------------------------
export const uploadAIImageToSupabase = async ({
  file, // { uri, name?, mimeType?, type? }
  conversationId,
  kind = "refs", // "refs" | "results"
  bucket = "chat-files",
}) => {
  try {
    if (!file?.uri) return null;
    if (!conversationId) throw new Error("conversationId required");

    const fileName = file.name || `${kind}_${Date.now()}.jpg`;
    const fileExt = fileName.split(".").pop() || "jpg";

    const filePath = `aiConversations/${conversationId}/${kind}/${Date.now()}.${fileExt}`;

    const contentType = guessContentType(fileName, file.mimeType || file.type, "image/jpeg");

    // ✅ FIX: Use XHR blob
    const blob = await uriToBlob(file.uri);

    const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
      contentType,
      upsert: false,
    });

    try {
      blob?.close?.();
    } catch {}

    if (error) {
      console.log("❌ uploadAIImageToSupabase error:", error);
      return null;
    }

    const { data: publicURL } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return publicURL?.publicUrl || null;
  } catch (err) {
    console.log("❌ uploadAIImageToSupabase error:", err);
    return null;
  }
};

// ------------------------------
// Portfolio upload
// ------------------------------
export const uploadPortfolio = async (file) => {
  try {
    if (!file?.uri) throw new Error("uploadPortfolio: file.uri required");

    const fileName = file.name || `portfolio_${Date.now()}.jpg`;
    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `portfolio/${Date.now()}.${fileExt}`;

    const contentType = guessContentType(fileName, file.mimeType || file.type, "image/jpeg");

    // ✅ FIX: Use XHR blob
    const blob = await uriToBlob(file.uri);

    const { error } = await supabase.storage.from("portfolio-file").upload(filePath, blob, {
      contentType,
      upsert: false,
    });

    try {
      blob?.close?.();
    } catch {}

    if (error) {
      console.log("❌ Portfolio upload error:", error);
      return null;
    }

    const { data: publicURL } = supabase.storage.from("portfolio-file").getPublicUrl(filePath);

    return {
      fileUrl: publicURL.publicUrl,
      fileName,
      fileType: contentType,
    };
  } catch (err) {
    console.log("❌ uploadPortfolio error:", err);
    return null;
  }
};
