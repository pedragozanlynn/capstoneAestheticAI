// ProfessionalAIAssistant.jsx
// ✅ UPDATED (REQUESTED BEHAVIOR)
// ✅ Customize uses LAST AI GENERATED IMAGE automatically (or uploaded ref if provided)
// ✅ When user starts a NEW DESIGN again: previous references are CLEARED so it won't reuse last reference
// ✅ AI result images are saved to "Projects" (Firestore) for the app (per user)
// ✅ When daily limit reaches 5: shows upgrade banner AND inserts upgrade message in chat
// ✅ Furniture Matches are ONLY visible for PRO (and not stored for Free)
// ✅ Upgrade banner mentions Furniture Matches + Upgrade navigates to /User/UpdateInfo
// ✅ Pro status is CONNECTED to user profile (Firestore users/{uid}.isPro)
// ✅ NEW: "Save" OUTLINE button appears on every DESIGN (generate) result; pressing it saves that result to Projects
// ✅ No unrelated UI/style changes
//
// ✅ FIX (YOUR REQUEST):
// ✅ Ensure USER UPLOADED IMAGES (inputImage) are ALWAYS saved to Firestore + Supabase URL:
//    - We upload input image to Supabase (refs) then store that https URL in Firestore (user msg + ai response inputImage)
//    - We upload AI output to Supabase (results) then store that https URL in Firestore (ai response image)
//
// ✅ LIMIT UX (YOUR REQUEST):
// ✅ Warning BEFORE the 4th generation starts (when used 3 already)
// ✅ Add one more AI message AFTER the upgrade banner/limit message is inserted
//
// ✅ NEW FIX (YOUR REQUEST NOW):
// ✅ When opening Chat from Projects "Customize" button:
//    - Show the SAVED prompt + SAVED AI result image immediately in chat bubbles (NO API call)
//    - Set the result image as the reference so user can customize right away
//
// ✅ NEW (YOUR REQUEST NOW):
// ✅ Make Layout Suggestions PRO-ONLY:
//    - Free: explanation + decoration tips ONLY
//    - Pro: explanation + decoration tips + layout suggestions + furniture sourcing
// ✅ Do NOT change anything unrelated
//
// ✅ NEW FIX (YOUR REQUEST NOW - PREMIUM GENERATION):
// ✅ If user is NOT premium (users/{uid}.isPro !== true):
//    - DO NOT request backend to generate Layout Suggestions / Furniture Matching
//    - DO NOT show/store them even if backend returns something
// ✅ If user IS premium:
//    - Include Layout Suggestions + Furniture Matching in generation + store + UI

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ✅ Firebase auth + AI conversation service
import { getAuth } from "firebase/auth";
import {
  ensureAIConversation,
  saveAIResponse,
  saveAIUserMessage,
} from "../../services/aiConversationService";

// ✅ Supabase uploader (returns public URL)
import { uploadAIImageToSupabase } from "../../services/fileUploadService";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../../config/firebase";

// ==============================
// ✅ MODE AUTO-DETECT
// ==============================

const MODE = { DESIGN: "design", CUSTOMIZE: "customize" };

const normalizeText = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const DESIGN_TRIGGERS = [
  "design",
  "generate",
  "create",
  "make a",
  "make an",
  "new design",
  "redesign",
  "concept",
  "theme",
  "design a",
  "style a",
];

const CUSTOMIZE_TRIGGERS = [
  "customize",
  "edit",
  "modify",
  "adjust",
  "move",
  "reposition",
  "change",
  "replace",
  "swap",
  "remove",
  "add",
  "resize",
  "color",
  "palette",
  "lighting",
  "brighten",
  "cozier",
  "layout",
  "change the style",
];

// ✅ Improved mode detection:
// - If user explicitly says "customize/edit/modify" => CUSTOMIZE
// - Else if user explicitly says "new design/design/generate" => DESIGN
// - Else default to DESIGN
const detectModeFromMessage = (message = "") => {
  const m = normalizeText(message);

  // explicit customize has priority
  if (CUSTOMIZE_TRIGGERS.some((k) => m.includes(k))) return MODE.CUSTOMIZE;

  // explicit design
  if (DESIGN_TRIGGERS.some((k) => m.includes(k))) return MODE.DESIGN;

  return MODE.DESIGN;
};

// ==============================
// ✅ Title helpers
// ==============================
const makeTitle = (text = "") => {
  const t = String(text).trim().replace(/\s+/g, " ");
  if (!t) return "Aesthetic AI";
  return t.length > 32 ? t.slice(0, 32) + "…" : t;
};

