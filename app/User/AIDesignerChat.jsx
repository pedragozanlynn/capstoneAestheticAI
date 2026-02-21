

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator"; // ✅ NEW (Fix 1)
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
} from "react-native";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import PromptFilters from "../components/PromptFilters";

import { getAuth } from "firebase/auth";
import {
  ensureAIConversation,
  saveAIResponse,
  saveAIUserMessage,
} from "../../services/ai/aiConversationService";

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
  updateDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";

import {
  callAIDesignAPI,
  mergeBackendPayload,
  normalizeBackendImageToUri,
} from "../../services/ai/openaiAIDesignService";

import {
  CUSTOMIZE_TRIGGERS,
  DESIGN_TRIGGERS,
  MODE,
  applyPremiumGatingToPayload,
  detectModeFromMessage,
  normalizeFurnitureItem,
  normalizeText,
  safeFirestoreImage,
} from "../../services/ai/premiumGateService";

import {
  getLocalDateKey,
  incrementDailyCount,
  loadDailyCounter,
} from "../../services/ai/dailyLimitService";

import CenterMessageModal from "../components/CenterMessageModal";

const normalizePromptSvc = (v) => {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.replace(/\s+/g, " ").trim();
};

// ==============================
// ✅ TIMEOUT FIX (Fix 1): downscale/compress before base64
// ==============================
const MAX_IMAGE_DIM = 1024; // keep edits fast
const IMAGE_COMPRESS = 0.6; // good quality + smaller payload
const MAX_B64_CHARS = 900_000; // ~0.9MB safety (prevents timeout)

