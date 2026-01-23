// services/fileUploadService.js

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/supabase";

// ------------------------------
// Helpers
// ------------------------------
const safeStr = (v) => (v == null ? "" : String(v).trim());

const isDataImageUri = (uri = "") => safeStr(uri).startsWith("data:image/");
const isHttpUri = (uri = "") => {
  const s = safeStr(uri);
  return s.startsWith("http://") || s.startsWith("https://");
};

// Android camera/gallery may return content://
const isLocalUri = (uri = "") => {
  const u = safeStr(uri);
  return u.startsWith("file://") || u.startsWith("content://");
};

const base64FromDataUri = (dataUri = "") => {
  const s = safeStr(dataUri);
  const idx = s.indexOf("base64,");
  if (idx === -1) return "";
  return s.slice(idx + "base64,".length);
};

const mimeFromDataUri = (dataUri = "") => {
  const s = safeStr(dataUri);
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return m?.[1] || "";
};

const extFromMime = (mime = "") => {
  const m = safeStr(mime).toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
};

const guessContentType = (
  fileName = "",
  mimeType = "",
  fallback = "application/octet-stream"
) => {
  if (mimeType) return mimeType;
  const ext = safeStr(fileName).split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return fallback;
};

const randomSuffix = () => Math.random().toString(16).slice(2);

// ✅ Base64 decode that works even if atob is missing (Expo-safe)
const decodeBase64ToBytes = (b64) => {
  const clean = safeStr(b64).replace(/\s/g, "");
  if (!clean) return null;

  // atob path
  if (globalThis.atob) {
    const binary = globalThis.atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Buffer path (optional)
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(clean, "base64");
    return new Uint8Array(buf);
  }

  return null;
};

const dataUriToBytes = (dataUri) => {
  const b64 = base64FromDataUri(dataUri);
  return decodeBase64ToBytes(b64);
};

// ------------------------------
// ✅ Supabase creds + urls
// ------------------------------
const getSupabaseCreds = () => ({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY });

const buildPublicUrl = (bucket, path) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
};

// ------------------------------
// ✅ Read local/remote into bytes (used by "bytes upload")
// ------------------------------
const uriToBytes = async (uri) => {
  const u = safeStr(uri);
  if (!u) return null;

  // data:image/...;base64,...
  if (isDataImageUri(u)) return dataUriToBytes(u);

  // http/https
  if (isHttpUri(u)) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Failed to fetch remote file: ${r.status}`);
    const ab = await r.arrayBuffer();
    return new Uint8Array(ab);
  }

  // local file:// or content://
  const base64Encoding = FileSystem?.EncodingType?.Base64 || "base64";

  try {
    const b64 = await FileSystem.readAsStringAsync(u, { encoding: base64Encoding });
    return decodeBase64ToBytes(b64);
  } catch (e1) {
    // Some Android content:// URIs fail direct read. Try copy -> cache -> read.
    try {
      const tmp = `${FileSystem.cacheDirectory}upload_${Date.now()}_${randomSuffix()}.bin`;

      try {
        const info = await FileSystem.getInfoAsync(tmp);
        if (info?.exists) await FileSystem.deleteAsync(tmp, { idempotent: true });
      } catch {}

      await FileSystem.copyAsync({ from: u, to: tmp });

      const b64 = await FileSystem.readAsStringAsync(tmp, { encoding: base64Encoding });

      try {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
      } catch {}

      return decodeBase64ToBytes(b64);
    } catch (e2) {
      throw new Error(
        `Failed to read local file bytes: ${e1?.message || e1} | fallback: ${e2?.message || e2}`
      );
    }
  }
};

// ------------------------------
// ✅ Upload via REST (bytes)
// ------------------------------
const uploadToStorageRestBytes = async ({ bucket, path, bytes, contentType }) => {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) throw new Error("Missing Supabase URL/key (check config/supabase)");

  // Important: encode path but keep slashes
  const endpoint = `${url}/storage/v1/object/${bucket}/${encodeURIComponent(path).replace(
    /%2F/g,
    "/"
  )}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: bytes, // Uint8Array OK
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase REST bytes upload failed (${res.status}): ${txt || "no body"}`);
  }

  return true;
};

// ------------------------------
// ✅ Upload local file using uploadAsync (best for file:// / content://)
// ------------------------------
const uploadLocalFileToStorage = async ({ bucket, path, localUri, contentType }) => {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) throw new Error("Missing Supabase URL/key (check config/supabase)");

  const endpoint = `${url}/storage/v1/object/${bucket}/${path}`;

  const fileUri = await ensureFileUri(localUri);

  const res = await FileSystem.uploadAsync(endpoint, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Supabase uploadAsync failed (${res.status}): ${res.body || "no body"}`);
  }

  return true;
};