export default function AIDesignerChat() {
  const router = useRouter();
  const { tab, prompt, refImage, inputImage } = useLocalSearchParams();

  // ✅ accept params from Recent Chats screen
  const params = useLocalSearchParams();
  const chatIdParam = typeof params?.chatId === "string" ? params.chatId : "new";
  const sourceParam =
    typeof params?.source === "string" ? params.source : "root"; // "root" | "user"
  const titleParam = typeof params?.title === "string" ? params.title : "";
  const sessionIdParam =
    typeof params?.sessionId === "string" ? params.sessionId : "";

  const HEADER_DARK = "#01579B";

  // ==============================
  // ✅ Pro flag (CONNECTED to users/{uid}.isPro)
  // ==============================
  const [isPro, setIsPro] = useState(false);
  const [proLoaded, setProLoaded] = useState(false);

  // ✅ keep latest isPro for async calls (avoid stale closure)
  const isProRef = useRef(false);

  const canShowFurnitureMatches = isPro === true || isProRef.current === true;
  const canShowLayoutSuggestions = isPro === true || isProRef.current === true;

  // ==============================
  // ✅ Daily limit (PER ACCOUNT)
  // ==============================
  const DAILY_LIMIT = 5;

  // ✅ WARNING BEFORE the 4th generation starts:
  // If user already used 3, show warning before making the next request.
  const WARNING_AT = 3;

  const getLimitKey = (uid) =>
    `aestheticai:daily_generations:v1:${uid || "anon"}`;

  const getLocalDateKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const [dailyGenCount, setDailyGenCount] = useState(0);
  const [dailyGenDateKey, setDailyGenDateKey] = useState(getLocalDateKey());
  const isLocked = !isPro && dailyGenCount >= DAILY_LIMIT;

  // ✅ Header title state
  const [chatTitle, setChatTitle] = useState("Aesthetic AI");
  const [hasSavedTitle, setHasSavedTitle] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "ai",
      explanation:
        "Welcome. I am your Aesthetic AI Assistant. You may design a new space or customize an existing one by uploading a reference image.",
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // ✅ references (URLs)
  const [lastReferenceImageUrl, setLastReferenceImageUrl] = useState(null); // last uploaded ref OR best ref
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState(null); // ✅ LAST AI RESULT IMAGE URL

  // ==============================
  // ✅ Project → Chat AUTO CUSTOMIZE PREFILL
  // ==============================

  // 1️⃣ Auto-fill prompt when coming from Project screen
  useEffect(() => {
    if (typeof prompt === "string" && prompt.trim()) {
      setInput(prompt);
    }
  }, [prompt]);

  // 2️⃣ Auto-set reference images for Customize mode
  useEffect(() => {
    if (tab === "customize") {
      // Priority 1: AI result image
      if (typeof refImage === "string" && refImage.startsWith("http")) {
        setLastGeneratedImageUrl(refImage);
        setLastReferenceImageUrl(refImage);
        return;
      }

      // Priority 2: Original uploaded image
      if (typeof inputImage === "string" && inputImage.startsWith("http")) {
        setLastReferenceImageUrl(inputImage);
      }
    }
  }, [tab, refImage, inputImage]);

  const sendingRef = useRef(false);
  const flatListRef = useRef(null);

  // ✅ Keep reference image size so AI output can match it
const [refImageSize, setRefImageSize] = useState(null); // { width, height }
const refImageSizeRef = useRef(null);

const getImageSizeSafe = (uri) =>
  new Promise((resolve) => {
    try {
      if (!uri) return resolve(null);

      Image.getSize(
        uri,
        (width, height) => {
          const w = Number(width) || 0;
          const h = Number(height) || 0;
          if (w > 0 && h > 0) return resolve({ width: w, height: h });
          return resolve(null);
        },
        () => resolve(null)
      );
    } catch {
      resolve(null);
    }
  });

const setRefSizeFromUri = async (uri) => {
  const size = await getImageSizeSafe(uri);
  if (size) {
    setRefImageSize(size);
    refImageSizeRef.current = size;
  }
};

   
// ✅ ADD THIS HERE
const isHistoryRealtimeActive = () => {
  return !!historyUnsubRef.current && chatIdParam && chatIdParam !== "new";
};




  // ✅ NEW: run-once boot to show saved prompt + saved images from Projects
  const projectBootRef = useRef(false);

  const DEV_HOST = "192.168.1.8";
// ✅ If physical phone, set to your PC LAN IP (e.g. 192.168.1.8)
const API_BASE = __DEV__ ? `http://${DEV_HOST}:3001` : "https://YOUR_DOMAIN";
const API_URL = `${API_BASE}/ai/design`;




  const quickPrompts = useMemo(
    () => [
      "Customize this space",
      "Improve the layout",
      "Move the furniture for better flow",
      "Change the style",
      "Make it more minimalist",
      "Make it brighter",
      "Make it cozier",
      "Design a modern living room concept",
      "Generate a cozy bedroom design",
    ],
    []
  );

  const imageQuickPrompts = useMemo(
    () => [
      "Customize this space",
      "Adjust the layout",
      "Move the furniture",
      "Change the style",
      "Improve lighting",
      "Optimize space usage",
      "Suggest decor improvements",
      "Refine the color palette",
      "Design a new concept for this room",
    ],
    []
  );

  // ==============================
  // ✅ Firestore conversation state
  // ==============================
  const auth = getAuth();
  const [userId, setUserId] = useState(null);

  // ✅ CRITICAL: conversationId stored in ref
  const conversationIdRef = useRef(null);

  // ✅ keep unsub for history listener
  const historyUnsubRef = useRef(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserId(u?.uid || null);
    });
    return unsub;
  }, [auth]);

  useEffect(() => {
    if (!userId) {
      setIsPro(false);
      isProRef.current = false;
      setProLoaded(true);
      return;
    }

    const userDocRef = doc(db, "users", userId);

    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        const d = snap.data() || {};
        const pro = d?.isPro === true;

        setIsPro(pro);
        isProRef.current = pro;

        setProLoaded(true);
      },
      (err) => {
        console.log("❌ PRO SNAP ERROR:", err?.message || err);
        setProLoaded(true);
      }
    );

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [userId]);

  

  const ensureConversationOnce = async (firstPrompt) => {
    const uid = auth?.currentUser?.uid || userId;
    if (!uid) throw new Error("No authenticated user uid");

    if (conversationIdRef.current) return conversationIdRef.current;

    const cid = `${uid}_${Date.now()}`;
    conversationIdRef.current = cid;

    await ensureAIConversation({
      conversationId: cid,
      title: makeTitle(firstPrompt),
    });

    return cid;
  };

  // ✅ never store base64/file://; only allow URLs
  const safeFirestoreImage = (v) => {
    if (!v) return null;
    const s = String(v);
    if (s.startsWith("data:image")) return null;
    if (s.startsWith("file://")) return null;
    if (!(s.startsWith("http://") || s.startsWith("https://"))) return null;
    if (s.length > 200000) return null;
    return s;
  };

  // ✅ Choose best reference for customize:
  // 1) lastGeneratedImageUrl (AI result)
  // 2) lastReferenceImageUrl (previous uploaded ref)
  const getBestReferenceForCustomize = () => {
    return lastGeneratedImageUrl || lastReferenceImageUrl || null;
  };

  // ==============================
  // ✅ FIX PRO DISPLAY: normalize backend keys for layout + furniture
  // ==============================
  const normalizeLayoutSuggestions = (data) => {
    if (!data || typeof data !== "object") return [];
    const candidates = [
      data.layoutSuggestions,
      data.layout_suggestions,
      data.layoutSuggestion,
      data.layout,
      data.suggestions,
      data.layoutIdeas,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length) {
        return c.map((x) => String(x).trim()).filter(Boolean);
      }
    }
    return [];
  };

  const normalizeFurnitureArray = (data) => {
    if (!data || typeof data !== "object") return [];
    const candidates = [
      data.furnitureMatches,
      data.furniture_matches,
      data.furnitureSourcing,
      data.furniture_sourcing,
      data.furniture,
      data.items,
      data.products,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length) return c;
    }
    return [];
  };

  // ✅ Upload user image to Supabase (refs)
  // ✅ FIX: ensure conversationId exists so upload returns URL -> Firestore inputImage won't be null
  const uploadUserImageForHistory = async (uri, promptText) => {
    const safeUri = typeof uri === "string" ? uri.trim() : "";
    if (!safeUri) return null;

    // ✅ NEW: if already a public URL, DO NOT upload again
    if (safeUri.startsWith("http://") || safeUri.startsWith("https://")) {
      return safeUri;
    }

    let cid = conversationIdRef.current;

    if (!cid) {
      try {
        cid = await ensureConversationOnce(promptText);
      } catch (e) {
        // fallback so upload still proceeds (prevents null inputImage)
        cid = `temp_${Date.now()}`;
        conversationIdRef.current = cid;
        console.log(
          "⚠️ ensureConversationOnce failed (user upload), using temp cid:",
          cid,
          e?.message || e
        );
      }
    }

    const publicUrl = await uploadAIImageToSupabase({
      file: {
        uri: safeUri,
        name: `user_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
      },
      conversationId: cid,
      kind: "refs",
      bucket: "chat-files",
    });

    if (!publicUrl) {
      console.log("❌ uploadUserImageForHistory: Supabase returned null URL", {
        cid,
        uri: safeUri,
      });
    }

    return publicUrl || null;
  };

  // ✅ Upload AI result image to Supabase (results)
  // ✅ FIX ONLY: normalize backend image shape to a string URI
  const uploadAIResultForHistory = async (imageData, promptText) => {
    if (!imageData) return null;

    let uri = null;

    if (typeof imageData === "string") {
      uri = imageData;
    } else if (imageData && typeof imageData === "object") {
      const b64 = imageData?.base64 || imageData?.Base64 || imageData?.data || null;

      if (typeof b64 === "string" && b64.trim()) {
        uri = b64.startsWith("data:image/") ? b64 : `data:image/jpeg;base64,${b64}`;
      }
    }

    if (!uri) {
      console.log("❌ uploadAIResultForHistory: invalid imageData shape:", imageData);
      return null;
    }

    const cid = conversationIdRef.current || (await ensureConversationOnce(promptText));

    const publicUrl = await uploadAIImageToSupabase({
      file: {
        uri,
        name: `ai_${Date.now()}.jpg`,
      },
      conversationId: cid,
      kind: "results",
      bucket: "chat-files",
    });

    return publicUrl || null;
  };

  const normalizeBackendImageToUri = (imageData) => {
    if (!imageData) return null;

    if (typeof imageData === "string") {
      const s = imageData.trim();
      if (!s) return null;
      if (!s.startsWith("data:image/") && !s.startsWith("http") && s.length > 100) {
        return `data:image/jpeg;base64,${s}`;
      }
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

  const saveResultToProjects = async ({ imageUrl, prompt, mode, inputImageUrl }) => {
    const uid = auth?.currentUser?.uid || userId;

    if (!uid) {
      throw new Error("Not authenticated (uid missing)");
    }

    const safeUrl = safeFirestoreImage(imageUrl);
    if (!safeUrl) {
      throw new Error("Invalid image URL");
    }

    const docData = {
      uid: String(uid),
      image: safeUrl,
      prompt: String(prompt || "").trim(),
      mode: mode || MODE.DESIGN,
      inputImage: safeFirestoreImage(inputImageUrl) || null,
      createdAt: serverTimestamp(),
      source: "ai",
    };

    Object.keys(docData).forEach((k) => docData[k] === undefined && delete docData[k]);

    console.log("📦 Saving project →", docData);

    await addDoc(collection(db, "projects"), docData);

    console.log("✅ Project saved successfully");
  };

  const handleSaveOutline = async (item) => {
    try {
      const imageUrl = safeFirestoreImage(item?.image);
      if (!imageUrl) return;

      const uid = auth?.currentUser?.uid || userId;
      if (!uid) {
        console.warn("Save blocked: user not authenticated");
        return;
      }

      if (item?.savedToProjects === true) return;

      const mode = item?.mode || MODE.DESIGN;
      const prompt = String(item?.prompt || item?.title || chatTitle || "Aesthetic AI").trim();

      const inputImageUrl = safeFirestoreImage(item?.inputImage) || null;

      await saveResultToProjects({
        imageUrl,
        prompt,
        mode,
        inputImageUrl,
      });

      setMessages((prev) => prev.map((m) => (m === item ? { ...m, savedToProjects: true } : m)));
    } catch (e) {
      console.warn("handleSaveOutline failed:", e?.message || e);
    }
  };

  // ==============================
  // ✅ Daily counter load
  // ==============================
  useEffect(() => {
    (async () => {
      try {
        const key = getLimitKey(userId);
        const today = getLocalDateKey();
        const raw = await AsyncStorage.getItem(key);

        if (!raw) {
          await AsyncStorage.setItem(key, JSON.stringify({ dateKey: today, count: 0 }));
          setDailyGenDateKey(today);
          setDailyGenCount(0);
          return;
        }

        const parsed = JSON.parse(raw);
        if (parsed?.dateKey !== today) {
          await AsyncStorage.setItem(key, JSON.stringify({ dateKey: today, count: 0 }));
          setDailyGenDateKey(today);
          setDailyGenCount(0);
          return;
        }

        setDailyGenDateKey(parsed.dateKey);
        setDailyGenCount(Number(parsed.count || 0));
      } catch (e) {
        console.warn("Daily limit load failed:", e?.message || e);
      }
    })();
  }, [userId]);

  const incrementDailyCount = async () => {
    try {
      const key = getLimitKey(userId);
      const today = getLocalDateKey();
  
      // ✅ Always base the next count on AsyncStorage (single source of truth)
      const raw = await AsyncStorage.getItem(key);
  
      let currentCount = 0;
      let currentDateKey = today;
  
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.dateKey === today) {
          currentCount = Number(parsed?.count || 0);
          currentDateKey = parsed?.dateKey;
        }
      }
  
      // ✅ If date changed, reset
      if (currentDateKey !== today) {
        currentCount = 0;
        currentDateKey = today;
      }
  
      const next = currentCount + 1;
  
      await AsyncStorage.setItem(key, JSON.stringify({ dateKey: today, count: next }));
  
      // ✅ Update state from the same computed value
      setDailyGenDateKey(today);
      setDailyGenCount(next);
  
      return next;
    } catch (e) {
      console.warn("Daily limit increment failed:", e?.message || e);
      return dailyGenCount; // fallback only
    }
  };
  

  const openLink = async (url) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
    } catch (e) {
      console.warn("Cannot open url:", url, e?.message || e);
    }
  };

  const buildSearchLink = (provider, queryText) => {
    const q = encodeURIComponent(String(queryText || "").trim().replace(/\s+/g, " "));
    if (!q) return "";
    if (provider === "shopee") return `https://shopee.ph/search?keyword=${q}`;
    if (provider === "lazada") return `https://www.lazada.com.ph/catalog/?q=${q}`;
    if (provider === "ikea") return `https://www.ikea.com/ph/en/search/?q=${q}`;
    if (provider === "marketplace")
      return `https://www.facebook.com/marketplace/search/?query=${q}`;
    return "";
  };

  const normalizeFurnitureItem = (f = {}) => {
    const name = String(f?.name || f?.title || f?.product || "").trim() || "Furniture";
    const queryText = String(f?.query || f?.keyword || name).trim();
    const links = f?.links && typeof f.links === "object" ? f.links : {};

    return {
      id: f?.id || `${name}-${Math.random().toString(16).slice(2)}`,
      name,
      placement: String(f?.placement || f?.where || "").trim(),
      query: queryText,
      links: {
        shopee: links.shopee || buildSearchLink("shopee", queryText),
        lazada: links.lazada || buildSearchLink("lazada", queryText),
        ikea: links.ikea || buildSearchLink("ikea", queryText),
        marketplace: links.marketplace || buildSearchLink("marketplace", queryText),
      },
    };
  };

  // ✅ UPDATED: include premium flag so backend can decide whether to generate layout/furniture
  const callAIDesignAPI = async ({ message, mode, image, sessionId: sid, isPro: proFlag, imageSize }) => {
    const formData = new FormData();

    const normalizedMode = mode === MODE.CUSTOMIZE ? "edit" : "generate";

    formData.append("message", String(message || ""));
    formData.append("mode", normalizedMode);

    if (sid) formData.append("sessionId", String(sid));

    // ✅ Send "redundant" premium flags (covers most backend implementations)
    const pro01 = proFlag ? "1" : "0";
    const proBool = proFlag ? "true" : "false";

    formData.append("isPro", pro01);
    formData.append("pro", pro01);
    formData.append("isPremium", proBool);
    formData.append("premium", proBool);
    formData.append("subscription_type", proFlag ? "Premium" : "Free");

    // ✅ explicit feature toggles (STRICT)
    formData.append("includeLayoutSuggestions", pro01);
    formData.append("includeFurnitureMatches", pro01);

    // ✅ NEW: request AI output to match the reference image size
const w = Number(imageSize?.width || 0);
const h = Number(imageSize?.height || 0);

if (w > 0 && h > 0) {
  // support different backend naming expectations
  formData.append("width", String(w));
  formData.append("height", String(h));
  formData.append("outputWidth", String(w));
  formData.append("outputHeight", String(h));
  formData.append("size", `${w}x${h}`);
}

// ✅ request output to match reference image size
const sizeToUse =
  imageSize && imageSize.width > 0 && imageSize.height > 0
    ? imageSize
    : refImageSizeRef.current;

if (sizeToUse?.width && sizeToUse?.height) {
  formData.append("width", String(sizeToUse.width));
  formData.append("height", String(sizeToUse.height));
  // redundant keys (covers different backend implementations)
  formData.append("outputWidth", String(sizeToUse.width));
  formData.append("outputHeight", String(sizeToUse.height));
  formData.append("size", `${sizeToUse.width}x${sizeToUse.height}`);
}


    // ✅ attach image only for edit/customize
    if (image) {
      formData.append("image", {
        uri: image,
        name: "room.jpg",
        type: "image/jpeg",
      });
    }

    console.log("📩 /ai/design OUTGOING FLAGS:", {
      normalizedMode,
      proFlag,
      isPro: pro01,
      includeLayoutSuggestions: pro01,
      includeFurnitureMatches: pro01,
      hasImage: !!image,
      sessionId: sid || "(new)",
    });

    const response = await fetch(API_URL, { method: "POST", body: formData });
    if (!response.ok) {
      const t = await response.text().catch(() => "");
      console.log("❌ AI backend error body:", t);
      throw new Error("AI backend error");
    }

    return response.json();
  };

  // ==============================
  // ✅ Load history from Recent Chats
  // ==============================
  useEffect(() => {
    if (titleParam) {
      setChatTitle(titleParam);
      setHasSavedTitle(true);
    }
    if (sessionIdParam) setSessionId(sessionIdParam);

    if (chatIdParam && chatIdParam !== "new") {
      conversationIdRef.current = chatIdParam;
    }

    return () => {
      try {
        historyUnsubRef.current?.();
      } catch {}
      historyUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (!chatIdParam || chatIdParam === "new") return;

    try {
      historyUnsubRef.current?.();
    } catch {}
    historyUnsubRef.current = null;

    const messagesCol =
      sourceParam === "user"
        ? collection(db, "users", userId, "aiConversations", chatIdParam, "messages")
        : collection(db, "aiConversations", chatIdParam, "messages");

    const mq = query(messagesCol, orderBy("createdAt", "asc"));

    historyUnsubRef.current = onSnapshot(
      mq,
      (snap) => {
        const canShowPremiumNow = isProRef.current === true; // ✅ current gating for history view

        const loaded = snap.docs.map((docSnap) => {
          const m = docSnap.data() || {};
          const role = String(m.role || "").toLowerCase() === "user" ? "user" : "ai";

          if (role === "user") {
            return {
              role: "user",
              text: String(m.text || m.message || m.content || "").trim(),
              image: m.image || null,
            };
          }

          const rawFurniture = canShowPremiumNow
            ? Array.isArray(m.furnitureMatches)
              ? m.furnitureMatches
              : Array.isArray(m.furniture)
              ? m.furniture
              : Array.isArray(m.furnitureSourcing)
              ? m.furnitureSourcing
              : Array.isArray(m.furniture_sourcing)
              ? m.furniture_sourcing
              : []
            : [];

          const furnitureMatchesAll = canShowPremiumNow
            ? rawFurniture.map(normalizeFurnitureItem)
            : [];

          const layoutSuggestionsAll = canShowPremiumNow
            ? Array.isArray(m.layoutSuggestions)
              ? m.layoutSuggestions
              : Array.isArray(m.layout_suggestions)
              ? m.layout_suggestions
              : Array.isArray(m.layout)
              ? m.layout
              : []
            : [];

          const aiItem = {
            role: "ai",
            mode: m.mode || null,
            explanation: m.explanation || "",
            tips: Array.isArray(m.tips) ? m.tips : [],
            palette: m.palette || null,
            layoutSuggestions: layoutSuggestionsAll,
            furnitureMatches: furnitureMatchesAll,
            inputImage: m.inputImage || null,
            image: m.image || null,
            prompt: m.prompt || null,
            savedToProjects: m.savedToProjects === true,
          };

          if (m.image && String(m.image).startsWith("http")) {
            setLastGeneratedImageUrl(String(m.image));
          }
          if (m.lastReferenceImage && String(m.lastReferenceImage).startsWith("http")) {
            setLastReferenceImageUrl(String(m.lastReferenceImage));
          }
          if (m.inputImage && String(m.inputImage).startsWith("http")) {
            setLastReferenceImageUrl(String(m.inputImage));
          }

          return aiItem;
        });

        if (loaded.length > 0) {
          setMessages(loaded);
          setIsTyping(false);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
        }
      },
      (err) => {
        console.warn("History load error:", err?.message || String(err));
      }
    );

    return () => {
      try {
        historyUnsubRef.current?.();
      } catch {}
      historyUnsubRef.current = null;
    };
  }, [userId, chatIdParam, sourceParam]);

  // ==============================
  // ✅ NEW: Projects "Customize" should show saved prompt + saved images immediately
  // ==============================
  useEffect(() => {
    if (projectBootRef.current) return;
    if (chatIdParam !== "new") return;
    if (tab !== "customize") return;

    const savedPrompt = typeof prompt === "string" ? prompt.trim() : "";
    const savedResult = typeof refImage === "string" ? refImage.trim() : "";
    const savedOriginal = typeof inputImage === "string" ? inputImage.trim() : "";

    if (!savedPrompt && !savedResult && !savedOriginal) return;

    projectBootRef.current = true;

    if (!hasSavedTitle && savedPrompt) {
      setChatTitle(makeTitle(savedPrompt));
      setHasSavedTitle(true);
    }

    if (savedResult && (savedResult.startsWith("http://") || savedResult.startsWith("https://"))) {
      setLastGeneratedImageUrl(savedResult);
      setLastReferenceImageUrl(savedResult);
    } else if (savedOriginal && (savedOriginal.startsWith("http://") || savedOriginal.startsWith("https://"))) {
      setLastReferenceImageUrl(savedOriginal);
    }

    setMessages((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];

      if (savedPrompt) {
        next.push({ role: "user", text: savedPrompt, image: null });
      }

      if (savedOriginal || savedResult) {
        next.push({
          role: "ai",
          mode: MODE.DESIGN,
          inputImage: safeFirestoreImage(savedOriginal),
          image: safeFirestoreImage(savedResult),
          explanation: "",
          tips: [],
          palette: null,
          layoutSuggestions: [],
          furnitureMatches: [],
          prompt: savedPrompt || null,
          savedToProjects: true,
        });
      }

      return next;
    });

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, prompt, refImage, inputImage, chatIdParam]);

  const ensureProResolvedOnce = async () => {
    // already resolved via snapshot
    if (proLoaded) return isProRef.current === true;

    // try direct getDoc as fallback
    try {
      const uid = auth?.currentUser?.uid || userId;
      if (!uid) return false;

      const snap = await getDoc(doc(db, "users", uid));
      const d = snap.data() || {};
      const pro = d?.isPro === true;

      setIsPro(pro);
      isProRef.current = pro;

      setProLoaded(true);

      console.log("✅ PRO getDoc fallback:", { uid, isPro: d?.isPro, resolved: pro });

      return pro;
    } catch (e) {
      console.log("❌ ensureProResolvedOnce failed:", e?.message || e);
      setProLoaded(true);
      return false;
    }
  };

  const mergeBackendPayload = (result) => {
    const a = result?.data && typeof result.data === "object" ? result.data : {};
    const b = result && typeof result === "object" ? result : {};
    return { ...b, ...a };
  };

  const sendMessage = async (text = input) => {
    const clean = String(text || "").trim();
    if (!clean) return;

    // ✅ FIX: block duplicate send while one request is running
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      // ✅ resolve pro best-effort
      let proNow = isProRef.current === true;
      if (!proLoaded) {
        try {
          proNow = (await ensureProResolvedOnce()) === true;
        } catch {}
      }

      if (!hasSavedTitle) {
        setChatTitle(makeTitle(clean));
        setHasSavedTitle(true);
        try {
          await ensureConversationOnce(clean);
        } catch (e) {
          console.warn("AI Conversation ensure failed:", e?.message || e);
        }
      }

      if (isLocked) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            explanation:
              "Daily limit reached (5/5). Upgrade to Pro to continue chatting with unlimited generations.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
          },
          {
            role: "ai",
            explanation:
              "You can still review your previous results in this chat. To continue generating new designs, tap the Upgrade banner below.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
          },
        ]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
        return;
      }

      let desiredMode = detectModeFromMessage(clean);

      if (tab === "customize") {
        const m = normalizeText(clean);
        const explicitDesign = DESIGN_TRIGGERS.some((k) => m.includes(k));
        const explicitCustomize = CUSTOMIZE_TRIGGERS.some((k) => m.includes(k));
        if (!explicitDesign && !explicitCustomize) desiredMode = MODE.CUSTOMIZE;
      }

      if (desiredMode === MODE.DESIGN) {
        setLastGeneratedImageUrl(null);
        setLastReferenceImageUrl(null);
      }

      let uploadedRefUrl = null;
      if (uploadedImage) {
        uploadedRefUrl = await uploadUserImageForHistory(uploadedImage, clean);
        console.log("✅ uploadedRefUrl =", uploadedRefUrl);

        if (uploadedRefUrl) {
          setLastReferenceImageUrl(uploadedRefUrl);

          setMessages((prev) => {
            for (let i = prev.length - 1; i >= 0; i--) {
              const m = prev[i];
              if (
                m?.role === "user" &&
                typeof m?.image === "string" &&
                m.image.startsWith("file://")
              ) {
                const next = [...prev];
                next[i] = { ...m, image: uploadedRefUrl };
                return next;
              }
            }
            return prev;
          });
        }
      }

      const effectiveImage =
        desiredMode === MODE.CUSTOMIZE ? uploadedRefUrl || getBestReferenceForCustomize() : null;

      if (desiredMode === MODE.CUSTOMIZE && !effectiveImage) {
        setMessages((prev) => [
          ...prev,
          { role: "user", text: clean },
          {
            role: "ai",
            explanation:
              "Customization needs a reference. Please generate a design first (so we can reuse the last AI image), or upload/capture a photo.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
          },
        ]);
        setInput("");
        setIsTyping(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
        return;
      }

      try {
        const cid = conversationIdRef.current || (await ensureConversationOnce(clean));
        await saveAIUserMessage(cid, {
          text: clean,
          image: safeFirestoreImage(uploadedRefUrl),
        });
      } catch (e) {
        console.warn("saveAIUserMessage failed:", e?.message || e);
      }

      setMessages((prev) => [...prev, { role: "user", text: clean, image: uploadedRefUrl || null }]);
      setInput("");
      setIsTyping(true);

      // ✅ Warning BEFORE 4th generation starts (when already used 3)
      if (!proNow && dailyGenCount === WARNING_AT) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            explanation: "Notice: You have 2 generations left today.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
          },
        ]);
      }

      try {
        const result = await callAIDesignAPI({
          message: clean,
          mode: desiredMode,
          image: effectiveImage,
          sessionId,
          isPro: proNow, // ✅ STRICT: backend gets pro flag; toggles are 0 when free
          imageSize: refImageSizeRef.current,

        });

        console.log("✅ BACKEND RAW result.data =", result?.data);
        console.log(
          "✅ BACKEND layout raw =",
          result?.data?.layoutSuggestions,
          result?.data?.layout_suggestions
        );
        console.log(
          "✅ BACKEND furniture raw =",
          result?.data?.furnitureMatches,
          result?.data?.furniture_matches
        );

        if (result?.sessionId) setSessionId(result.sessionId);

        // ✅ Atomic counter update (prevents early lock like 2/day)
        let updatedCount = dailyGenCount;
        if (!proNow) {
          updatedCount = await incrementDailyCount();
        }

        setUploadedImage(null);
        setIsTyping(false);

        const explanation =
          result?.data?.explanation || "Design report is currently unavailable. Please try again.";

        const tips =
          Array.isArray(result?.data?.tips) && result.data.tips.length > 0 ? result.data.tips : [];

        const palette = result?.data?.palette || null;

        const mergedPayload = mergeBackendPayload(result);

        // ✅ Extract from backend, but ENFORCE premium rules strictly:
        const backendLayoutSuggestions = proNow ? normalizeLayoutSuggestions(mergedPayload) : [];
        const rawFurniture = proNow ? normalizeFurnitureArray(mergedPayload) : [];
        const furnitureMatchesAll = proNow ? rawFurniture.map(normalizeFurnitureItem) : [];

        const resultImageUri = normalizeBackendImageToUri(result?.image);

        const aiImagePublicUrl = resultImageUri ? await uploadAIResultForHistory(resultImageUri, clean) : null;

        const uiResultImage = aiImagePublicUrl || resultImageUri || null;

        if (uiResultImage) {
          setLastGeneratedImageUrl(uiResultImage);

          if (aiImagePublicUrl) {
            setLastReferenceImageUrl((prev) => prev || aiImagePublicUrl);
          }
        }

        const firestoreInputImageUrl =
          desiredMode === MODE.CUSTOMIZE
            ? safeFirestoreImage(effectiveImage)
            : safeFirestoreImage(uploadedRefUrl);

        try {
          const cid = conversationIdRef.current || (await ensureConversationOnce(clean));
          await saveAIResponse(cid, {
            mode: desiredMode,
            explanation,
            tips,
            palette,
            // ✅ STRICT: store nothing premium when free
            layoutSuggestions: proNow ? backendLayoutSuggestions : [],
            furnitureMatches: proNow ? furnitureMatchesAll : [],
            inputImage: firestoreInputImageUrl,
            image: safeFirestoreImage(aiImagePublicUrl),
            sessionId: result?.sessionId || sessionId || null,
            lastReferenceImage:
              safeFirestoreImage(
                desiredMode === MODE.CUSTOMIZE
                  ? effectiveImage
                  : uploadedRefUrl || lastReferenceImageUrl
              ) || null,
            prompt: clean,
          });
        } catch (e) {
          console.warn("saveAIResponse failed:", e?.message || e);
        }

          if (!isHistoryRealtimeActive()) {
            setMessages((prev) => [
              ...prev,
              {
                role: "ai",
                mode: desiredMode,
                inputImage: firestoreInputImageUrl,
                image: uiResultImage,
                explanation,
                tips,
                palette,
                layoutSuggestions: proNow ? backendLayoutSuggestions : [],
                furnitureMatches: proNow ? furnitureMatchesAll : [],
                prompt: clean,
                savedToProjects: false,
              },
            ]);
          }
          
        
        const nextCount = !proNow ? updatedCount : dailyGenCount;

        if (!proNow && nextCount >= DAILY_LIMIT) {
          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              explanation:
                "Daily limit reached (5/5). Upgrade to Pro to continue chatting with unlimited generations.",
              tips: [],
              layoutSuggestions: [],
              furnitureMatches: [],
            },
            {
              role: "ai",
              explanation:
                "You can still review your previous results in this chat. To continue generating new designs, tap the Upgrade banner below.",
              tips: [],
              layoutSuggestions: [],
              furnitureMatches: [],
            },
          ]);
        }

        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
      } catch (err) {
        console.error("AI UI ERROR:", err);
        setIsTyping(false);

        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            explanation: "Unable to process your request at the moment. Please try again.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
          },
        ]);
      }
    } finally {
      // ✅ ALWAYS release lock even on early returns/errors
      sendingRef.current = false;
    }
  };

  const pickImage = async () => {
    if (isLocked) return;
  
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
  
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
  
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setUploadedImage(uri);
  
      // ✅ NEW: capture exact size of uploaded image
      await setRefSizeFromUri(uri);
  
      setMessages((prev) => [...prev, { role: "user", text: "Reference image attached.", image: uri }]);
  
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };
  
  const takePhoto = async () => {
    if (isLocked) return;
  
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
  
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setUploadedImage(uri);
  
      // ✅ NEW: capture exact size of captured photo
      await setRefSizeFromUri(uri);
  
      setMessages((prev) => [...prev, { role: "user", text: "Photo captured and attached.", image: uri }]);
  
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };
  

  const clearAttachment = () => setUploadedImage(null);

  const renderMessage = ({ item }) => {
    const isAi = item.role === "ai";
    const paletteColors = Array.isArray(item?.palette?.colors) ? item.palette.colors : [];
    const layoutSuggestions = Array.isArray(item?.layoutSuggestions) ? item.layoutSuggestions : [];
    const furnitureMatches = Array.isArray(item?.furnitureMatches) ? item.furnitureMatches : [];

    const showSaveOutline =
      isAi && item?.mode === MODE.DESIGN && !!safeFirestoreImage(item?.image);

    return (
      <View style={[styles.messageRow, isAi ? styles.aiRow : styles.userRow]}>
        {isAi && (
          <View style={[styles.miniAvatar, styles.aiMiniAvatar]}>
            <MaterialCommunityIcons name="robot" size={12} color="#FFF" />
          </View>
        )}

        <View style={[styles.bubble, isAi ? styles.aiBubble : styles.userBubble]}>
          {!isAi && item.image && <Image source={{ uri: item.image }} style={styles.userPreviewImage} />}

          {isAi && (item.inputImage || item.image) && (
            <View style={styles.imageCompareWrap}>
              {item.inputImage && (
                <View style={styles.imageBlock}>
                  <Text style={styles.imageLabel}>Original</Text>
                  <Image source={{ uri: item.inputImage }} style={styles.previewImage} />
                </View>
              )}

              {item.image && (
                <View style={styles.imageBlock}>
                  <Text style={styles.imageLabel}>Result</Text>
                  <Image source={{ uri: item.image }} style={styles.previewImage} />
                </View>
              )}
            </View>
          )}

          {isAi && item.mode && (
            <View style={{ marginBottom: 8, alignSelf: "flex-start" }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#64748B" }}>
                Mode: {item.mode === MODE.CUSTOMIZE ? "Customize" : "Design"}
              </Text>
            </View>
          )}

          {isAi && paletteColors.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Color Palette</Text>
                {!!item?.palette?.name && <Text style={styles.sectionMeta}>{item.palette.name}</Text>}
              </View>

              <View style={styles.paletteRow}>
                {paletteColors.slice(0, 6).map((c, i) => (
                  <View key={i} style={styles.paletteCard}>
                    <View style={[styles.swatch, { backgroundColor: c.hex || "#CBD5E1" }]} />
                    <Text style={styles.swatchLabel} numberOfLines={1}>
                      {c.name || "Color"}
                    </Text>
                    <Text style={styles.swatchHex}>{(c.hex || "").toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

         
          {isAi && item.explanation && (
            <View style={styles.section}>
              <Text style={styles.paragraph}>{item.explanation}</Text>
            </View>
          )}

          {isAi && Array.isArray(item.tips) && item.tips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Decoration Tips</Text>
              {item.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>•</Text>
                  <Text style={styles.bulletText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}

          {showSaveOutline && (
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.saveOutlineBtn, item?.savedToProjects === true && { opacity: 0.65 }]}
                onPress={() => handleSaveOutline(item)}
                disabled={item?.savedToProjects === true}
              >
                <Feather name="bookmark" size={14} color="#0F172A" />
                <Text style={styles.saveOutlineText}>
                  {item?.savedToProjects === true ? "Saved to Projects" : "Save to Projects"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

           {/* ✅ PRO ONLY: Layout Suggestions */}
           {isAi && canShowLayoutSuggestions && layoutSuggestions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Layout Suggestions</Text>
              {layoutSuggestions.map((s, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>•</Text>
                  <Text style={styles.bulletText}>{s}</Text>
                </View>
              ))}
            </View>
          )}


          {/* ✅ PRO ONLY: Furniture Matches */}
          {isAi && canShowFurnitureMatches && furnitureMatches.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Furniture Matches</Text>

              {furnitureMatches.map((f, idx) => (
                <View key={f?.id || f?.name || String(idx)} style={styles.furnitureCard}>
                  <Text style={styles.furnitureName}>{f?.name || "Furniture"}</Text>

                  {!!f?.placement && <Text style={styles.furniturePlacement}>{f.placement}</Text>}

                  <View style={styles.furnitureLinksRow}>
                    {!!f?.links?.shopee && (
                      <TouchableOpacity onPress={() => openLink(f.links.shopee)} style={styles.furniturePill}>
                        <Text style={styles.furniturePillText}>Shopee</Text>
                      </TouchableOpacity>
                    )}

                    {!!f?.links?.lazada && (
                      <TouchableOpacity onPress={() => openLink(f.links.lazada)} style={styles.furniturePill}>
                        <Text style={styles.furniturePillText}>Lazada</Text>
                      </TouchableOpacity>
                    )}

                    {!!f?.links?.ikea && (
                      <TouchableOpacity onPress={() => openLink(f.links.ikea)} style={styles.furniturePill}>
                        <Text style={styles.furniturePillText}>IKEA</Text>
                      </TouchableOpacity>
                    )}

                    {!!f?.links?.marketplace && (
                      <TouchableOpacity onPress={() => openLink(f.links.marketplace)} style={styles.furniturePill}>
                        <Text style={styles.furniturePillText}>Marketplace</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {!isAi && <Text style={styles.userText}>{item.text}</Text>}
        </View>

        {!isAi && (
          <View style={[styles.miniAvatar, styles.userMiniAvatar]}>
            <Feather name="user" size={12} color="#475569" />
          </View>
        )}
      </View>
    );
  };

  const chipsToShow = uploadedImage ? imageQuickPrompts : quickPrompts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_DARK} />
      {Platform.OS === "android" && <View style={{ height: StatusBar.currentHeight }} />}

      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <LinearGradient colors={["#0F172A", "#334155"]} style={styles.headerLogoBox}>
            <MaterialCommunityIcons name="robot" size={20} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {chatTitle}
            </Text>

            <View style={styles.headerSubRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Online</Text>

              {!!sessionId && (
                <Text style={styles.sessionText} numberOfLines={1}>
                  • Session {sessionId.slice(0, 8)}…
                </Text>
              )}
            </View>
          </View>

          <View style={styles.headerRight}>
            <MaterialCommunityIcons name="shield-check" size={18} color="#38BDF8" />
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={styles.scrollArea}
          />

          {isTyping && (
            <View style={styles.typingWrap}>
              <View style={styles.typingDot} />
              <Text style={styles.typingText}>Aesthetic AI is analyzing…</Text>
            </View>
          )}

          <View style={styles.footer}>
            {isLocked && (
              <View style={styles.upgradeBanner}>
                <Text style={styles.upgradeTitle}>Daily limit reached (5/5)</Text>
                <Text style={styles.upgradeDesc}>
                  Upgrade to Pro to unlock unlimited generations and enable Furniture Matches.
                </Text>
                <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push("/User/UpdateInfo")}>
                  <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
                </TouchableOpacity>
              </View>
            )}

            {uploadedImage && (
              <View style={styles.attachmentBar}>
                <View style={styles.attachmentLeft}>
                  <Feather name="image" size={16} color="#334155" />
                  <Text style={styles.attachmentText}>Reference attached</Text>
                </View>

                <TouchableOpacity onPress={clearAttachment} style={styles.attachmentRemove}>
                  <Feather name="x" size={16} color="#334155" />
                </TouchableOpacity>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {chipsToShow.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.promptPill, isLocked && { opacity: 0.45 }]}
                  onPress={() => sendMessage(p)}
                  disabled={isLocked}
                >
                  <Text style={styles.promptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <TouchableOpacity
                onPress={takePhoto}
                style={[styles.iconBtnLight, isLocked && { opacity: 0.45 }]}
                disabled={isLocked}
              >
                <Feather name="camera" size={20} color="#334155" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={pickImage}
                style={[styles.iconBtnLight, isLocked && { opacity: 0.45 }]}
                disabled={isLocked}
              >
                <Feather name="image" size={20} color="#334155" />
              </TouchableOpacity>

              <View style={styles.inputBox}>
                <TextInput
                  style={styles.textInput}
                  placeholder={isLocked ? "Upgrade to Pro to continue..." : "Message Aesthetic AI..."}
                  placeholderTextColor="#94A3B8"
                  value={input}
                  onChangeText={setInput}
                  multiline
                  editable={!isLocked}
                />
              </View>

              <TouchableOpacity onPress={() => sendMessage()} disabled={isLocked || !input.trim()}>
                <LinearGradient
                  colors={!isLocked && input.trim() ? ["#0F172A", "#334155"] : ["#CBD5E1", "#E2E8F0"]}
                  style={styles.sendBtn}
                >
                  <Feather name="arrow-up" size={18} color="#FFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#01579B" },
  container: { flex: 1, backgroundColor: "#F1F5F9" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 0,
    paddingBottom: 10,
    marginTop: -10,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#01579B",
  },
  backButton: { marginRight: 8, padding: 6 },
  headerLogoBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  headerSubRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 20,
    backgroundColor: "#10B981",
    marginRight: 6,
  },
  statusText: { fontSize: 12, color: "rgba(255,255,255,0.82)", fontWeight: "600" },
  sessionText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    marginLeft: 6,
    maxWidth: 200,
  },
  headerRight: { paddingLeft: 8 },

  scrollArea: { padding: 16, paddingBottom: 10 },

  messageRow: { flexDirection: "row", marginBottom: 18, maxWidth: "92%" },
  aiRow: { alignSelf: "flex-start" },
  userRow: { alignSelf: "flex-end" },

  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  aiMiniAvatar: { backgroundColor: "#0F172A" },
  userMiniAvatar: { backgroundColor: "#E2E8F0" },

  bubble: {
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  aiBubble: {
    backgroundColor: "#FFFFFF",
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  userBubble: { backgroundColor: "#0F172A", marginRight: 8 },

  previewImage: { width: "100%", height: 180, borderRadius: 14, marginBottom: 12 },
  userPreviewImage: {
    width: 220,
    height: 160,
    borderRadius: 14,
    marginBottom: 10,
    alignSelf: "flex-end",
  },

  imageCompareWrap: { marginBottom: 12 },
  imageBlock: { marginBottom: 10 },
  imageLabel: { fontSize: 12, fontWeight: "800", color: "#0F172A", marginBottom: 6 },

  section: { marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  sectionMeta: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  paragraph: { fontSize: 14, lineHeight: 20, color: "#334155" },

  tipRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  tipBullet: { color: "#334155", marginRight: 8, lineHeight: 20, fontSize: 16 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#334155" },

  paletteRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  paletteCard: {
    width: 98,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  swatch: {
    width: "100%",
    height: 22,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  swatchLabel: { fontSize: 12, fontWeight: "700", color: "#334155" },
  swatchHex: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  saveOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignSelf: "flex-start",
  },
  saveOutlineText: { fontSize: 12, fontWeight: "900", color: "#0F172A" },

  furnitureCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  furnitureName: { fontSize: 13, fontWeight: "900", color: "#0F172A" },
  furniturePlacement: { fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 18 },
  furnitureLinksRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  furniturePill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  furniturePillText: { fontSize: 12, fontWeight: "800", color: "#0369A1" },

  userText: { color: "#FFFFFF", fontSize: 15, lineHeight: 20 },

  typingWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 10,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 10,
    backgroundColor: "#38BDF8",
    marginRight: 8,
  },
  typingText: { textAlign: "center", fontSize: 12, color: "#64748B", fontWeight: "600" },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },

  upgradeBanner: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    marginBottom: 10,
  },
  upgradeTitle: { fontSize: 13, fontWeight: "900", color: "#9A3412" },
  upgradeDesc: { marginTop: 6, fontSize: 12, color: "#7C2D12", lineHeight: 18 },
  upgradeBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FB923C",
    alignItems: "center",
  },
  upgradeBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },

  attachmentBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  attachmentLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  attachmentText: { fontSize: 12, fontWeight: "800", color: "#334155" },
  attachmentRemove: { padding: 6, borderRadius: 10, backgroundColor: "#E2E8F0" },

  chipsRow: { paddingVertical: 6 },

  promptPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },
  promptText: { fontSize: 12, fontWeight: "700", color: "#334155" },

  inputRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6, gap: 8 },

  iconBtnLight: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  inputBox: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 44,
    maxHeight: 120,
  },
  textInput: { fontSize: 15, color: "#0F172A", padding: 0, margin: 0 },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
