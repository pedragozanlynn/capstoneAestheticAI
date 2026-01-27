// AIDesignChat.jsx
// ✅ FIXED: Customize must ALWAYS edit the SAME room reference (no “ibang room”)
// ✅ UPDATE:
// ✅ After CUSTOMIZE, when user asks to DESIGN, it will switch to DESIGN and clear refs
// ✅ UPDATE (YOUR REQUEST NOW):
// ✅ REMOVE AUTO-SAVE to Projects
// ✅ ONLY MANUAL SAVE (when user taps Save)
// ✅ When saving to Projects, include: image, inputImage, prompt, explanation, mode, createdAt
// ✅ Add success/error messages after save attempt (✅ USING CenterMessageModal)

import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";

// ✅ Conversation persistence
import { ensureAIConversation, saveAIResponse, saveAIUserMessage } from "../../services/ai/aiConversationService";

// ✅ Backend AI call + payload utilities
import { callAIDesignAPI, mergeBackendPayload, normalizeBackendImageToUri } from "../../services/ai/openaiAIDesignService";

// ✅ Premium gating + mode detection
import {
  DESIGN_TRIGGERS,
  MODE,
  applyPremiumGatingToPayload,
  detectModeFromMessage,
  normalizeFurnitureItem,
  safeFirestoreImage
} from "../../services/ai/premiumGateService";

// ✅ Daily limit
import { getLocalDateKey, incrementDailyCount, loadDailyCounter } from "../../services/ai/dailyLimitService";

// ✅ Image upload + Projects save moved to services
import { uploadAIResultForHistory, uploadUserImageForHistory } from "../../services/ai/chatImageService";
import { saveResultToProjects } from "../../services/ai/projectsService";
import PromptFilters from "../components/PromptFilters";

