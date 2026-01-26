// AIDesignChat.jsx
// ✅ FIXED: Customize must ALWAYS edit the SAME room reference (no “ibang room”)
// ✅ UPDATE (YOUR REQUEST):
// ✅ After CUSTOMIZE, user can ALWAYS go back to DESIGN anytime (even right after customization)
//    - If user explicitly asks to DESIGN / NEW DESIGN, it will switch to DESIGN and clear refs
//    - If user does NOT explicitly ask DESIGN, and there is a reference, it will stay CUSTOMIZE (same room)
// Key fixes kept + adjusted:
// 1) Force CUSTOMIZE if any reference exists (ONLY when user did NOT explicitly request DESIGN)
// 2) Reference priority for customize: ORIGINAL (lastReferenceImageUrl) first, then lastGeneratedImageUrl
// 3) If customize edit fails, DO NOT fallback to generators; show error instead
// 4) Projects boot sets original ref first when available

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
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

import { getAuth } from "firebase/auth";
import {
  ensureAIConversation,
  saveAIResponse,
  saveAIUserMessage,
} from "../../services/aiConversationService";

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

import {
  callAIDesignAPI,
  mergeBackendPayload,
  normalizeBackendImageToUri,
} from "../../services/openaiAIDesignService";

import {
  CUSTOMIZE_TRIGGERS,
  DESIGN_TRIGGERS,
  MODE,
  applyPremiumGatingToPayload,
  detectModeFromMessage,
  normalizeFurnitureItem,
  normalizeText,
  safeFirestoreImage,
} from "../../services/premiumGateService";

import {
  getLocalDateKey,
  incrementDailyCount,
  loadDailyCounter,
} from "../../services/dailyLimitService";

import { normalizePrompt as normalizePromptSvc } from "../../services/promptFilterService";

// ==============================
// ✅ Title helpers
// ==============================
const makeTitle = (text = "") => {
  const t = String(text).trim().replace(/\s+/g, " ");
  if (!t) return "Aesthetic AI";
  return t.length > 32 ? t.slice(0, 32) + "…" : t;
};

// ==============================
// ✅ Prompt Filtration Dictionary
// ==============================
const PROMPT_FILTERS = {
  base: ["design", "make", "create", "generate", "customize", "improve", "change", "move"],
  rooms: ["living room", "bedroom", "kitchen", "dining room", "bathroom", "studio", "office", "small room"],
  actions: ["move furniture", "change layout", "improve lighting", "optimize space", "rearrange furniture", "add decor", "remove clutter"],
  styles: ["modern", "minimalist", "scandinavian", "industrial", "cozy", "luxury", "boho", "japanese"],
  tones: ["brighter", "warmer", "cleaner", "more spacious", "cozier", "simpler"],
};