const downscaleToBase64 = async (uri) => {
  const safeUri = typeof uri === "string" ? uri.trim() : "";
  if (!safeUri) return { uri: null, base64: null };

  const r = await ImageManipulator.manipulateAsync(
    safeUri,
    [{ resize: { width: MAX_IMAGE_DIM } }], // keeps aspect ratio
    {
      compress: IMAGE_COMPRESS,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  const base64 = r?.base64 ? `data:image/jpeg;base64,${r.base64}` : null;

  // If still too large, return null so we fallback to URL upload (Fix 2)
  if (base64 && base64.length > MAX_B64_CHARS) return { uri: r.uri, base64: null };

  return { uri: r.uri, base64 };
};

// ==============================
// ✅ Title helpers
// ==============================
const makeTitle = (text = "") => {
  const t = String(text).trim().replace(/\s+/g, " ");
  if (!t) return "Aesthetic AI";
  return t.length > 32 ? t.slice(0, 32) + "…" : t;
};

const markMessageSavedInFirestore = async ({
  conversationId,
  userId,
  sourceParam,
  imageUrl,
}) => {
  try {
    if (!conversationId) return;
    if (!imageUrl) return;

    const messagesCol =
      sourceParam === "user"
        ? collection(
            db,
            "users",
            userId,
            "aiConversations",
            conversationId,
            "messages"
          )
        : collection(db, "aiConversations", conversationId, "messages");

    const qy = query(messagesCol, orderBy("createdAt", "desc"));
    const snap = await new Promise((resolve, reject) => {
      import("firebase/firestore").then(({ getDocs }) => {
        getDocs(qy).then(resolve).catch(reject);
      });
    });

    const docs = snap?.docs || [];
    const found = docs.find((d) => {
      const m = d.data() || {};
      return (m.role || "ai") === "ai" && String(m.image || "") === String(imageUrl);
    });

    if (!found) return;

    await updateDoc(found.ref, { savedToProjects: true });
  } catch (e) {
    console.warn("markMessageSavedInFirestore failed:", e?.message || e);
  }
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
  const insets = useSafeAreaInsets();

  const { tab, prompt, refImage, inputImage } = useLocalSearchParams();
  const params = useLocalSearchParams();

  const chatIdParam = typeof params?.chatId === "string" ? params.chatId : "new";
  const sourceParam = typeof params?.source === "string" ? params.source : "root";
  const titleParam = typeof params?.title === "string" ? params.title : "";
  const sessionIdParam = typeof params?.sessionId === "string" ? params.sessionId : "";

  const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || "";
  const OPENAI_TEXT_MODEL = "gpt-4.1-mini";

  // ✅ DESIGN generation (OpenAI Images API)
  const OPENAI_IMAGE_MODEL = "gpt-image-1";
  const OPENAI_IMAGE_SIZE = "auto";

  // ==============================
  // ✅ Pro flag
  // ==============================
  const [isPro, setIsPro] = useState(false);
  const [proLoaded, setProLoaded] = useState(false);
  const isProRef = useRef(false);

  const canShowFurnitureMatches = isPro === true || isProRef.current === true;
  const canShowLayoutSuggestions = isPro === true || isProRef.current === true;

  // ==============================
  // ✅ Daily limit
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

  const [input, setInput] = useState("");
  const [promptSuggestions, setPromptSuggestions] = useState([]);

  const PROMPT_MIN = 3;
  const PROMPT_MAX = 600;

  const [promptError, setPromptError] = useState("");
  const [promptWarn, setPromptWarn] = useState("");

  const [msgModal, setMsgModal] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const showMsg = (type, title, message) =>
    setMsgModal({ visible: true, type, title, message });
  const hideMsg = () => setMsgModal((p) => ({ ...p, visible: false }));

  const [isTyping, setIsTyping] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e?.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0)
    );
    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  const extractAnyImage = (payload) => {
    if (!payload) return null;
    if (typeof payload === "string") return payload;

    if (typeof payload?.image === "string" && payload.image.trim()) return payload.image.trim();

    const b64 =
      payload?.data?.[0]?.b64_json ||
      payload?.data?.[0]?.b64 ||
      payload?.b64_json ||
      payload?.image?.b64_json ||
      null;

    const url =
      payload?.data?.[0]?.url ||
      payload?.url ||
      payload?.image?.url ||
      null;

    if (typeof url === "string" && url.trim()) return url.trim();
    if (typeof b64 === "string" && b64.trim()) return b64.trim();

    const fromService =
      payload?.image ??
      payload?.images ??
      payload?.output_image ??
      null;

    if (typeof fromService === "string" && fromService.trim()) return fromService.trim();
    if (fromService && typeof fromService === "object") return fromService;

    return null;
  };

  const normalizeAnyImageToUri = (img) => {
    if (!img) return null;

    if (typeof img === "object") {
      const b =
        img?.base64 || img?.Base64 || img?.b64_json || img?.data || img?.b64 || null;
      if (typeof b === "string" && b.trim()) {
        const s = b.trim();
        return s.startsWith("data:image/") ? s : `data:image/png;base64,${s}`;
      }
      const u = img?.url;
      if (typeof u === "string" && u.trim()) return u.trim();
      return null;
    }

    const s = String(img).trim();
    if (!s) return null;
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("data:image/")) return s;

    if (s.length > 80 && !/\s/.test(s)) return `data:image/png;base64,${s}`;

    return null;
  };

  // ==============================
  // ✅ Image state
  // ==============================
  const [uploadedImage, setUploadedImage] = useState(null); // local file uri
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null); // data:image/... base64 for speed (optimized)

  // ✅ “Last known” pointers
  const [lastReferenceImageUrl, setLastReferenceImageUrl] = useState(null);   // last user/original ref
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState(null);   // last AI output (chain base)

  // ==============================
  // ✅ LOCKED chain reference (Single Source of Truth for NEXT ITERATION)
  // ==============================
  const lockedChainRef = useRef(null);
  const chainRefKind = useRef("ref");
  const [lockedChainRefUrl, setLockedChainRefUrl] = useState(null);

  // If chat started from Projects, user can’t change via upload, but chain can still update via results
  const lockedFromProjectRef = useRef(false);

  const isUsableImageRef = (u) => {
    const s = typeof u === "string" ? u.trim() : "";
    if (!s) return false;
    return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:image/");
  };

  const setChainReference = (url, { fromProject = false, kind = "ai" } = {}) => {
    const safe = typeof url === "string" ? url.trim() : "";
    const v = safeFirestoreImage(safe) || (safe.startsWith("data:image/") ? safe : null);
    if (!v) return;
  
    lockedChainRef.current = v;
    setLockedChainRefUrl(v);
  
    chainRefKind.current = kind;
  
    if (fromProject) lockedFromProjectRef.current = true;
  };

  const clearChainReference = () => {
    lockedChainRef.current = null;
    setLockedChainRefUrl(null);
    lockedFromProjectRef.current = false;
    chainRefKind.current = "ref";
  };
  // ==============================
  // ✅ Project → Chat AUTO CUSTOMIZE PREFILL
  // ==============================
  useEffect(() => {
    if (typeof prompt === "string" && prompt.trim()) setInput(prompt);
  }, [prompt]);

  useEffect(() => {
    if (tab !== "customize") return;
  
    const generated = typeof refImage === "string" ? refImage.trim() : "";
    const original = typeof inputImage === "string" ? inputImage.trim() : "";
  
    if (isUsableImageRef(generated)) {
      (async () => {
        // ✅ If project refImage is Pollinations, rehost it to Supabase immediately
        let stable = generated;
    
        try {
          if (isPollinationsUrl(generated)) {
            const up = await uploadAIResultForHistory(generated, titleParam || chatTitle || "project");
            if (isUsableImageRef(up)) stable = up;
          }
        } catch {}
    
        setChainReference(stable, { fromProject: true, kind: "ai" });
        setLastGeneratedImageUrl(stable);
    
        if (isUsableImageRef(original)) setLastReferenceImageUrl(original);
    
        setUploadedImage(null);
        setUploadedImageBase64(null);
      })();
    
      return;
    }
  
    // Fallback only if refImage is missing: keep old behavior but do NOT treat it as AI chain
    if (isUsableImageRef(original)) {
      setChainReference(original, { fromProject: true, kind: "ref" });
      setLastReferenceImageUrl(original);
      setUploadedImage(null);
      setUploadedImageBase64(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refImage, inputImage]);

  const sendingRef = useRef(false);
  const flatListRef = useRef(null);

  // ==============================
  // ✅ Firestore conversation state
  // ==============================
  const auth = getAuth();
  const [userId, setUserId] = useState(null);
  const conversationIdRef = useRef(null);
  const historyUnsubRef = useRef(null);

  const isHistoryRealtimeActive = () =>
    !!historyUnsubRef.current && chatIdParam && chatIdParam !== "new";

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUserId(u?.uid || null));
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

    await ensureAIConversation({ conversationId: cid, title: makeTitle(firstPrompt) });
    return cid;
  };

  // ✅ CHAIN RULE:
  // - If user uploaded a NEW image this turn -> that is the Original for THIS request.
  // - Else -> Original is last AI result (chain ref) for BOTH Customize and Design.
  const pickChainBase = ({ base64Immediate } = {}) => {
    if (typeof base64Immediate === "string" && base64Immediate.startsWith("data:image/")) {
      return base64Immediate; // this-turn upload
    }

    const locked = typeof lockedChainRef.current === "string" ? lockedChainRef.current.trim() : "";
    if (locked) return locked;

    const lastGen = typeof lastGeneratedImageUrl === "string" ? lastGeneratedImageUrl.trim() : "";
    if (lastGen) return lastGen;

    return null;
  };

  // ✅ DESIGN should NEVER use the last reference/original.
// It should use only the last AI result (iterative design) or nothing.
const pickDesignBase = () => {
  const lastGen = typeof lastGeneratedImageUrl === "string" ? lastGeneratedImageUrl.trim() : "";
  if (isUsableImageRef(lastGen)) return lastGen;

  // If chain ref is AI, allow it. If it's REF, ignore it.
  const locked = typeof lockedChainRef.current === "string" ? lockedChainRef.current.trim() : "";
  if (chainRefKind.current === "ai" && isUsableImageRef(locked)) return locked;

  return null;
};

