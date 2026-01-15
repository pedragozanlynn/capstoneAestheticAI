import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../config/supabase";

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

export const uploadToSupabase = async (file) => {
  try {
    // FIX: Fallback kung walang file.name (gaya ng sa Camera)
    const fileName = file.name || `camera_${Date.now()}.jpg`;
    const fileExt = fileName.split(".").pop();
    const filePath = `uploads/${Date.now()}.${fileExt}`;

    // Read the file as arraybuffer
    const response = await fetch(file.uri);
    const arrayBuffer = await response.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from("chat-files")
      .upload(filePath, fileBytes, {
        // FIX: Fallback para sa mimeType (type ang gamit ng image-picker)
        contentType: file.mimeType || file.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      console.log("❌ Supabase upload error:", error);
      return null;
    }

    const { data: publicURL } = supabase.storage
      .from("chat-files")
      .getPublicUrl(filePath);

    return {
      fileUrl: publicURL.publicUrl,
      fileName: fileName,
      fileType: file.mimeType || file.type || "image/jpeg",
    };
  } catch (err) {
    console.log("❌ uploadToSupabase error:", err);
    return null;
  }
};

/////////////////////////////////////////////////////////////////////////////////////
// ✅ Portfolio Upload (Updated with same fix)
/////////////////////////////////////////////////////////////////////////////////////

export const uploadPortfolio = async (file) => {
  try {
    const fileName = file.name || `portfolio_${Date.now()}.jpg`;
    const fileExt = fileName.split(".").pop();
    const filePath = `portfolio/${Date.now()}.${fileExt}`;

    const response = await fetch(file.uri);
    const arrayBuffer = await response.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from("portfolio-file")
      .upload(filePath, fileBytes, {
        contentType: file.mimeType || file.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      console.log("❌ Portfolio upload error:", error);
      return null;
    }

    const { data: publicURL } = supabase.storage
      .from("portfolio-file")
      .getPublicUrl(filePath);

    return {
      fileUrl: publicURL.publicUrl,
      fileName: fileName,
      fileType: file.mimeType || file.type || "image/jpeg",
    };
  } catch (err) {
    console.log("❌ uploadPortfolio error:", err);
    return null;
  }
};