export default function AIDesignerChat() {
  const router = useRouter();
  const { tab, prompt, refImage, inputImage } = useLocalSearchParams();

  const params = useLocalSearchParams();
  const chatIdParam = typeof params?.chatId === "string" ? params.chatId : "new";
  const sourceParam = typeof params?.source === "string" ? params.source : "root";
  const titleParam = typeof params?.title === "string" ? params.title : "";
  const sessionIdParam = typeof params?.sessionId === "string" ? params.sessionId : "";

  const HEADER_DARK = "#01579B";

  const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || "";
  const OPENAI_TEXT_MODEL = "gpt-4.1-mini";

  const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
  const GEMINI_IMAGE_MODEL = "imagen-3.0-generate-002";

  // ==============================
  // ✅ Pro flag (CONNECTED to users/{uid}.isPro)
  // ==============================
  const [isPro, setIsPro] = useState(false);
  const [proLoaded, setProLoaded] = useState(false);
  const isProRef = useRef(false);

  const canShowFurnitureMatches = isPro === true || isProRef.current === true;
  const canShowLayoutSuggestions = isPro === true || isProRef.current === true;

  // ==============================
  // ✅ Daily limit (PER ACCOUNT)
  // ==============================
  const DAILY_LIMIT = 5;
  const WARNING_AT = 3;

  const [dailyGenCount, setDailyGenCount] = useState(0);
  const [dailyGenDateKey, setDailyGenDateKey] = useState(getLocalDateKey());
  const isLocked = !isPro && dailyGenCount >= DAILY_LIMIT;

  const [chatTitle, setChatTitle] = useState("Aesthetic AI");
  const [hasSavedTitle, setHasSavedTitle] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "ai",
      explanation:
        "Welcome. I am your Aesthetic AI Assistant. You may design a new space or customize an existing one by uploading a reference image.",
    },
  ]);

  // ✅ MISSING in your paste sometimes: keep input state here (no behavior change)
  const [input, setInput] = useState("");

  // ==============================
  // ✅ Live Prompt Suggestions
  // ==============================
  const [promptSuggestions, setPromptSuggestions] = useState([]);

  // ==============================
  // ✅ Prompt Filtration UI (NEW)
  // ==============================
  const PROMPT_MIN = 3;
  const PROMPT_MAX = 600;

  const [promptError, setPromptError] = useState("");
  const [promptWarn, setPromptWarn] = useState("");

  const [isTyping, setIsTyping] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null);

  // ✅ references (URLs)
  const [lastReferenceImageUrl, setLastReferenceImageUrl] = useState(null); // ORIGINAL ref
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState(null); // LAST AI result

  // ==============================
  // ✅ Project → Chat AUTO CUSTOMIZE PREFILL
  // ==============================
  useEffect(() => {
    if (typeof prompt === "string" && prompt.trim()) {
      setInput(prompt);
    }
  }, [prompt]);

  useEffect(() => {
    if (tab === "customize") {
      // Priority: Original uploaded image should be reference (strongest guarantee of same room)
      if (typeof inputImage === "string" && inputImage.startsWith("http")) {
        setLastReferenceImageUrl(inputImage);
      }

      // Keep AI result too (for history), but do NOT override original
      if (typeof refImage === "string" && refImage.startsWith("http")) {
        setLastGeneratedImageUrl(refImage);
      }
    }
  }, [tab, refImage, inputImage]);

  const sendingRef = useRef(false);
  const flatListRef = useRef(null);

  // ✅ reference image size holder (unchanged)
  const [refImageSize, setRefImageSize] = useState(null);
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

  const projectBootRef = useRef(false);

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
  const conversationIdRef = useRef(null);
  const historyUnsubRef = useRef(null);

  const isHistoryRealtimeActive = () => {
    return !!historyUnsubRef.current && chatIdParam && chatIdParam !== "new";
  };

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

  // ✅ FIX: Best reference for customize
  // ORIGINAL first (lastReferenceImageUrl), then AI result (lastGeneratedImageUrl)
  const getBestReferenceForCustomize = () => {
    return lastReferenceImageUrl || lastGeneratedImageUrl || null;
  };

  // ✅ Upload user image to Supabase (refs)
  const uploadUserImageForHistory = async (uri, promptText) => {
    const safeUri = typeof uri === "string" ? uri.trim() : "";
    if (!safeUri) return null;

    if (safeUri.startsWith("http://") || safeUri.startsWith("https://")) {
      return safeUri;
    }

    let cid = conversationIdRef.current;

    if (!cid) {
      try {
        cid = await ensureConversationOnce(promptText);
      } catch (e) {
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
  const uploadAIResultForHistory = async (imageData, promptText) => {
    if (!imageData) return null;

    let uri = null;

    if (typeof imageData === "string") {
      uri = imageData.trim();
    } else if (imageData && typeof imageData === "object") {
      const b64 = imageData?.base64 || imageData?.Base64 || imageData?.data || null;
      if (typeof b64 === "string" && b64.trim()) {
        uri = b64.startsWith("data:image/") ? b64 : `data:image/jpeg;base64,${b64}`;
      }
    }

    if (!uri) return null;

    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return uri;
    }

    const cid = conversationIdRef.current || (await ensureConversationOnce(promptText));

    const publicUrl = await uploadAIImageToSupabase({
      file: { uri, name: `ai_${Date.now()}.jpg` },
      conversationId: cid,
      kind: "results",
      bucket: "chat-files",
    });

    return publicUrl || null;
  };

  const saveResultToProjects = async ({ imageUrl, prompt, mode, inputImageUrl }) => {
    const uid = auth?.currentUser?.uid || userId;

    if (!uid) throw new Error("Not authenticated (uid missing)");

    const safeUrl = safeFirestoreImage(imageUrl);
    if (!safeUrl) throw new Error("Invalid image URL");

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

    await addDoc(collection(db, "projects"), docData);
  };

  const handleSaveOutline = async (item) => {
    try {
      const imageUrl = safeFirestoreImage(item?.image);
      if (!imageUrl) return;

      const uid = auth?.currentUser?.uid || userId;
      if (!uid) return;

      if (item?.savedToProjects === true) return;

      const mode = item?.mode || MODE.DESIGN;
      const prompt = String(item?.prompt || item?.title || chatTitle || "Aesthetic AI").trim();
      const inputImageUrl = safeFirestoreImage(item?.inputImage) || null;

      await saveResultToProjects({ imageUrl, prompt, mode, inputImageUrl });

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
        const { dateKey, count } = await loadDailyCounter(userId);
        setDailyGenDateKey(dateKey);
        setDailyGenCount(count);
      } catch (e) {
        console.warn("Daily limit load failed:", e?.message || e);
      }
    })();
  }, [userId]);

  const openLink = async (url) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
    } catch (e) {
      console.warn("Cannot open url:", url, e?.message || e);
    }
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
        const canShowPremiumNow = isProRef.current === true;

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

          // ✅ keep refs updated
          if (m.inputImage && String(m.inputImage).startsWith("http")) {
            setLastReferenceImageUrl(String(m.inputImage));
          } else if (m.lastReferenceImage && String(m.lastReferenceImage).startsWith("http")) {
            setLastReferenceImageUrl(String(m.lastReferenceImage));
          }

          if (m.image && String(m.image).startsWith("http")) {
            setLastGeneratedImageUrl(String(m.image));
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
  // ✅ Projects "Customize" boot: show saved prompt + images immediately
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

    // ✅ ORIGINAL ref first
    if (savedOriginal && (savedOriginal.startsWith("http://") || savedOriginal.startsWith("https://"))) {
      setLastReferenceImageUrl(savedOriginal);
    }
    // Keep AI result too
    if (savedResult && (savedResult.startsWith("http://") || savedResult.startsWith("https://"))) {
      setLastGeneratedImageUrl(savedResult);
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
    if (proLoaded) return isProRef.current === true;

    try {
      const uid = auth?.currentUser?.uid || userId;
      if (!uid) return false;

      const snap = await getDoc(doc(db, "users", uid));
      const d = snap.data() || {};
      const pro = d?.isPro === true;

      setIsPro(pro);
      isProRef.current = pro;
      setProLoaded(true);

      return pro;
    } catch (e) {
      setProLoaded(true);
      return false;
    }
  };

  // ------------------------------
  // Prompt validation helpers
  // ------------------------------
  const countAlphaNum = (s) => (normalizePromptSvc(s).match(/[a-zA-Z0-9]/g) || []).length;

  const isOnlySymbolsOrEmoji = (s) => {
    const t = normalizePromptSvc(s);
    if (!t) return true;
    return countAlphaNum(t) === 0;
  };

  const isRepeatedCharSpam = (s) => /(.)\1{7,}/.test(normalizePromptSvc(s));
  const isRepeatedWordSpam = (s) => /(\b\w+\b)(\s+\1){6,}/i.test(normalizePromptSvc(s));
  const hasTooManyLinks = (s) => (normalizePromptSvc(s).match(/https?:\/\/\S+/gi) || []).length >= 3;

  const validatePromptUI = (raw, { strict = true } = {}) => {
    const cleaned = normalizePromptSvc(raw);

    if (!cleaned) {
      if (!strict) return { ok: true, cleaned: "", warn: "" };
      return { ok: false, cleaned, error: "Please type a message." };
    }

    if (cleaned.length > PROMPT_MAX) {
      return {
        ok: false,
        cleaned: cleaned.slice(0, PROMPT_MAX),
        error: `Your message is too long. Keep it under ${PROMPT_MAX} characters.`,
      };
    }

    if (isOnlySymbolsOrEmoji(cleaned)) {
      return { ok: false, cleaned, error: "Please type a clear request (not only symbols or emojis)." };
    }

    if (isRepeatedCharSpam(cleaned) || isRepeatedWordSpam(cleaned)) {
      return { ok: false, cleaned, error: "Your message looks repetitive. Please type a clearer request." };
    }

    if (hasTooManyLinks(cleaned)) {
      return { ok: false, cleaned, error: "Please avoid sending many links. Summarize what you want instead." };
    }

    if (cleaned.length < PROMPT_MIN) {
      if (!strict) {
        return {
          ok: true,
          cleaned,
          warn: "Add more details (e.g., room type, style, and what you want to improve).",
        };
      }
      return {
        ok: false,
        cleaned,
        error: "Please add more details (e.g., room type, style, and what you want to improve).",
      };
    }

    let warn = "";
    if (cleaned.length >= 350) {
      warn = "Tip: Shorter prompts usually produce more accurate design results.";
    }

    return { ok: true, cleaned, warn };
  };

  // ==============================
  // ✅ Prompt Filtration Engine (FIXED)
  // ==============================
  // Goals:
  // - DO NOT show suggestions when input is empty (your quick prompts already cover that)
  // - Show relevant suggestions based on last word / phrase
  // - When user taps a suggestion, replace the last partial word (instead of always appending)
  const getPromptSuggestions = (raw) => {
    const textRaw = normalizePromptSvc(raw || "");
    const text = textRaw.toLowerCase().trim();

    // ✅ Critical fix: no suggestions when empty
    if (!text) return [];

    // Small guard: avoid showing suggestions for very long prompts
    if (text.length > 220) return [];

    // Phrase-level detection
    const phraseTail = text.replace(/\s+/g, " ");
    const tailTriggers = ["make me a", "design a", "create a", "generate a", "design an", "create an", "generate an"];
    if (tailTriggers.some((t) => phraseTail.endsWith(t))) {
      return PROMPT_FILTERS.rooms.slice(0, 6);
    }

    // If user already named a room, propose styles
    if (
      PROMPT_FILTERS.rooms.some((r) => phraseTail.includes(r)) ||
      phraseTail.includes("bedroom") ||
      phraseTail.includes("living") ||
      phraseTail.includes("kitchen") ||
      phraseTail.includes("bathroom")
    ) {
      return PROMPT_FILTERS.styles.slice(0, 6);
    }

    // Action intent
    if (phraseTail.startsWith("move") || phraseTail.includes(" move ") || phraseTail.includes("rearrange")) {
      return PROMPT_FILTERS.actions.slice(0, 6);
    }

    // Tone intent
    if (phraseTail.includes("more ") || phraseTail.includes("make it ") || phraseTail.includes("feel ")) {
      return PROMPT_FILTERS.tones.slice(0, 6);
    }

    // Prefix-based fallback on last token
    const words = phraseTail.split(/\s+/).filter(Boolean);
    const last = words[words.length - 1] || "";

    // If last token is too short, prefer base verbs (but still contextual)
    const pool =
      last.length <= 2
        ? [...PROMPT_FILTERS.base, ...PROMPT_FILTERS.rooms]
        : [
            ...PROMPT_FILTERS.rooms,
            ...PROMPT_FILTERS.actions,
            ...PROMPT_FILTERS.styles,
            ...PROMPT_FILTERS.tones,
            ...PROMPT_FILTERS.base,
          ];

    const uniq = Array.from(new Set(pool));

    // Match either last token prefix OR whole phrase prefix (for multi-word suggestions)
    const matches = uniq.filter((s) => {
      const sl = s.toLowerCase();
      if (!last) return false;
      return sl.startsWith(last) || sl.startsWith(`${last} `);
    });

    // If no prefix matches, offer a small “smart default” set
    if (matches.length === 0) {
      // Prefer actions if user typed something like "improve", else styles
      if (phraseTail.includes("improve") || phraseTail.includes("better") || phraseTail.includes("optimize")) {
        return PROMPT_FILTERS.actions.slice(0, 6);
      }
      return PROMPT_FILTERS.styles.slice(0, 6);
    }

    return matches.slice(0, 6);
  };

  const applySuggestion = (prevInput, suggestion) => {
    const base = String(prevInput || "");
    const trimmed = base.replace(/\s+$/g, "");
    if (!trimmed) return suggestion;

    const words = trimmed.split(/\s+/);
    if (words.length === 0) return suggestion;

    const last = words[words.length - 1] || "";
    const sug = String(suggestion || "").trim();
    if (!sug) return trimmed;

    // Replace last word if it's a partial prefix of the suggestion
    const sugFirstToken = sug.split(/\s+/)[0]?.toLowerCase() || "";
    const lastLower = last.toLowerCase();

    if (lastLower && sug.toLowerCase().startsWith(lastLower) && lastLower !== sug.toLowerCase()) {
      words[words.length - 1] = sug;
      return words.join(" ") + " ";
    }

    // Otherwise append
    return trimmed + " " + sug + " ";
  };

  const sendMessage = async (text = input) => {
    const v = validatePromptUI(text, { strict: true });
    const clean = v.cleaned;

    if (!v.ok) {
      setPromptError(v.error || "Invalid prompt.");
      setPromptWarn("");

      if (!isHistoryRealtimeActive()) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", explanation: v.error || "Invalid prompt.", tips: [], layoutSuggestions: [], furnitureMatches: [] },
        ]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
      }
      return;
    }

    setPromptError("");
    setPromptWarn(v.warn || "");

    if (sendingRef.current) return;
    sendingRef.current = true;

    const realtime = isHistoryRealtimeActive();

    try {
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

      // ✅ NEW: explicit intent detection (works in ANY tab)
      const normalizedMsg = normalizeText(clean);
      const explicitDesign = DESIGN_TRIGGERS.some((k) => normalizedMsg.includes(k));
      const explicitCustomize = CUSTOMIZE_TRIGGERS.some((k) => normalizedMsg.includes(k));

      let desiredMode = detectModeFromMessage(clean);

      // ✅ User explicit intent always wins
      if (explicitDesign) desiredMode = MODE.DESIGN;
      if (explicitCustomize) desiredMode = MODE.CUSTOMIZE;

      // ✅ Tab customize: default CUSTOMIZE unless explicitly design/customize
      if (tab === "customize") {
        if (!explicitDesign && !explicitCustomize) desiredMode = MODE.CUSTOMIZE;
      }

      // ✅ FIX #1 (UPDATED): Force CUSTOMIZE if ANY reference exists (prevents “ibang room”)
      // BUT if user explicitly requested DESIGN, allow DESIGN (go back anytime).
      const hasAnyRef = !!uploadedImage || !!getBestReferenceForCustomize();
      if (hasAnyRef && desiredMode !== MODE.CUSTOMIZE && !explicitDesign) {
        desiredMode = MODE.CUSTOMIZE;
      }

      // If user starts a NEW DESIGN, clear refs (so design is totally fresh)
      if (desiredMode === MODE.DESIGN) {
        setLastGeneratedImageUrl(null);
        setLastReferenceImageUrl(null);
      }

      let uploadedRefUrl = null;
      if (uploadedImage) {
        uploadedRefUrl = await uploadUserImageForHistory(uploadedImage, clean);

        if (uploadedRefUrl) {
          // ✅ This is ORIGINAL ref
          setLastReferenceImageUrl(uploadedRefUrl);

          setMessages((prev) => {
            for (let i = prev.length - 1; i >= 0; i--) {
              const m = prev[i];
              if (m?.role === "user" && typeof m?.image === "string" && m.image.startsWith("file://")) {
                const next = [...prev];
                next[i] = { ...m, image: uploadedRefUrl };
                return next;
              }
            }
            return prev;
          });
        }
      }

      // ✅ Effective reference for customize: prefer ORIGINAL uploaded ref
      const effectiveImage =
      desiredMode === MODE.CUSTOMIZE
        ? (uploadedRefUrl || getBestReferenceForCustomize())
        : null;
    
        const isUsableImageRef = (u) => {
          const s = typeof u === "string" ? u.trim() : "";
          if (!s) return false;
          return (
            s.startsWith("http://") ||
            s.startsWith("https://") ||
            s.startsWith("data:image/") // ✅ allow base64 data URI
          );
        };
        
        if (desiredMode === MODE.CUSTOMIZE && !isUsableImageRef(effectiveImage)) {
          if (!realtime) {
            setMessages((prev) => [
              ...prev,
              { role: "user", text: clean },
              {
                role: "ai",
                explanation:
                  "Customization needs the ORIGINAL room image (public https link or a base64 image). Please re-upload/capture the room photo so I can edit the same room.",
                tips: [],
                layoutSuggestions: [],
                furnitureMatches: [],
              },
            ]);
          }
          setInput("");
          setPromptSuggestions([]);
          setIsTyping(false);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          return;
        }
        
        if (desiredMode === MODE.CUSTOMIZE && !isUsableImageRef(effectiveImage)) {
          if (!realtime) {
            setMessages((prev) => [
              ...prev,
              { role: "user", text: clean },
              {
                role: "ai",
                explanation:
                  "Customization needs the ORIGINAL room image (public https link OR a base64 image). Please re-upload/capture the room photo so I can edit the same room.",
                tips: [],
                layoutSuggestions: [],
                furnitureMatches: [],
              },
            ]);
          }
          setInput("");
          setPromptSuggestions([]);
          setIsTyping(false);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          return;
        }
        
      try {
        const cid = conversationIdRef.current || (await ensureConversationOnce(clean));
        await saveAIUserMessage(cid, { text: clean, image: safeFirestoreImage(uploadedRefUrl) });
      } catch (e) {
        console.warn("saveAIUserMessage failed:", e?.message || e);
      }

      if (!realtime) {
        setMessages((prev) => [...prev, { role: "user", text: clean, image: uploadedRefUrl || null }]);
      }

      setInput("");
      setPromptSuggestions([]); // ✅ keep UI clean after send
      setIsTyping(true);

      if (!realtime && !proNow && dailyGenCount === WARNING_AT) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", explanation: "Notice: You have 2 generations left today.", tips: [], layoutSuggestions: [], furnitureMatches: [] },
        ]);
      }

      try {
        const result = await callAIDesignAPI({
          apiKey: OPENAI_API_KEY,
          textModel: OPENAI_TEXT_MODEL,
          geminiApiKey: GEMINI_API_KEY,
          geminiImageModel: GEMINI_IMAGE_MODEL,
          message: clean,
          mode: desiredMode,
          image: effectiveImage,
          sessionId,
          isPro: proNow,
          useOpenAIForCustomize: true,
        
          hfToken: process.env.EXPO_PUBLIC_HF_TOKEN || "",
          inputImageBase64: uploadedImageBase64,
        });
        

        if (result?.sessionId) setSessionId(result.sessionId);

        // ✅ FIX #3: Customize edit failed => show message (NO generator fallback)
        if (desiredMode === MODE.CUSTOMIZE && result?.blockedReason) {
          setIsTyping(false);
          setUploadedImage(null);

          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              explanation:
                "Customization edit failed. I cannot redesign the same room without a successful image edit. Please try again, or re-upload the original reference image.",
              tips: [],
              layoutSuggestions: [],
              furnitureMatches: [],
            },
          ]);

          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          return;
        }

        let updatedCount = dailyGenCount;
        if (!proNow) {
          const next = await incrementDailyCount(userId, dailyGenCount);
          setDailyGenDateKey(getLocalDateKey());
          setDailyGenCount(next);
          updatedCount = next;
        }

        setUploadedImage(null);
        setIsTyping(false);

        const mergedPayload = mergeBackendPayload(result);

        const {
          explanation,
          tips,
          palette,
          layoutSuggestions: backendLayoutSuggestions,
          furnitureMatches: furnitureMatchesAll,
        } = applyPremiumGatingToPayload({ mergedPayload, proNow });

        const resultImageUri = normalizeBackendImageToUri(result?.image);

        let aiImagePublicUrl = null;
        if (resultImageUri) {
          if (resultImageUri.startsWith("http://") || resultImageUri.startsWith("https://")) {
            aiImagePublicUrl = resultImageUri;
          } else {
            aiImagePublicUrl = await uploadAIResultForHistory(resultImageUri, clean);
          }
        }

        const uiResultImage = aiImagePublicUrl || resultImageUri || null;

        if (uiResultImage) {
          setLastGeneratedImageUrl(uiResultImage);

          // ✅ Never override ORIGINAL ref with AI result
          // only set reference if we don't have any original reference yet
          setLastReferenceImageUrl((prev) => prev || safeFirestoreImage(effectiveImage) || null);
        }

        const firestoreInputImageUrl =
          desiredMode === MODE.CUSTOMIZE ? safeFirestoreImage(effectiveImage) : safeFirestoreImage(uploadedRefUrl);

        try {
          const cid = conversationIdRef.current || (await ensureConversationOnce(clean));
          await saveAIResponse(cid, {
            mode: desiredMode,
            explanation,
            tips,
            palette,
            layoutSuggestions: proNow ? backendLayoutSuggestions : [],
            furnitureMatches: proNow ? furnitureMatchesAll : [],
            inputImage: firestoreInputImageUrl,
            image: safeFirestoreImage(aiImagePublicUrl || resultImageUri),
            sessionId: result?.sessionId || sessionId || null,
            lastReferenceImage: safeFirestoreImage(effectiveImage) || null,
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
      base64: true,
    });
    

    if (!result.canceled) {
      const asset = result.assets[0];
     const uri = asset.uri;

setUploadedImage(uri);
setUploadedImageBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null);

      await setRefSizeFromUri(uri);

      if (!isHistoryRealtimeActive()) {
        setMessages((prev) => [...prev, { role: "user", text: "Reference image attached.", image: uri }]);
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const takePhoto = async () => {
    if (isLocked) return;

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      base64: true,
    });
    
    
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setUploadedImage(uri);
      await setRefSizeFromUri(uri);

      if (!isHistoryRealtimeActive()) {
        setMessages((prev) => [...prev, { role: "user", text: "Photo captured and attached.", image: uri }]);
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const clearAttachment = () => {
    setUploadedImage(null);
    setUploadedImageBase64(null);
  };
  
  const renderMessage = ({ item }) => {
    const isAi = item.role === "ai";
    const paletteColors = Array.isArray(item?.palette?.colors) ? item.palette.colors : [];
    const layoutSuggestions = Array.isArray(item?.layoutSuggestions) ? item.layoutSuggestions : [];
    const furnitureMatches = Array.isArray(item?.furnitureMatches) ? item.furnitureMatches : [];

    const showSaveOutline = isAi && item?.mode === MODE.DESIGN && !!safeFirestoreImage(item?.image);

    return (
      <View style={[styles.messageRow, isAi ? styles.aiRow : styles.userRow]}>
        {isAi && (
          <View style={[styles.miniAvatar, styles.aiMiniAvatar]}>
            <MaterialCommunityIcons name="robot" size={12} color="#FFF" />
          </View>
        )}

        <View style={[styles.bubble, isAi ? styles.aiBubble : styles.userBubble]}>
          {!isAi && item.image && (
            <Image
              source={{ uri: item.image }}
              style={styles.previewImage}
              onError={(e) => console.log("❌ User image load failed:", item.image, e?.nativeEvent)}
            />
          )}

          {isAi && (item.inputImage || item.image) && (
            <View style={styles.imageCompareWrap}>
              {item.inputImage && (
                <View style={styles.imageBlock}>
                  <Text style={styles.imageLabel}>Original</Text>
                  <Image
                    source={{ uri: item.inputImage }}
                    style={styles.previewImage}
                    onError={(e) =>
                      console.log("❌ Original image load failed:", item.inputImage, e?.nativeEvent)
                    }
                  />
                </View>
              )}

              {item.image && (
                <View style={styles.imageBlock}>
                  <Text style={styles.imageLabel}>Result</Text>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.previewImage}
                    onError={(e) =>
                      console.log("❌ Result image load failed:", item.image, e?.nativeEvent)
                    }
                  />
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

  const sendEnabled = !isLocked && validatePromptUI(input, { strict: true }).ok;

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
      <View style={styles.typingBubble}>
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
        <Text style={styles.typingText}>Generating…</Text>
      </View>
    </View>
  )}

  {/* ✅ FOOTER DOCK (permanent bottom) */}
  <View style={styles.footerDock}>
    {/* ✅ Upgrade banner when locked */}
    {isLocked && (
      <TouchableOpacity
        style={styles.upgradeBanner}
        onPress={() => router.push("/User/UpdateInfo")}
        activeOpacity={0.9}
      >
        <View style={styles.upgradeLeft}>
          <MaterialCommunityIcons name="crown" size={18} color="#0F172A" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
            <Text style={styles.upgradeSub}>
              Unlimited generations • Furniture Matches • Layout Suggestions
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color="#0F172A" />
      </TouchableOpacity>
    )}

    {/* ✅ Prompt chips (quick prompts) */}
    {!isLocked && (
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chipsToShow.map((c) => (
            <TouchableOpacity
              key={c}
              style={styles.chip}
              onPress={() => {
                setInput(c);
                const v = validatePromptUI(c, { strict: false });
                setPromptError(v.ok ? "" : v.error || "");
                setPromptWarn(v.warn || "");
                setPromptSuggestions(getPromptSuggestions(c));
              }}
            >
              <Text style={styles.chipText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )}

    {/* ✅ Attachment preview */}
    {!!uploadedImage && (
      <View style={styles.attachmentBar}>
        <View style={styles.attachmentLeft}>
          <Image source={{ uri: uploadedImage }} style={styles.attachmentThumb} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.attachmentTitle} numberOfLines={1}>
              Reference ready
            </Text>
            <Text style={styles.attachmentSub} numberOfLines={1}>
              This will be used for Customize (same room reference)
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={clearAttachment} style={styles.attachmentClearBtn}>
          <Feather name="x" size={16} color="#0F172A" />
        </TouchableOpacity>
      </View>
    )}

    {/* ✅ Prompt filtration feedback */}
    {(!!promptError || !!promptWarn) && (
      <View style={styles.promptFeedbackWrap}>
        {!!promptError && (
          <View style={[styles.promptFeedbackCard, styles.promptErrorCard]}>
            <Feather name="alert-circle" size={14} color="#991B1B" />
            <Text style={styles.promptErrorText}>{promptError}</Text>
          </View>
        )}

        {!promptError && !!promptWarn && (
          <View style={[styles.promptFeedbackCard, styles.promptWarnCard]}>
            <Feather name="info" size={14} color="#0F172A" />
            <Text style={styles.promptWarnText}>{promptWarn}</Text>
          </View>
        )}
      </View>
    )}

    {/* ✅ Prompt suggestions ABOVE the footer (input bar) */}
    {!!promptSuggestions.length && !isLocked && !!String(input || "").trim() && (
      <View style={styles.promptFilterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {promptSuggestions.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.promptFilterChip}
              onPress={() => {
                setInput((prev) => applySuggestion(prev, s));
                setPromptSuggestions([]);
              }}
            >
              <Text style={styles.promptFilterText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )}

    {/* ✅ Footer input bar (permanent bottom) */}
    <View style={styles.inputBar}>
      <TouchableOpacity
        onPress={pickImage}
        style={[styles.iconBtn, isLocked && { opacity: 0.55 }]}
        disabled={isLocked}
      >
        <Feather name="image" size={18} color="#0F172A" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={takePhoto}
        style={[styles.iconBtn, isLocked && { opacity: 0.55 }]}
        disabled={isLocked}
      >
        <Feather name="camera" size={18} color="#0F172A" />
      </TouchableOpacity>

      <View style={styles.textBox}>
        <TextInput
          value={input}
          onChangeText={(t) => {
            setInput(t);

            const v = validatePromptUI(t, { strict: false });
            setPromptError(v.ok ? "" : v.error || "");
            setPromptWarn(v.warn || "");

            const nextSug = getPromptSuggestions(t);
            setPromptSuggestions(nextSug);
          }}
          placeholder={isLocked ? "Upgrade to continue…" : "Describe what you want to change or design…"}
          placeholderTextColor="#94A3B8"
          style={styles.textInput}
          editable={!isLocked}
          multiline
          maxLength={PROMPT_MAX + 50}
        />

        <Text style={styles.counterText}>
          {Math.min(String(input || "").length, PROMPT_MAX)}/{PROMPT_MAX}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => sendMessage()}
        style={[styles.sendBtn, !sendEnabled && { opacity: 0.5 }]}
        disabled={!sendEnabled}
      >
        <Feather name="send" size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  </View>
</KeyboardAvoidingView>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0F172A" },
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerLogoBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  headerSubRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },
  statusText: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" },
  sessionText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
    maxWidth: 160,
  },
  headerRight: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  // IMPORTANT: give space for the docked footer (chips + banners + input)
  scrollArea: { padding: 14, paddingBottom: 360 },

  messageRow: { flexDirection: "row", marginBottom: 12, alignItems: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  userRow: { justifyContent: "flex-end" },

  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
  },
  aiMiniAvatar: { backgroundColor: "#0F172A" },
  userMiniAvatar: { backgroundColor: "#E2E8F0" },

  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  aiBubble: { backgroundColor: "#FFFFFF" },
  userBubble: { backgroundColor: "#0EA5E9", borderColor: "#0EA5E9" },

  userText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", lineHeight: 20 },

  previewImage: { width: 220, height: 160, borderRadius: 12, backgroundColor: "#E2E8F0" },
  imageCompareWrap: { gap: 10, marginBottom: 10 },
  imageBlock: { gap: 6 },
  imageLabel: { fontSize: 11, fontWeight: "800", color: "#64748B" },

  section: { marginTop: 8 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: "#0F172A" },
  sectionMeta: { fontSize: 11, fontWeight: "800", color: "#64748B" },

  paragraph: { fontSize: 13, color: "#0F172A", lineHeight: 20, fontWeight: "600" },

  tipRow: { flexDirection: "row", gap: 8, marginTop: 6, paddingRight: 6 },
  tipBullet: { fontSize: 14, fontWeight: "900", color: "#0EA5E9", marginTop: -1 },
  bulletText: { flex: 1, fontSize: 13, color: "#0F172A", lineHeight: 19, fontWeight: "600" },

  paletteRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  paletteCard: {
    width: 96,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  swatch: { height: 30, borderRadius: 10, marginBottom: 8 },
  swatchLabel: { fontSize: 11, fontWeight: "800", color: "#0F172A" },
  swatchHex: { fontSize: 10, fontWeight: "900", color: "#64748B", marginTop: 2 },

  furnitureCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  furnitureName: { fontSize: 13, fontWeight: "900", color: "#0F172A" },
  furniturePlacement: { fontSize: 12, fontWeight: "700", color: "#475569", marginTop: 6 },
  furnitureLinksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  furniturePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  furniturePillText: { fontSize: 11, fontWeight: "900", color: "#0F172A" },

  saveOutlineBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  saveOutlineText: { fontSize: 12, fontWeight: "900", color: "#0F172A" },

  typingWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  typingDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: "#94A3B8" },
  typingText: { marginLeft: 6, fontSize: 11, fontWeight: "900", color: "#64748B" },

  upgradeBanner: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FDE68A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  upgradeLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  upgradeTitle: { fontSize: 13, fontWeight: "900", color: "#0F172A" },
  upgradeSub: { fontSize: 11, fontWeight: "800", color: "#0F172A", marginTop: 2, opacity: 0.9 },

  chipsWrap: { paddingBottom: 6 },
  chipsRow: { paddingHorizontal: 14, gap: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipText: { fontSize: 12, fontWeight: "800", color: "#0F172A" },

  attachmentBar: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  attachmentLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  attachmentThumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#E2E8F0" },
  attachmentTitle: { fontSize: 12, fontWeight: "900", color: "#0F172A" },
  attachmentSub: { fontSize: 11, fontWeight: "800", color: "#64748B", marginTop: 2 },
  attachmentClearBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
  },

  promptFeedbackWrap: { paddingHorizontal: 14, paddingBottom: 8 },
  promptFeedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  promptErrorCard: { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" },
  promptWarnCard: { backgroundColor: "#E2E8F0", borderColor: "#CBD5E1" },
  promptErrorText: { flex: 1, fontSize: 12, fontWeight: "900", color: "#991B1B" },
  promptWarnText: { flex: 1, fontSize: 12, fontWeight: "900", color: "#0F172A" },

  // ✅ Prompt suggestions row (above input bar)
  promptFilterWrap: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  promptFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#38BDF8",
    marginRight: 8,
  },
  promptFilterText: { fontSize: 12, fontWeight: "900", color: "#075985" },

  // ✅ Dock container at bottom
  footerDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingBottom: 12,
  },

  // ✅ Input row
  inputBar: {
    flexDirection: "row",
    alignItems: "center", // keep icons + input aligned
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 0,
    backgroundColor: "#F8FAFC",
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  // ✅ Lowered to match icon height
  textBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
  },

  // ✅ Critical fix: maxHeight must be ~40, not 110
  textInput: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "400",
    lineHeight: 18,
    maxHeight: 15,
    paddingTop: 0,
    paddingBottom: 0,
  },

  counterText: {
    alignSelf: "flex-end",
    marginTop: 4,
    fontSize: 10,
    fontWeight: "400",
    color: "#94A3B8",
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0EA5E9",
  },
});