// ------------------------------
// ✅ REST upload wrapper used by generic uploadToSupabase (bytes path)
// ------------------------------
const uploadToStorageRest = async ({ bucket, path, bytes, contentType }) => {
  return uploadToStorageRestBytes({ bucket, path, bytes, contentType });
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
    const file = res.assets?.[0];
    if (!file?.uri) return null;

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
// Generic upload (User OR AI data URI)
// ------------------------------
export const uploadToSupabase = async (file) => {
  try {
    const uri = safeStr(file?.uri);
    if (!uri) throw new Error("uploadToSupabase: file.uri required");

    const bucket = "chat-files";

    let fileName = file?.name || `camera_${Date.now()}.jpg`;
    let contentType =
      file?.mimeType || file?.type || guessContentType(fileName, "", "image/jpeg");

    // If data URI, derive mime/ext
    if (isDataImageUri(uri)) {
      const dataMime = mimeFromDataUri(uri) || contentType || "image/jpeg";
      contentType = dataMime;
      const ext = extFromMime(dataMime);
      if (!fileName.toLowerCase().endsWith(`.${ext}`)) fileName = `ai_${Date.now()}.${ext}`;
    }

    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `uploads/${Date.now()}_${randomSuffix()}.${fileExt}`;

    // bytes read
    const bytes = await uriToBytes(uri);
    if (!bytes) throw new Error("Failed to read file bytes");

    await uploadToStorageRest({ bucket, path: filePath, bytes, contentType });

    const publicUrl = buildPublicUrl(bucket, filePath);

    return {
      fileUrl: publicUrl,
      fileName,
      fileType: contentType,
    };
  } catch (err) {
    console.log("❌ uploadToSupabase error:", err?.message || err);
    return null;
  }
};

// ------------------------------
// AI Conversation Upload (refs/results)
// ------------------------------
export const uploadAIImageToSupabase = async ({
  file, // { uri, name?, mimeType?, type? } OR string uri
  conversationId,
  kind = "refs", // "refs" | "results"
  bucket = "chat-files",
}) => {
  try {
    const inputFile = file;

    // Normalize safely
    let uri =
      typeof inputFile === "string"
        ? safeStr(inputFile)
        : safeStr(
            inputFile?.uri ||
              inputFile?.Base64 ||
              inputFile?.base64 ||
              inputFile?.data ||
              ""
          );

    if (!uri) {
      console.log("❌ uploadAIImageToSupabase: missing file uri:", inputFile);
      return null;
    }
    if (!conversationId) throw new Error("conversationId required");

    let fileName =
      typeof inputFile === "object" && inputFile?.name
        ? String(inputFile.name)
        : `${kind}_${Date.now()}.jpg`;

    let contentType =
      (typeof inputFile === "object" && (inputFile?.mimeType || inputFile?.type)) ||
      guessContentType(fileName, "", "image/jpeg");

    // raw base64 -> wrap to data uri
    const looksLikeRawBase64 =
      uri &&
      !isDataImageUri(uri) &&
      !isHttpUri(uri) &&
      !isLocalUri(uri) &&
      uri.length > 100;

    const effectiveUri = looksLikeRawBase64 ? `data:image/jpeg;base64,${uri}` : uri;

    // If data URI, derive ext/mime
    if (isDataImageUri(effectiveUri)) {
      const dataMime = mimeFromDataUri(effectiveUri) || contentType || "image/jpeg";
      contentType = dataMime;
      const ext = extFromMime(dataMime);
      fileName = `${kind}_${Date.now()}.${ext}`;
    }

    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `aiConversations/${conversationId}/${kind}/${Date.now()}_${randomSuffix()}.${fileExt}`;

    // ✅ Upload strategy:
    // - Local file/content => uploadAsync
    // - data:image or http/https => bytes upload
    if (isLocalUri(effectiveUri)) {
      await uploadLocalFileToStorage({
        bucket,
        path: filePath,
        localUri: effectiveUri,
        contentType,
      });
    } else {
      const bytes = await uriToBytes(effectiveUri);
      if (!bytes) throw new Error("Failed to read bytes for upload");
      await uploadToStorageRestBytes({ bucket, path: filePath, bytes, contentType });
    }

    const publicUrl = buildPublicUrl(bucket, filePath);
    return publicUrl || null;
  } catch (err) {
    console.log("❌ uploadAIImageToSupabase error:", err?.message || err);
    return null;
  }
};

const ensureFileUri = async (uri) => {
  const u = safeStr(uri);
  if (u.startsWith("file://")) return u;

  if (u.startsWith("content://")) {
    const tmp = `${FileSystem.cacheDirectory}upload_${Date.now()}_${randomSuffix()}`;
    await FileSystem.copyAsync({ from: u, to: tmp });
    return tmp; // file:// in cache
  }

  return u;
};

// ------------------------------
// ✅ Valid ID (Front) upload
// ------------------------------
export const uploadValidIdFront = async (file) => {
  try {
    const uri = safeStr(file?.uri);
    if (!uri) throw new Error("uploadValidIdFront: file.uri required");

    // ✅ use your existing bucket
    const bucket = "portfolio-file";

    let fileName = file?.name || `valid_id_front_${Date.now()}.jpg`;
    let contentType =
      file?.mimeType || file?.type || guessContentType(fileName, "", "image/jpeg");

    if (isDataImageUri(uri)) {
      const dataMime = mimeFromDataUri(uri) || contentType || "image/jpeg";
      contentType = dataMime;
      const ext = extFromMime(dataMime);
      fileName = `valid_id_front_${Date.now()}.${ext}`;
    }

    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `consultant/valid-id/front/${Date.now()}_${randomSuffix()}.${fileExt}`;

    if (isLocalUri(uri)) {
      await uploadLocalFileToStorage({
        bucket,
        path: filePath,
        localUri: uri,
        contentType,
      });
    } else {
      const bytes = await uriToBytes(uri);
      if (!bytes) throw new Error("Failed to read file bytes");
      await uploadToStorageRestBytes({ bucket, path: filePath, bytes, contentType });
    }

    const publicUrl = buildPublicUrl(bucket, filePath);
    return { fileUrl: publicUrl, fileName, fileType: contentType };
  } catch (err) {
    console.log("❌ uploadValidIdFront error:", err?.message || err);
    return null;
  }
};


// ------------------------------
// ✅ Valid ID (Back) upload
// ------------------------------
export const uploadValidIdBack = async (file) => {
  try {
    const uri = safeStr(file?.uri);
    if (!uri) throw new Error("uploadValidIdBack: file.uri required");

    // ✅ use your existing bucket
    const bucket = "portfolio-file";

    let fileName = file?.name || `valid_id_back_${Date.now()}.jpg`;
    let contentType =
      file?.mimeType || file?.type || guessContentType(fileName, "", "image/jpeg");

    if (isDataImageUri(uri)) {
      const dataMime = mimeFromDataUri(uri) || contentType || "image/jpeg";
      contentType = dataMime;
      const ext = extFromMime(dataMime);
      fileName = `valid_id_back_${Date.now()}.${ext}`;
    }

    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `consultant/valid-id/back/${Date.now()}_${randomSuffix()}.${fileExt}`;

    if (isLocalUri(uri)) {
      await uploadLocalFileToStorage({
        bucket,
        path: filePath,
        localUri: uri,
        contentType,
      });
    } else {
      const bytes = await uriToBytes(uri);
      if (!bytes) throw new Error("Failed to read file bytes");
      await uploadToStorageRestBytes({ bucket, path: filePath, bytes, contentType });
    }

    const publicUrl = buildPublicUrl(bucket, filePath);
    return { fileUrl: publicUrl, fileName, fileType: contentType };
  } catch (err) {
    console.log("❌ uploadValidIdBack error:", err?.message || err);
    return null;
  }
};

// ------------------------------
// ✅ Selfie upload
// ------------------------------
export const uploadSelfie = async (file) => {
  try {
    const uri = safeStr(file?.uri);
    if (!uri) throw new Error("uploadSelfie: file.uri required");

    // ✅ use your existing bucket
    const bucket = "portfolio-file";

    let fileName = file?.name || `selfie_${Date.now()}.jpg`;
    let contentType =
      file?.mimeType || file?.type || guessContentType(fileName, "", "image/jpeg");

    if (isDataImageUri(uri)) {
      const dataMime = mimeFromDataUri(uri) || contentType || "image/jpeg";
      contentType = dataMime;
      const ext = extFromMime(dataMime);
      fileName = `selfie_${Date.now()}.${ext}`;
    }

    const fileExt = fileName.split(".").pop() || "jpg";
    const filePath = `consultant/selfie/${Date.now()}_${randomSuffix()}.${fileExt}`;

    if (isLocalUri(uri)) {
      await uploadLocalFileToStorage({
        bucket,
        path: filePath,
        localUri: uri,
        contentType,
      });
    } else {
      const bytes = await uriToBytes(uri);
      if (!bytes) throw new Error("Failed to read file bytes");
      await uploadToStorageRestBytes({ bucket, path: filePath, bytes, contentType });
    }

    const publicUrl = buildPublicUrl(bucket, filePath);
    return { fileUrl: publicUrl, fileName, fileType: contentType };
  } catch (err) {
    console.log("❌ uploadSelfie error:", err?.message || err);
    return null;
  }
};