const isPollinationsUrl = (u) => {
  const s = typeof u === "string" ? u.trim() : "";
  return !!s && s.includes("image.pollinations.ai");
};

  // ✅ Upload helpers
  const uploadUserImageForHistory = async (uri, promptText) => {
    const safeUri = typeof uri === "string" ? uri.trim() : "";
    if (!safeUri) return null;

    if (safeUri.startsWith("http://") || safeUri.startsWith("https://")) return safeUri;

    let cid = conversationIdRef.current;
    if (!cid) {
      try {
        cid = await ensureConversationOnce(promptText);
      } catch (e) {
        cid = `temp_${Date.now()}`;
        conversationIdRef.current = cid;
      }
    }

    const publicUrl = await uploadAIImageToSupabase({
      file: { uri: safeUri, name: `user_${Date.now()}.jpg`, mimeType: "image/jpeg" },
      conversationId: cid,
      kind: "refs",
      bucket: "chat-files",
    });

    return publicUrl || null;
  };

  const uploadAIResultForHistory = async (imageData, promptText) => {
    if (!imageData) return null;

    let uri = null;
    if (typeof imageData === "string") uri = imageData.trim();
    else if (imageData && typeof imageData === "object") {
      const b64 = imageData?.base64 || imageData?.Base64 || imageData?.data || null;
      if (typeof b64 === "string" && b64.trim())
        uri = b64.startsWith("data:image/") ? b64 : `data:image/jpeg;base64,${b64}`;
    }

    if (!uri) return null;

    // ✅ If it's already http(s) BUT from Pollinations, still rehost to Supabase (530-proof)
    const isHttp = uri.startsWith("http://") || uri.startsWith("https://");
    if (isHttp && !isPollinationsUrl(uri)) return uri;

    const cid = conversationIdRef.current || (await ensureConversationOnce(promptText));

    const publicUrl = await uploadAIImageToSupabase({
      file: { uri, name: `ai_${Date.now()}.jpg` },
      conversationId: cid,
      kind: "results",
      bucket: "chat-files",
    });

    return publicUrl || null;
  };

  const saveResultToProjects = async ({
    imageUrl,
    prompt,
    mode,
    inputImageUrl,
    explanation,
    palette,
  }) => {
    const uid = auth?.currentUser?.uid || userId;
    if (!uid) throw new Error("Not authenticated (uid missing)");

    const safeUrl = safeFirestoreImage(imageUrl);
    if (!safeUrl) throw new Error("Invalid image URL");

    const docData = {
      uid: String(uid),
      image: safeUrl,
      prompt: String(prompt || "").trim(),
      mode: mode || MODE.DESIGN,
      inputImage: mode === MODE.CUSTOMIZE ? safeFirestoreImage(inputImageUrl) || null : null,
      explanation: typeof explanation === "string" ? explanation : "",
      palette: palette && typeof palette === "object" ? palette : null,
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

      if (item?.savedToProjects === true) {
        showMsg("info", "Already Saved", "This design is already in your Projects.");
        return;
      }

      const mode =
        item?.mode ||
        (safeFirestoreImage(item?.inputImage) ? MODE.CUSTOMIZE : MODE.DESIGN);

      const prompt = String(item?.prompt || item?.title || chatTitle || "Aesthetic AI").trim();
      const inputImageUrl = safeFirestoreImage(item?.inputImage) || null;

      await saveResultToProjects({
        imageUrl,
        prompt,
        mode,
        inputImageUrl,
        explanation: item?.explanation || "",
        palette: item?.palette || null,
      });

      setMessages((prev) => prev.map((m) => (m === item ? { ...m, savedToProjects: true } : m)));

      await markMessageSavedInFirestore({
        conversationId: conversationIdRef.current,
        userId: uid,
        sourceParam,
        imageUrl,
      });

      showMsg("success", "Saved", "This design has been saved to Projects.");
    } catch (e) {
      console.warn("handleSaveOutline failed:", e?.message || e);
      showMsg("warning", "Save failed", "Please try again.");
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

    if (chatIdParam && chatIdParam !== "new") conversationIdRef.current = chatIdParam;

    return () => {
      try {
        historyUnsubRef.current?.();
      } catch {}
      historyUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sessionId, setSessionId] = useState(null);

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

          const furnitureMatchesAll = canShowPremiumNow ? rawFurniture.map(normalizeFurnitureItem) : [];

          const layoutSuggestionsAll = canShowPremiumNow
            ? Array.isArray(m.layoutSuggestions)
              ? m.layoutSuggestions
              : Array.isArray(m.layout_suggestions)
              ? m.layout_suggestions
              : Array.isArray(m.layout)
              ? m.layout
              : []
            : [];

          const hasRef =
            !!safeFirestoreImage(m.inputImage) ||
            !!safeFirestoreImage(m.lastReferenceImage) ||
            !!safeFirestoreImage(m.lastReferenceImageUrl) ||
            false;

          const hasResult = !!safeFirestoreImage(m.image);

          const inferredMode =
            m.mode ||
            (hasRef ? MODE.CUSTOMIZE : hasResult ? MODE.DESIGN : null);

            const aiItem = {
              role: "ai",
              mode: inferredMode,
              explanation: m.explanation || "",
              tips: Array.isArray(m.tips) ? m.tips : [],
              palette: m.palette || null,
              layoutSuggestions: layoutSuggestionsAll,
              furnitureMatches: furnitureMatchesAll,
            
              // ✅ IMPORTANT: fallback so old records still show Original
              inputImage:
                m.inputImage ||
                m.lastReferenceImage ||
                m.lastReferenceImageUrl ||
                null,
            
              image: m.image || null,
              prompt: m.prompt || null,
              savedToProjects: m.savedToProjects === true,
            };
           // ✅ Update chain refs from Firestore message fields
const savedResult = safeFirestoreImage(m.image);
const savedOriginal =
  safeFirestoreImage(m.inputImage) ||
  safeFirestoreImage(m.lastReferenceImage) ||
  safeFirestoreImage(m.lastReferenceImageUrl) ||
  null;

// Prefer AI result as the chain base
if (isUsableImageRef(savedResult)) {
  setLastGeneratedImageUrl(savedResult);
  setChainReference(savedResult, { fromProject: true, kind: "ai" });
} else if (isUsableImageRef(savedOriginal)) {
  setLastReferenceImageUrl(savedOriginal);
  setChainReference(savedOriginal, { fromProject: true, kind: "ref" });
}
        
          return aiItem;
        });

        if (loaded.length > 0) {
          setMessages(loaded);
          setIsTyping(false);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
        }
      },
      (err) => console.warn("History load error:", err?.message || String(err))
    );

    return () => {
      try {
        historyUnsubRef.current?.();
      } catch {}
      historyUnsubRef.current = null;
    };
  }, [userId, chatIdParam, sourceParam]);

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
    } catch {
      setProLoaded(true);
      return false;
    }
  };

  // ------------------------------
  // Prompt validation helpers
  // ------------------------------
  const countAlphaNum = (s) =>
    (normalizePromptSvc(s).match(/[a-zA-Z0-9]/g) || []).length;

  const isOnlySymbolsOrEmoji = (s) => {
    const t = normalizePromptSvc(s);
    if (!t) return true;
    return countAlphaNum(t) === 0;
  };

  const isRepeatedCharSpam = (s) => /(.)\1{7,}/.test(normalizePromptSvc(s));
  const isRepeatedWordSpam = (s) =>
    /(\b\w+\b)(\s+\1){6,}/i.test(normalizePromptSvc(s));
  const hasTooManyLinks = (s) =>
    (normalizePromptSvc(s).match(/https?:\/\/\S+/gi) || []).length >= 3;

  const DESIGN_DOMAIN_TERMS = [
    "room","bedroom","living","livingroom","kitchen","dining","bathroom","toilet","office","studio",
    "hall","entry","apartment","condo","house","home","space","area","corner","design","redesign",
    "customize","layout","rearrange","arrange","move","position","place","fit","resize","scale",
    "renovate","remodel","organize","declutter","decorate","decor","style","theme","aesthetic",
    "improve","optimize","sofa","couch","chair","table","desk","bed","cabinet","shelf","shelves",
    "wardrobe","tv","tvstand","dresser","rug","curtain","blinds","lamp","lighting","mirror","plant",
    "plants","art","frame","color","palette","paint","white","black","gray","beige","brown","wood",
    "oak","walnut","marble","meter","meters","cm","mm","inch","inches","ft","feet","sqm","sqm2","m2",
    "ayos","ayusin","porma","disenyo","layout","lipat","ilipat","rearrange","decorate","tema","kulay",
  ];

  const STOPWORDS = new Set([
    "i","you","me","my","we","our","us","a","an","the","and","or","but","to","of","for","in","on","at",
    "with","is","are","was","were","be","been","it","this","that","these","those","as","from","by",
    "please","can","could","would","should","do","does","did","make","help",
  ]);

  const tokenizePrompt = (s) =>
    normalizePromptSvc(s)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);

  const hasDomainSignal = (tokens) => {
    let hits = 0;
    for (const t of tokens) {
      if (STOPWORDS.has(t)) continue;
      if (DESIGN_DOMAIN_TERMS.includes(t)) hits++;
      if (!DESIGN_DOMAIN_TERMS.includes(t) && DESIGN_DOMAIN_TERMS.some((k) => t.startsWith(k))) hits++;
      if (hits >= 1) return true;
    }
    return false;
  };

  const looksLikeGibberish = (tokens) => {
    if (!tokens.length) return true;
    const meaningful = tokens.filter((t) => !STOPWORDS.has(t));
    if (meaningful.length === 0) return true;

    const shortCount = meaningful.filter((t) => t.length <= 2).length;
    if (meaningful.length >= 4 && shortCount / meaningful.length > 0.6) return true;

    const noVowel = meaningful.filter((t) => !/[aeiou]/i.test(t) && t.length >= 3).length;
    if (meaningful.length >= 3 && noVowel / meaningful.length > 0.6) return true;

    const mixed = meaningful.filter((t) => /[a-z]/i.test(t) && /\d/.test(t)).length;
    if (meaningful.length >= 3 && mixed / meaningful.length > 0.6) return true;

    return false;
  };

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
      return {
        ok: false,
        cleaned,
        error: "Please type a clear request (not only symbols or emojis).",
      };
    }

    if (isRepeatedCharSpam(cleaned) || isRepeatedWordSpam(cleaned)) {
      return {
        ok: false,
        cleaned,
        error: "Your message looks repetitive. Please type a clearer request.",
      };
    }

    if (hasTooManyLinks(cleaned)) {
      return { ok: false, cleaned, error: "Please avoid sending many links. Summarize what you want instead." };
    }

    const tokens = tokenizePrompt(cleaned);

    if (cleaned.length < PROMPT_MIN) {
      if (!strict) {
        return {
          ok: true,
          cleaned,
          warn: "Please describe a room/space and what to change (layout, style, lighting, colors, etc.).",
        };
      }
      return {
        ok: false,
        cleaned,
        error: "Please describe a room/space and what to change (layout, style, lighting, colors, etc.).",
      };
    }

    const domainOk = hasDomainSignal(tokens);
    const gibberish = looksLikeGibberish(tokens);

    if (!domainOk || gibberish) {
      return {
        ok: false,
        cleaned,
        error:
          "Invalid request. Please type an interior design or room customization prompt (e.g., “Design a minimalist living room” or “Move the sofa for better flow”).",
      };
    }

    let warn = "";
    if (cleaned.length >= 350) warn = "Tip: Shorter prompts usually produce more accurate design results.";

    return { ok: true, cleaned, warn };
  };

  // ==============================
  // ✅ Prompt Filtration Engine
  // ==============================
  const getPromptSuggestions = (raw) => {
    const textRaw = normalizePromptSvc(raw || "");
    const text = textRaw.toLowerCase().trim();
    if (!text) return [];
    if (text.length > 220) return [];

    const phraseTail = text.replace(/\s+/g, " ");
    const tailTriggers = ["make me a", "design a", "create a", "generate a", "design an", "create an", "generate an"];
    if (tailTriggers.some((t) => phraseTail.endsWith(t))) return PROMPT_FILTERS.rooms.slice(0, 6);

    if (
      PROMPT_FILTERS.rooms.some((r) => phraseTail.includes(r)) ||
      phraseTail.includes("bedroom") ||
      phraseTail.includes("living") ||
      phraseTail.includes("kitchen") ||
      phraseTail.includes("bathroom")
    ) {
      return PROMPT_FILTERS.styles.slice(0, 6);
    }

    if (phraseTail.startsWith("move") || phraseTail.includes(" move ") || phraseTail.includes("rearrange")) {
      return PROMPT_FILTERS.actions.slice(0, 6);
    }

    if (phraseTail.includes("more ") || phraseTail.includes("make it ") || phraseTail.includes("feel ")) {
      return PROMPT_FILTERS.tones.slice(0, 6);
    }

    const words = phraseTail.split(/\s+/).filter(Boolean);
    const last = words[words.length - 1] || "";

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
    const matches = uniq.filter((s) => {
      const sl = s.toLowerCase();
      if (!last) return false;
      return sl.startsWith(last) || sl.startsWith(`${last} `);
    });

    if (matches.length === 0) {
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
    const last = words[words.length - 1] || "";
    const sug = String(suggestion || "").trim();
    if (!sug) return trimmed;

    const lastLower = last.toLowerCase();
    if (lastLower && sug.toLowerCase().startsWith(lastLower) && lastLower !== sug.toLowerCase()) {
      words[words.length - 1] = sug;
      return words.join(" ") + " ";
    }

    return trimmed + " " + sug + " ";
  };

  const handlePromptFiltersSubmit = (promptText, meta) => {
    const p = String(promptText || "").trim();
    if (!p) return;

    setInput(p);

    const forced = String(meta?.mode || "").toLowerCase() === "design";
    sendMessage(p, { forceMode: forced ? MODE.DESIGN : null });
  };

  // ==============================
  // ✅ SEND MESSAGE (UPDATED with Fix 2)
  // ==============================
  const sendMessage = async (text = input, opts = {}) => {
    const v = validatePromptUI(text, { strict: true });
    const clean = v.cleaned;

    if (!v.ok) {
      setPromptError(v.error || "Invalid prompt.");
      setPromptWarn("");

      if (!isHistoryRealtimeActive()) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            explanation: v.error || "Invalid prompt.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
          },
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
        } catch {}
      }

      if (isLocked) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            explanation: `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT}). Upgrade to Pro to continue chatting with unlimited generations.`,
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

      const normalizedMsg = normalizeText(clean);
      const explicitDesign = DESIGN_TRIGGERS.some((k) => normalizedMsg.includes(k));
      const explicitCustomize = CUSTOMIZE_TRIGGERS.some((k) => normalizedMsg.includes(k));

      let desiredMode = detectModeFromMessage(clean);
      if (explicitDesign) desiredMode = MODE.DESIGN;
      if (explicitCustomize) desiredMode = MODE.CUSTOMIZE;

      if (opts?.forceMode === MODE.DESIGN) desiredMode = MODE.DESIGN;

      // If user is on customize tab, default to customize
      if (tab === "customize") {
        if (!explicitDesign && !explicitCustomize) desiredMode = MODE.CUSTOMIZE;
      }

      // If user uploaded something, it must be customize (because it’s a reference)
      const hasUploadThisTurn = !!uploadedImage || !!uploadedImageBase64;
      if (hasUploadThisTurn) desiredMode = MODE.CUSTOMIZE;

      // If locked-from-project and user tries to upload new, block it
      if (desiredMode === MODE.CUSTOMIZE && lockedFromProjectRef.current && hasUploadThisTurn) {
        setUploadedImage(null);
        setUploadedImageBase64(null);
        showMsg(
          "info",
          "Reference locked",
          "This session came from Projects. Upload is blocked, but you can continue customizing (chain updates are allowed)."
        );
      }

      // ✅ FIX 2: If Customize and base64 is missing/too big, upload first and use HTTPS as requestOriginal
      let uploadedRefUrlForThisTurn = null;

      if (desiredMode === MODE.CUSTOMIZE && uploadedImage && !uploadedImageBase64) {
        try {
          uploadedRefUrlForThisTurn = await uploadUserImageForHistory(uploadedImage, clean);

          if (uploadedRefUrlForThisTurn) {
            // Replace the user bubble image from file:// to https://
            setMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                const m = next[i];
                if (m?.role === "user" && String(m?.image || "") === String(uploadedImage)) {
                  next[i] = { ...m, image: uploadedRefUrlForThisTurn };
                  break;
                }
              }
              return next;
            });

            setLastReferenceImageUrl(uploadedRefUrlForThisTurn);
          }
        } catch {}
      }

      // ✅ base64 immediate (this-turn upload) for customize (optimized)
      const base64Immediate =
        desiredMode === MODE.CUSTOMIZE &&
        typeof uploadedImageBase64 === "string" &&
        uploadedImageBase64.startsWith("data:image/")
          ? uploadedImageBase64
          : null;

          const requestOriginal =
          desiredMode === MODE.CUSTOMIZE
            ? (uploadedRefUrlForThisTurn || pickChainBase({ base64Immediate }))
            : pickDesignBase(); // ✅ FIX: never uses last reference

      if (desiredMode === MODE.CUSTOMIZE && !isUsableImageRef(requestOriginal)) {
        if (!realtime) {
          setMessages((prev) => [
            ...prev,
            { role: "user", text: clean },
            {
              role: "ai",
              explanation:
                "Customization needs a room reference image. Please upload/capture a room photo first.",
              tips: [],
              layoutSuggestions: [],
              furnitureMatches: [],
            },
          ]);
        }
        setInput("");
        setIsTyping(false);
        setPromptSuggestions([]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
        return;
      }

      // ✅ Save user message to Firestore (store HTTPS ref when available)
      try {
        const cid = conversationIdRef.current || (await ensureConversationOnce(clean));
        const imgForUserMsg =
          safeFirestoreImage(uploadedRefUrlForThisTurn) ||
          safeFirestoreImage(uploadedImage) ||
          null;

        await saveAIUserMessage(cid, {
          text: clean,
          image: imgForUserMsg,
        });
      } catch (e) {
        console.warn("saveAIUserMessage failed:", e?.message || e);
      }

      if (!realtime) {
        setMessages((prev) => [
          ...prev,
          { role: "user", text: clean, image: uploadedRefUrlForThisTurn || uploadedImage || null },
        ]);
      }

      setInput("");
      setIsTyping(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

      // ✅ Background upload of USER ORIGINAL (history only)
      let bgUploadPromise = null;
      if (
        desiredMode === MODE.CUSTOMIZE &&
        !!uploadedImage &&
        !lockedFromProjectRef.current &&
        !uploadedRefUrlForThisTurn // already uploaded foreground
      ) {
        bgUploadPromise = uploadUserImageForHistory(uploadedImage, clean)
          .then((publicUrl) => {
            if (publicUrl) {
              setMessages((prev) => {
                const target = String(uploadedImage || "").trim();
                if (!target) return prev;

                for (let i = prev.length - 1; i >= 0; i--) {
                  const m = prev[i];
                  if (m?.role === "user" && typeof m?.image === "string" && m.image.trim() === target) {
                    const next = [...prev];
                    next[i] = { ...m, image: publicUrl };
                    return next;
                  }
                }
                return prev;
              });

              setLastReferenceImageUrl(publicUrl);
            }
            return publicUrl || null;
          })
          .catch(() => null);
      }

      // ✅ call AI
      const result = await callAIDesignAPI({
        apiKey: OPENAI_API_KEY,
        textModel: OPENAI_TEXT_MODEL,
        message: clean,
        mode: desiredMode,
        image: requestOriginal,
        sessionId,
        isPro: proNow,
        useOpenAIForCustomize: true,
        imageModel: OPENAI_IMAGE_MODEL,
        imageSize: OPENAI_IMAGE_SIZE,
      });

      if (result?.sessionId) setSessionId(result.sessionId);

      // handle blocked
      if (result?.blockedReason) {
        setIsTyping(false);
        setUploadedImage(null);
        setUploadedImageBase64(null);

        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            mode: desiredMode,
            explanation:
              "Generation failed.\n\n" +
              `Reason: ${String(result.blockedReason || "UNKNOWN")}\n` +
              (result?.errorDetail ? `Details: ${String(result.errorDetail)}\n` : "") +
              "Try again or check internet / API key / model access.",
            tips: [],
            layoutSuggestions: [],
            furnitureMatches: [],
            palette: null,
            image: null,
            inputImage: requestOriginal || null,
          },
        ]);

        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
        return;
      }

      // ✅ increment daily count AFTER success
      let updatedCount = dailyGenCount;
      if (!proNow) {
        const next = await incrementDailyCount(userId, dailyGenCount);
        setDailyGenDateKey(getLocalDateKey());
        setDailyGenCount(next);
        updatedCount = next;

        if (!realtime && next === WARNING_AT) {
          const remaining = Math.max(DAILY_LIMIT - next, 0);
          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              explanation: `Notice: You have ${remaining} generation${remaining === 1 ? "" : "s"} left today.`,
              tips: [],
              layoutSuggestions: [],
              furnitureMatches: [],
            },
          ]);
        }
      }

      // clear attachment after sending
      setUploadedImage(null);
      setUploadedImageBase64(null);
      setIsTyping(false);

      const mergedPayload = mergeBackendPayload(result);

      const {
        explanation,
        tips,
        palette,
        layoutSuggestions: backendLayoutSuggestions,
        furnitureMatches: furnitureMatchesAll,
      } = applyPremiumGatingToPayload({ mergedPayload, proNow });

      // ✅ detect image
      const detectedImage =
        extractAnyImage(result?.image) ||
        extractAnyImage(result) ||
        extractAnyImage(mergedPayload) ||
        null;

      const uiResultImage =
        normalizeBackendImageToUri?.(detectedImage) ||
        normalizeAnyImageToUri(detectedImage) ||
        null;