// ✅ Center message modal (YOUR COMPONENT)
import CenterMessageModal from "../components/CenterMessageModal";

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

  const params = useLocalSearchParams();
  const chatIdParam = typeof params?.chatId === "string" ? params.chatId : "new";
  const sourceParam = typeof params?.source === "string" ? params.source : "root";
  const titleParam = typeof params?.title === "string" ? params.title : "";
  const sessionIdParam = typeof params?.sessionId === "string" ? params.sessionId : "";

  const HEADER_DARK = "#01579B";

  const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || "";
  const OPENAI_TEXT_MODEL = "gpt-5-mini";

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

  const [input, setInput] = useState("");

  const [isTyping, setIsTyping] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // ✅ references (URLs)
  const [lastReferenceImageUrl, setLastReferenceImageUrl] = useState(null); // ORIGINAL ref
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState(null); // LAST AI result

  // ==============================
  // ✅ CenterMessageModal state
  // ==============================
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info"); // "info" | "success" | "error"
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgAutoHideMs, setMsgAutoHideMs] = useState(1800);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1800) => {
    setMsgType(type);
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgAutoHideMs(Number(autoHideMs) || 1800);
    setMsgVisible(true);
  };

  const closeMessage = () => setMsgVisible(false);

  const showSaveResult = (ok, msg) => {
    showMessage(
      ok ? "success" : "error",
      ok ? "Saved" : "Save failed",
      msg || (ok ? "Saved to Projects." : "Unable to save to Projects."),
      ok ? 1200 : 2000
    );
  };

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
      if (typeof inputImage === "string" && inputImage.startsWith("http")) {
        setLastReferenceImageUrl(inputImage);
      }
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

  const getBestReferenceForCustomize = () => {
    // ✅ CHAIN EDITING:
    // Prefer last AI result first (so customize edits the latest generated image),
    // fallback to original reference only if no generated exists.
    return lastGeneratedImageUrl || lastReferenceImageUrl || null;
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

          const aiItem = {
            role: "ai",
            _docId: docSnap.id,
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
            projectId: m.projectId || null,
          };

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

    if (savedOriginal && (savedOriginal.startsWith("http://") || savedOriginal.startsWith("https://"))) {
      setLastReferenceImageUrl(savedOriginal);
    }
    if (savedResult && (savedResult.startsWith("http://") || savedResult.startsWith("https://"))) {
      setLastGeneratedImageUrl(savedResult);
    }

    setMessages((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];

      if (savedPrompt) next.push({ role: "user", text: savedPrompt, image: null });

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
      const uid = userId || auth?.currentUser?.uid;
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

 // ==============================
// ✅ sendMessage (COMPLETE)
// ==============================
const sendMessage = async (text = input, opts = {}) => {
  const raw = String(text ?? "").trim();
  if (!raw) return;

  // lock check
  if (isLocked) {
    showMessage("error", "Limit reached", "Upgrade to Pro to continue.", 2000);
    return;
  }

  if (sendingRef.current) return;
  sendingRef.current = true;

  const realtime = isHistoryRealtimeActive();

  try {
    setIsTyping(true);

    // Ensure pro flag is resolved at least once
    let proNow = isProRef.current === true;
    if (!proLoaded) {
      try {
        proNow = (await ensureProResolvedOnce()) === true;
      } catch {}
    }

    // ✅ DAILY LIMIT (only for free users)
    if (!proNow) {
      const nowKey = getLocalDateKey();
      if (dailyGenDateKey !== nowKey) {
        setDailyGenDateKey(nowKey);
        setDailyGenCount(0);
      }

      if (dailyGenCount >= DAILY_LIMIT) {
        setIsTyping(false);
        showMessage("error", "Daily limit reached", "Try again tomorrow or upgrade to Pro.", 2200);
        return;
      }

      if (dailyGenCount === WARNING_AT) {
        showMessage(
          "info",
          "Heads up",
          `You’re at ${WARNING_AT}/${DAILY_LIMIT} generations today.`,
          1800
        );
      }
    }

    // ✅ Determine intent/mode
    const forcedMode = opts?.forceMode || null;
    const detected = detectModeFromMessage(raw);

    const userExplicitDesign =
      forcedMode === MODE.DESIGN ||
      DESIGN_TRIGGERS?.some((t) => raw.toLowerCase().includes(String(t).toLowerCase()));

    // ✅ DESIGN request must clear refs (per your spec)
    if (userExplicitDesign) {
      setLastReferenceImageUrl(null);
      setLastGeneratedImageUrl(null);
      setUploadedImage(null);
      setRefImageSize(null);
      refImageSizeRef.current = null;
    }

    // Decide final mode:
    // - explicit DESIGN => DESIGN
    // - otherwise, if any reference exists (uploaded or stored), CUSTOMIZE
    // - else DESIGN
    const hasAnyRef =
      !!uploadedImage || !!lastReferenceImageUrl || !!lastGeneratedImageUrl;

    const finalMode =
      userExplicitDesign ? MODE.DESIGN : hasAnyRef ? MODE.CUSTOMIZE : MODE.DESIGN;

    // ✅ Prepare conversation id (new chat or existing)
    const cid =
      conversationIdRef.current ||
      (await ensureConversationOnce(raw));

    // ✅ Build reference image for customize
    // RULE: "Customize must ALWAYS edit SAME room reference"
    // - If user attached NEW image now, that becomes the ORIGINAL reference
    // - Otherwise: use ORIGINAL reference first; fallback to lastGenerated only if no original exists
    let localRefUri = null;
    if (finalMode === MODE.CUSTOMIZE) {
      localRefUri = uploadedImage || null;
      if (!localRefUri) {
        localRefUri = lastReferenceImageUrl || lastGeneratedImageUrl || null;
      }
    }

    // ✅ Upload user reference (if local file) for history + backend usage
    let refHttpUrl = null;
    if (finalMode === MODE.CUSTOMIZE && localRefUri) {
      if (/^https?:\/\//i.test(localRefUri)) {
        refHttpUrl = localRefUri;
      } else {
        // local file uri -> upload
        const up = await uploadUserImageForHistory({
          uid: auth?.currentUser?.uid || userId,
          conversationId: cid,
          uri: localRefUri,
        });
        refHttpUrl = up?.url || up || null;
      }
    }

    // ✅ Persist user message (best effort)
    if (!realtime) {
      setMessages((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        { role: "user", text: raw, image: localRefUri && !/^https?:\/\//i.test(localRefUri) ? localRefUri : null },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }

    try {
      await saveAIUserMessage({
        conversationId: cid,
        text: raw,
        image: refHttpUrl || null,
        mode: finalMode,
      });
    } catch (eSaveUser) {
      // non-blocking
      console.warn("⚠️ saveAIUserMessage failed:", eSaveUser?.message || eSaveUser);
    }

    // ✅ Build payload for backend
    let payload = {
      prompt: raw,
      mode: finalMode,
      // image only for customize
      image: finalMode === MODE.CUSTOMIZE ? refHttpUrl : null,
      // optional size hint
      refImageSize: refImageSizeRef.current || null,
    };

    payload = applyPremiumGatingToPayload(payload, { isPro: proNow });

    // ✅ Call AI backend
    const result = await callAIDesignAPI({
      payload,
      openaiApiKey: OPENAI_API_KEY,
      openaiTextModel: OPENAI_TEXT_MODEL,
      geminiApiKey: GEMINI_API_KEY,
      geminiImageModel: GEMINI_IMAGE_MODEL,
    });

    // ✅ Normalize/merge backend response
    const merged = mergeBackendPayload(result);

    const aiImageUri = normalizeBackendImageToUri(merged?.image);
    if (!aiImageUri) throw new Error("AI did not return an image.");

    // ✅ Upload AI image for history if needed (store http url)
    let aiHttpUrl = null;
    if (/^https?:\/\//i.test(aiImageUri)) {
      aiHttpUrl = aiImageUri;
    } else {
      const up2 = await uploadAIResultForHistory({
        uid: auth?.currentUser?.uid || userId,
        conversationId: cid,
        uri: aiImageUri, // can be data:image/...
      });
      aiHttpUrl = up2?.url || up2 || null;
    }

    if (!aiHttpUrl) throw new Error("Failed to store AI image.");

    // ✅ Update reference trackers
    setLastGeneratedImageUrl(aiHttpUrl);

    // IMPORTANT: never override ORIGINAL reference with AI result
    // If user uploaded a new reference now, lock it as ORIGINAL
    if (finalMode === MODE.CUSTOMIZE) {
      if (refHttpUrl && /^https?:\/\//i.test(refHttpUrl)) {
        setLastReferenceImageUrl((prev) => prev || refHttpUrl);
      }
    }

    // ✅ Save AI response into conversation
    const aiDoc = {
      conversationId: cid,
      mode: finalMode,
      prompt: raw,
      explanation: String(merged?.explanation || "").trim(),
      tips: Array.isArray(merged?.tips) ? merged.tips : [],
      palette: merged?.palette || null,
      layoutSuggestions: Array.isArray(merged?.layoutSuggestions) ? merged.layoutSuggestions : [],
      furnitureMatches: Array.isArray(merged?.furnitureMatches) ? merged.furnitureMatches : [],
      inputImage: finalMode === MODE.CUSTOMIZE ? safeFirestoreImage(refHttpUrl) : null,
      image: safeFirestoreImage(aiHttpUrl),
      savedToProjects: false,
      projectId: null,
    };

    let savedDocId = null;
    try {
      const saved = await saveAIResponse(aiDoc);
      savedDocId = saved?.id || saved?.docId || null;
    } catch (eSaveAi) {
      console.warn("⚠️ saveAIResponse failed:", eSaveAi?.message || eSaveAi);
    }

    // ✅ Update UI if not realtime (realtime will re-render via snapshot)
    if (!realtime) {
      setMessages((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          role: "ai",
          _docId: savedDocId || null,
          ...aiDoc,
        },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 160);
    }

    // ✅ Daily increment (only free)
    if (!proNow) {
      try {
        const next = await incrementDailyCount(userId);
        if (next && typeof next.count === "number") {
          setDailyGenCount(next.count);
          setDailyGenDateKey(next.dateKey || getLocalDateKey());
        } else {
          setDailyGenCount((c) => c + 1);
        }
      } catch (eInc) {
        setDailyGenCount((c) => c + 1);
      }
    }

    // ✅ Clear composer + attachment after successful send
    setInput("");
    setUploadedImage(null);
  } catch (e) {
    console.warn("❌ sendMessage failed:", e?.message || e);

    if (!isHistoryRealtimeActive()) {
      setMessages((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          role: "ai",
          explanation: e?.message || "Something went wrong.",
          tips: [],
          layoutSuggestions: [],
          furnitureMatches: [],
        },
      ]);
    }

    showMessage("error", "Generation failed", e?.message || "Please try again.", 2200);
  } finally {
    setIsTyping(false);
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

    const result = await ImagePicker.launchCameraAsync({ quality: 1 });

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

  const clearAttachment = () => setUploadedImage(null);

  const getMessagesCollectionRef = () => {
    if (!userId) return null;
    if (!chatIdParam || chatIdParam === "new") return null;

    return sourceParam === "user"
      ? collection(db, "users", userId, "aiConversations", chatIdParam, "messages")
      : collection(db, "aiConversations", chatIdParam, "messages");
  };

  const savingProjectRef = useRef(false);

  // ✅ MANUAL SAVE: saves image + prompt + explanation + title to Projects
  const handleManualSave = async (item) => {
    if (savingProjectRef.current) return;
    savingProjectRef.current = true;

    try {
      const uid = auth?.currentUser?.uid || userId;
      if (!uid) throw new Error("No uid");

      const imageUrl = safeFirestoreImage(item?.image);
      if (!imageUrl) throw new Error("No result image to save");

      const promptText = String(item?.prompt || "").trim();
      const explanationText = String(item?.explanation || "").trim();

      // ✅ Title: short + safe
      const title =
        (promptText ? promptText.replace(/\s+/g, " ").trim().slice(0, 40) : "") || "AI Design";

      // ✅ 1) Save to Projects (THIS is the "real success")
      const saved = await saveResultToProjects({
        uid,
        title,
        imageUrl,
        inputImageUrl: safeFirestoreImage(item?.inputImage) || null,
        prompt: promptText || "Saved design",
        explanation: explanationText || "",
        mode: String(item?.mode || MODE.DESIGN),
      });

      const projectId = saved?.id || saved || null;

      // ✅ 2) Update UI immediately
      setMessages((prev) =>
        prev.map((m) => {
          const sameDoc = item?._docId && m?._docId && m._docId === item._docId;
          const sameFallback =
            m?.role === "ai" &&
            m?.image &&
            item?.image &&
            m.image === item.image &&
            String(m?.prompt || "") === String(item?.prompt || "");

          if (sameDoc || sameFallback) {
            return { ...m, savedToProjects: true, projectId: projectId || m.projectId || null };
          }
          return m;
        })
      );

      // ✅ 3) Persist saved flag back to chat message doc (BEST-EFFORT)
      try {
        const messagesColRef = getMessagesCollectionRef();
        if (messagesColRef && item?._docId) {
          await updateDoc(doc(messagesColRef, item._docId), {
            savedToProjects: true,
            projectId: projectId || null,
          });
        }
      } catch (e2) {
        console.warn("⚠️ updateDoc(savedToProjects) failed (non-blocking):", e2?.message || e2);
      }

      // ✅ 4) Show success modal
      showSaveResult(true, "Saved to Projects.");
    } catch (e) {
      console.warn("Manual save failed:", e?.message || e);
      showSaveResult(false, e?.message || "Manual save failed.");
    } finally {
      savingProjectRef.current = false;
    }
  };

  const renderMessage = ({ item }) => {
    const isAi = item.role === "ai";
    const paletteColors = Array.isArray(item?.palette?.colors) ? item.palette.colors : [];
    const layoutSuggestions = Array.isArray(item?.layoutSuggestions) ? item.layoutSuggestions : [];
    const furnitureMatches = Array.isArray(item?.furnitureMatches) ? item.furnitureMatches : [];

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
                    onError={(e) => console.log("❌ Original image load failed:", item.inputImage, e?.nativeEvent)}
                  />
                </View>
              )}

              {item.image && (
                <View style={styles.imageBlock}>
                  <Text style={styles.imageLabel}>Result</Text>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.previewImage}
                    onError={(e) => console.log("❌ Result image load failed:", item.image, e?.nativeEvent)}
                  />
                </View>
              )}
            </View>
          )}

          {isAi && (
            <View style={styles.modeRow}>
              <Text style={styles.modeText}>
                Mode: {(item.mode || MODE.DESIGN) === MODE.CUSTOMIZE ? "Customize" : "Design"}
              </Text>

              {item?.savedToProjects === true ? (
                <View style={styles.savedBadge}>
                  <Feather name="check-circle" size={14} color="#16A34A" />
                  <Text style={styles.savedBadgeText}>Saved</Text>
                </View>
              ) : (
                !!item?.image && (
                  <TouchableOpacity
                    onPress={() => handleManualSave(item)}
                    activeOpacity={0.9}
                    style={styles.saveOutlineBtnSmall}
                  >
                    <Feather name="bookmark" size={14} color="#0F172A" />
                    <Text style={styles.saveOutlineTextSmall}>Save</Text>
                  </TouchableOpacity>
                )
              )}
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
  const sendEnabled = !isLocked && String(input || "").trim().length > 0;

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
          <PromptFilters
            onSubmit={(promptText) => {
              const clean = String(promptText || "").trim();
              const forcedDesignPrompt = `NEW DESIGN. DESIGN MODE. ${clean}`;
              sendMessage(forcedDesignPrompt, { forceMode: MODE.DESIGN });
            }}
          />

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
                <ActivityIndicator size="small" color="#64748B" />
                <Text style={styles.typingText}>Generating…</Text>
              </View>
            </View>
          )}

          {/* ✅ FOOTER DOCK (permanent bottom) */}
          <View style={styles.footerDock}>
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

            {!isLocked && (
              <View style={styles.chipsWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {chipsToShow.map((c) => (
                    <TouchableOpacity key={c} style={styles.chip} onPress={() => setInput(c)}>
                      <Text style={styles.chipText}>{c}</Text>
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
                  onChangeText={(t) => setInput(t)}
                  placeholder={isLocked ? "Upgrade to continue…" : "Describe what you want to change or design…"}
                  placeholderTextColor="#94A3B8"
                  style={styles.textInput}
                  editable={!isLocked}
                  multiline
                />
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

        {/* ✅ CenterMessageModal mounted ONCE at screen level */}
        <CenterMessageModal
          visible={msgVisible}
          type={msgType}
          title={msgTitle}
          body={msgBody}
          autoHideMs={msgAutoHideMs}
          onClose={closeMessage}
        />
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

  scrollArea: { padding: 14, paddingTop: 10, paddingBottom: 360 },

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

  saveOutlineBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  saveOutlineTextSmall: { fontSize: 11, fontWeight: "900", color: "#0F172A" },

  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modeText: { fontSize: 11, fontWeight: "800", color: "#64748B" },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  savedBadgeText: { fontSize: 11, fontWeight: "900", color: "#166534" },

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
  furniturePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#E2E8F0" },
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

  typingWrap: { paddingHorizontal: 14, paddingBottom: 8 },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  typingText: { fontSize: 11, fontWeight: "900", color: "#64748B" },

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

  inputBar: {
    flexDirection: "row",
    alignItems: "center",
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

  textInput: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "400",
    lineHeight: 18,
    maxHeight: 150,
    paddingTop: 0,
    paddingBottom: 0,
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