// ✅ Only CUSTOMIZE should store/show Original.
// DESIGN should not show Original even if it used a base image internally.
const firestoreInputImageUrl =
  desiredMode === MODE.CUSTOMIZE && isUsableImageRef(requestOriginal)
    ? requestOriginal
    : null;

      // push AI message to UI:
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

      // ✅ Upload AI result -> HTTPS if needed
      let uploadPromise = Promise.resolve(null);

      if (uiResultImage) {
        const isHttp =
          uiResultImage.startsWith("http://") || uiResultImage.startsWith("https://");

        if (isHttp) uploadPromise = Promise.resolve(uiResultImage);
        else {
          uploadPromise = uploadAIResultForHistory(uiResultImage, clean)
            .then((u) => u || null)
            .catch(() => null);
        }
      }

      const publicUrl = await uploadPromise;

      // ✅ If we got https result, swap in UI & set chain base to RESULT
      const finalResultUrl =
        (publicUrl && (publicUrl.startsWith("http://") || publicUrl.startsWith("https://")))
          ? publicUrl
          : uiResultImage;

      if (isUsableImageRef(finalResultUrl)) {
        setLastGeneratedImageUrl(finalResultUrl);

        // ✅ After any successful generation, chain base becomes AI RESULT.
        setChainReference(finalResultUrl, { fromProject: lockedFromProjectRef.current, kind: "ai" });
        // update last AI message image if it was base64
        if (!isHistoryRealtimeActive() && publicUrl) {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i]?.role === "ai" && next[i]?.image === uiResultImage) {
                next[i] = { ...next[i], image: publicUrl };
                break;
              }
            }
            return next;
          });
        }
      }

      // wait user bg upload just for saving reference in firestore (history)
      let uploadedRefUrl = uploadedRefUrlForThisTurn || null;
      if (!uploadedRefUrl && bgUploadPromise) {
        try {
          uploadedRefUrl = await bgUploadPromise;
        } catch {}
      }

      // ✅ Save AI response to Firestore
      try {
        const cid = conversationIdRef.current || (await ensureConversationOnce(clean));

        const imageToSave =
          safeFirestoreImage(finalResultUrl) || safeFirestoreImage(uiResultImage) || null;

        const refToStore =
          safeFirestoreImage(uploadedRefUrl) ||
          safeFirestoreImage(firestoreInputImageUrl) ||
          null;

          await saveAIResponse(cid, {
            mode: desiredMode,
            explanation,
            tips,
            palette,
            layoutSuggestions: proNow ? backendLayoutSuggestions : [],
            furnitureMatches: proNow ? furnitureMatchesAll : [],
            image: imageToSave,
            sessionId: result?.sessionId || sessionId || null,
          
            // ✅ IMPORTANT: store BOTH for compatibility
            inputImage: desiredMode === MODE.CUSTOMIZE ? refToStore : null,
            lastReferenceImage: desiredMode === MODE.CUSTOMIZE ? refToStore : null,
          
            prompt: clean,
            savedToProjects: false,
          });
      } catch (e) {
        console.warn("saveAIResponse failed:", e?.message || e);
      }

      const nextCount = !proNow ? updatedCount : dailyGenCount;
      if (!proNow && nextCount >= DAILY_LIMIT) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            explanation: `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT}). Upgrade to Pro to continue chatting with unlimited generations.`,
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
          explanation:
            "Unable to process your request at the moment. Please try again.",
          tips: [],
          layoutSuggestions: [],
          furnitureMatches: [],
        },
      ]);
    } finally {
      sendingRef.current = false;
    }
  };

  // ==============================
  // ✅ image picking (UPDATED with Fix 1)
  // ==============================
  const pickImage = async () => {
    if (isLocked) return;

    if (lockedFromProjectRef.current && tab === "customize") {
      showMsg(
        "info",
        "Reference locked",
        "This session came from Projects. Upload is blocked, but you can continue customizing (chain updates are allowed)."
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    // ✅ base64=false (we generate optimized base64 via ImageManipulator)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: false,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const originalUri = asset.uri;

      const optimized = await downscaleToBase64(originalUri);

      setUploadedImage(optimized.uri);
      setUploadedImageBase64(optimized.base64);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const takePhoto = async () => {
    if (isLocked) return;

    if (lockedFromProjectRef.current && tab === "customize") {
      showMsg(
        "info",
        "Reference locked",
        "This session came from Projects. Upload is blocked, but you can continue customizing (chain updates are allowed)."
      );
      return;
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      base64: false,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const originalUri = asset.uri;

      const optimized = await downscaleToBase64(originalUri);

      setUploadedImage(optimized.uri);
      setUploadedImageBase64(optimized.base64);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const clearAttachment = () => {
    setUploadedImage(null);
    setUploadedImageBase64(null);
  };

  const renderSaveButton = (item) => {
    const hasImage = !!safeFirestoreImage(item?.image);
    if (!hasImage) return null;

    return (
      <View style={styles.imageActionRow}>
        <TouchableOpacity
          onPress={() => handleSaveOutline(item)}
          disabled={item?.savedToProjects === true}
          style={[
            styles.savedIconBtn,
            item?.savedToProjects === true && { opacity: 0.6 },
          ]}
        >
          <Feather name={"bookmark"} size={16} color="#0F172A" />
          <Text style={styles.savedIconText}>
            {item?.savedToProjects === true ? "Saved" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMessage = ({ item }) => {
    const isAi = item.role === "ai";
    const paletteColors = Array.isArray(item?.palette?.colors) ? item.palette.colors : [];
    const layoutSuggestions = Array.isArray(item?.layoutSuggestions) ? item.layoutSuggestions : [];
    const furnitureMatches = Array.isArray(item?.furnitureMatches) ? item.furnitureMatches : [];

    // infer old
    const isDesignLike =
      item?.mode === MODE.DESIGN ||
      (!item?.mode && !!item?.image && !safeFirestoreImage(item?.inputImage));

// ✅ Original should appear ONLY for CUSTOMIZE mode
const showOriginal =
  isAi &&
  item?.mode === MODE.CUSTOMIZE &&
  !!item?.inputImage &&
  isUsableImageRef(item.inputImage);    
  const showResult = isAi && !!item?.image && isUsableImageRef(item.image);

    const shouldShowCompare =
      isAi &&
      (item.mode === MODE.CUSTOMIZE || isDesignLike) &&
      (showOriginal || showResult);

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

          {shouldShowCompare && (
            <View style={styles.imageCompareWrap}>
              {showOriginal && (
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

              {showResult && (
                <View style={styles.imageBlock}>
                  <Text style={styles.imageLabel}>Result</Text>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.previewImage}
                    onError={(e) =>
                      console.log("❌ Result image load failed:", item.image, e?.nativeEvent)
                    }
                  />
                  {renderSaveButton(item)}
                </View>
              )}
            </View>
          )}

          {isAi && item.mode && (
            <View style={{ marginBottom: 8, alignSelf: "flex-start" }}>
              <Text style={{ fontSize: 11, fontWeight: "500", color: "#64748B" }}>
                Mode: {item.mode === MODE.CUSTOMIZE ? "Customize" : "Design"}
              </Text>
            </View>
          )}

          {isAi && paletteColors.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Color Palette</Text>
                {!!item?.palette?.name && (
                  <Text style={styles.sectionMeta}>{item.palette.name}</Text>
                )}
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
                  {!!f?.placement && (
                    <Text style={styles.furniturePlacement}>{f.placement}</Text>
                  )}

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

  const quickPrompts = useMemo(
    () => [
      "Customize this room using the same layout but make it more modern.",
      "Customize this space: improve lighting and make it brighter.",
      "Customize the layout for better flow and add more storage.",
      "Customize: make it minimalist with neutral palette (white/gray/wood).",
      "Customize: rearrange furniture to make the room feel bigger.",
      "Customize: add cozy decor and warm lighting.",
      "Customize: refine color palette and add accent wall.",
      "Customize: make it Scandinavian style, airy and clean.",
      "Customize: optimize space usage and remove clutter.",
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

  const chipsToShow = uploadedImage ? imageQuickPrompts : quickPrompts;

  const sendEnabled = useMemo(() => {
    if (isLocked) return false;
    if (isTyping) return false;
    return validatePromptUI(input, { strict: true }).ok;
  }, [isLocked, isTyping, input]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <CenterMessageModal
        visible={msgModal.visible}
        type={msgModal.type}
        title={msgModal.title}
        message={msgModal.message}
        onClose={hideMsg}
      />

      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />

      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color="#334155" />
          </TouchableOpacity>

          <LinearGradient colors={["#0F172A", "#334155"]} style={styles.headerLogoBox}>
            <MaterialCommunityIcons name="robot" size={20} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{chatTitle}</Text>

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

        {!isLocked && (
          <PromptFilters
            mode="design"
            onSubmit={(builtPrompt, meta) => handlePromptFiltersSubmit(builtPrompt, meta)}
          />
        )}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={styles.scrollArea}
          />

          {isTyping && (
            <View style={[styles.typingWrap, { bottom: (keyboardHeight || 0) + 190 }]}>
              <View style={styles.typingBubble}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <Text style={styles.typingText}>Generating…</Text>
                </View>

                <Text style={styles.typingSubText}>Please wait… crafting your design.</Text>
                <View style={styles.typingBarTrack}>
                  <View style={styles.typingBarFill} />
                </View>
              </View>
            </View>
          )}

          <View
            style={[
              styles.footerDock,
              {
                bottom: keyboardHeight > 0 ? keyboardHeight : 0,
                paddingBottom: Platform.OS === "android" ? 5 : 10,
              },
            ]}
          >
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
                      Daily limit: {Math.min(dailyGenCount, DAILY_LIMIT)}/{DAILY_LIMIT} • Unlimited generations • Furniture Matches • Layout Suggestions
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color="#0F172A" />
              </TouchableOpacity>
            )}

            {!isLocked && (
              <View style={styles.chipsWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {chipsToShow.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={styles.chip}
                      onPress={() => {
                        const vv = validatePromptUI(c, { strict: true });
                        setPromptError(vv.ok ? "" : vv.error || "");
                        setPromptWarn(vv.warn || "");
                        if (vv.ok) sendMessage(vv.cleaned);
                      }}
                    >
                      <Text style={styles.chipText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {!!promptSuggestions.length && !isLocked && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {promptSuggestions.map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setInput((prev) => applySuggestion(prev, s))}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: "#E9EEF7",
                        marginRight: 8,
                        borderWidth: 1,
                        borderColor: "rgba(15,23,42,0.08)",
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "900", color: "#0F172A" }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {!!uploadedImage && (
              <View style={styles.attachmentBar}>
                <View style={styles.attachmentLeft}>
                  <Image source={{ uri: uploadedImage }} style={styles.attachmentThumb} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.attachmentTitle} numberOfLines={1}>Reference ready</Text>
                    <Text style={styles.attachmentSub} numberOfLines={1}>
                      {lockedFromProjectRef.current
                        ? "Reference is locked (from Projects)"
                        : "This will be used as Original for Customize"}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity onPress={clearAttachment} style={styles.attachmentClearBtn}>
                  <Feather name="x" size={16} color="#0F172A" />
                </TouchableOpacity>
              </View>
            )}

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
                    const vv = validatePromptUI(t, { strict: false });
                    setPromptError(vv.ok ? "" : vv.error || "");
                    setPromptWarn(vv.warn || "");
                    setPromptSuggestions(getPromptSuggestions(t));
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

            <Text style={styles.accuracyNote}>
              Note: AI-generated designs are suggestions only—some results may not be fully accurate.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

// ✅ KEEP YOUR STYLES (UNCHANGED)
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, backgroundColor: "#F1F5FF" },
  header: {
    paddingHorizontal: 14,
    paddingTop: 25,
    paddingBottom: 14,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerLogoBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  headerSubRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },
  statusText: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  sessionText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 6,
    maxWidth: 160,
  },
  headerRight: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },

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
  userText: { color: "#FFFFFF", fontSize: 14, fontWeight: "400", lineHeight: 20 },

  previewImage: { width: 220, height: 160, borderRadius: 12, backgroundColor: "#E2E8F0" },
  imageCompareWrap: { gap: 10, marginBottom: 10 },
  imageBlock: { gap: 6 },
  imageLabel: { fontSize: 11, fontWeight: "500", color: "#64748B" },

  section: { marginTop: 8 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: "500", color: "#0F172A" },
  sectionMeta: { fontSize: 11, fontWeight: "500", color: "#64748B" },
  paragraph: { fontSize: 13, color: "#0F172A", lineHeight: 20, fontWeight: "400" },

  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
    paddingRight: 8,
  },
  tipBullet: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0EA5E9",
    lineHeight: 20,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    color: "#0F172A",
    lineHeight: 20,
    fontWeight: "4500",
    opacity: 0.92,
  },

  paletteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 2,
    columnGap: 1,
  },
  paletteCard: { width: "32%", alignItems: "center", padding: 5 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  swatchLabel: { fontSize: 11, fontWeight: "500", color: "#0F172A", textAlign: "center" },
  swatchHex: { fontSize: 9, fontWeight: "400", color: "#64748B", marginTop: 1, textAlign: "center" },

  furnitureCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  furnitureName: { fontSize: 13, fontWeight: "500", color: "#0F172A" },
  furniturePlacement: { fontSize: 12, fontWeight: "500", color: "#475569", marginTop: 6 },
  furnitureLinksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  furniturePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#E2E8F0" },
  furniturePillText: { fontSize: 11, fontWeight: "500", color: "#0F172A" },

  typingWrap: { position: "absolute", left: 14, right: 14, zIndex: 50 },
  typingBubble: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  typingDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: "#94A3B8" },
  typingText: { marginLeft: 6, fontSize: 11, fontWeight: "500", color: "#64748B" },
  typingSubText: { marginTop: 6, fontSize: 11, fontWeight: "500", color: "#64748B" },
  typingBarTrack: { marginTop: 8, height: 6, borderRadius: 999, backgroundColor: "#E2E8F0", overflow: "hidden" },
  typingBarFill: { width: "55%", height: "100%", borderRadius: 999, backgroundColor: "#38BDF8" },

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
  upgradeTitle: { fontSize: 13, fontWeight: "500", color: "#0F172A" },
  upgradeSub: { fontSize: 11, fontWeight: "500", color: "#0F172A", marginTop: 2, opacity: 0.9 },

  chipsWrap: { paddingBottom: 1, paddingTop: 10 },
  chipsRow: { paddingHorizontal: 14, gap: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },
  chipText: { fontSize: 12, fontWeight: "500", color: "#0F172A" },

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
  attachmentTitle: { fontSize: 12, fontWeight: "500", color: "#0F172A" },
  attachmentSub: { fontSize: 11, fontWeight: "500", color: "#64748B", marginTop: 2 },
  attachmentClearBtn: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E2E8F0" },

  promptFeedbackWrap: { paddingHorizontal: 14, paddingBottom: 8 },
  promptFeedbackCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, borderWidth: 1 },
  promptErrorCard: { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" },
  promptWarnCard: { backgroundColor: "#E2E8F0", borderColor: "#CBD5E1" },
  promptErrorText: { flex: 1, fontSize: 12, fontWeight: "500", color: "#991B1B" },
  promptWarnText: { flex: 1, fontSize: 12, fontWeight: "500", color: "#0F172A" },

  imageActionRow: { marginTop: 8, flexDirection: "row", justifyContent: "flex-end" },
  savedIconBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },
  savedIconText: { fontSize: 11, fontWeight: "500", color: "#0F172A" },

  footerDock: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#F8FAFC", borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingBottom: 12 },

  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 0, backgroundColor: "#F8FAFC" },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },

  textBox: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 5, minHeight: 34, justifyContent: "center" },
  textInput: { fontSize: 13, color: "#0F172A", fontWeight: "400", lineHeight: 16, minHeight: 18, maxHeight: 44, paddingTop: 0, paddingBottom: 0 },
  counterText: { alignSelf: "flex-end", marginTop: 2, fontSize: 10, fontWeight: "400", color: "#94A3B8" },

  sendBtn: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#0EA5E9" },

  accuracyNote: {
    paddingHorizontal: 14,
    paddingTop: 8,
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 320,
  },
});