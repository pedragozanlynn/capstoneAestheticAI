// ✅ FIX: Furniture Matches should render INSIDE the AI bubble
// ✅ FIX: Place Furniture Matches BELOW Decoration Tips
// ✅ FIX: Keeps your current styling & link logic
//
// ✅ UPDATE: One chatbot auto-switch mode per message:
//    - Design prompts => generate mode (no image sent)
//    - Customize prompts => edit mode (requires uploaded or lastReferenceImage)
//    - User can switch back and forth any time
//
// ✅ UPDATE: Quick Customize flow works AFTER initial design (reuse last image for edits)
// ✅ UPDATE: Daily Generation Limit (Free): WARNING at 4, LOCK at 5, Pro = unlimited
// ✅ FIX: API_URL has no whitespace (prevents Network request failed)
//
// ✅ NEW: Header title is saved from the FIRST user prompt (one-time)
//
// ✅ NEW (ADDED ONLY): Save AI conversation + messages to Firestore (aiConversations/{conversationId}/messages)
// ✅ NEW (ADDED ONLY): Upload reference images to Supabase and save PUBLIC URL to Firestore (not file://)
//
// ✅ CRITICAL FIX: conversationId stored in useRef (prevents state race where AI save uses null/old id)

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
  saveAIUserMessage,
  saveAIResponse,
} from "../../services/aiConversationService";

// ✅ Supabase uploader (returns public URL)
import { uploadToSupabase } from "../../services/fileUploadService";

// ==============================
// ✅ MODE AUTO-DETECT (One chatbot)
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
  "minimalist",
  "layout",
];

const detectModeFromMessage = (message = "") => {
  const m = normalizeText(message);
  if (DESIGN_TRIGGERS.some((k) => m.includes(k))) return MODE.DESIGN;
  if (CUSTOMIZE_TRIGGERS.some((k) => m.includes(k))) return MODE.CUSTOMIZE;
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

export default function ProfessionalAIAssistant() {
  const router = useRouter();
  const { tab } = useLocalSearchParams(); // kept, not used as mode
  const HEADER_DARK = "#01579B";

  // ==============================
  // ✅ Pro flag
  // ==============================
  const isPro = false;

  // ==============================
  // ✅ Daily limit
  // ==============================
  const DAILY_LIMIT = 5;
  const WARNING_AT = 4;
  const LIMIT_KEY = "aestheticai:daily_generations:v1";

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

  const [lastReferenceImage, setLastReferenceImage] = useState(null);
  const [lastReferenceImageUrl, setLastReferenceImageUrl] = useState(null);

  const flatListRef = useRef(null);

  // ✅ IMPORTANT: ensure your IP is correct for device testing
  const API_URL = "http://192.168.1.6:3001/ai/design";

  const FALLBACK_LAYOUT_SUGGESTIONS = useMemo(
    () => ["Bed: back wall (centered)", "Desk: near window", "Wardrobe: right side"],
    []
  );

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

  // ✅ CRITICAL FIX: store conversationId in ref (not state)
  const conversationIdRef = useRef(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserId(u?.uid || null);
    });
    return unsub;
  }, [auth]);

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

  // ==============================
  // ✅ Upload local image -> Supabase public URL
  // ==============================
  const uploadLocalImageIfNeeded = async (uri) => {
    try {
      if (!uri) return null;
      const u = String(uri);

      if (u.startsWith("http://") || u.startsWith("https://")) return u;

      const uploaded = await uploadToSupabase({
        uri: u,
        name: `ref_${Date.now()}.jpg`,
        type: "image/jpeg",
        mimeType: "image/jpeg",
      });

      return uploaded?.fileUrl || null;
    } catch (e) {
      console.warn("Supabase upload failed:", e?.message || e);
      return null;
    }
  };

  // ✅ never store base64/huge strings
  const safeFirestoreImage = (v) => {
    if (!v) return null;
    const s = String(v);
    if (s.startsWith("data:image")) return null;
    if (s.length > 200000) return null;
    return s;
  };

  // ==============================
  // ✅ Load/reset daily counter
  // ==============================
  useEffect(() => {
    (async () => {
      try {
        const today = getLocalDateKey();
        const raw = await AsyncStorage.getItem(LIMIT_KEY);

        if (!raw) {
          await AsyncStorage.setItem(
            LIMIT_KEY,
            JSON.stringify({ dateKey: today, count: 0 })
          );
          setDailyGenDateKey(today);
          setDailyGenCount(0);
          return;
        }

        const parsed = JSON.parse(raw);
        if (parsed?.dateKey !== today) {
          await AsyncStorage.setItem(
            LIMIT_KEY,
            JSON.stringify({ dateKey: today, count: 0 })
          );
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
  }, []);

  const incrementDailyCount = async () => {
    try {
      const today = getLocalDateKey();

      if (dailyGenDateKey !== today) {
        setDailyGenDateKey(today);
        setDailyGenCount(1);
        await AsyncStorage.setItem(
          LIMIT_KEY,
          JSON.stringify({ dateKey: today, count: 1 })
        );
        return;
      }

      const next = dailyGenCount + 1;
      setDailyGenCount(next);
      await AsyncStorage.setItem(
        LIMIT_KEY,
        JSON.stringify({ dateKey: today, count: next })
      );
    } catch (e) {
      console.warn("Daily limit increment failed:", e?.message || e);
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

  const buildSearchLink = (provider, query) => {
    const q = encodeURIComponent(String(query || "").trim().replace(/\s+/g, " "));
    if (!q) return "";
    if (provider === "shopee") return `https://shopee.ph/search?keyword=${q}`;
    if (provider === "lazada") return `https://www.lazada.com.ph/catalog/?q=${q}`;
    if (provider === "ikea") return `https://www.ikea.com/ph/en/search/?q=${q}`;
    if (provider === "marketplace")
      return `https://www.facebook.com/marketplace/search/?query=${q}`;
    return "";
  };

  const normalizeFurnitureItem = (f = {}) => {
    const name = String(f?.name || "").trim() || "Furniture";
    const query = String(f?.query || name).trim();
    const links = f?.links && typeof f.links === "object" ? f.links : {};

    return {
      id: f?.id || `${name}-${Math.random().toString(16).slice(2)}`,
      name,
      placement: String(f?.placement || "").trim(),
      query,
      links: {
        shopee: links.shopee || buildSearchLink("shopee", query),
        lazada: links.lazada || buildSearchLink("lazada", query),
        ikea: links.ikea || buildSearchLink("ikea", query),
        marketplace: links.marketplace || buildSearchLink("marketplace", query),
      },
    };
  };

  const callAIDesignAPI = async ({ message, mode, image, sessionId }) => {
    const formData = new FormData();
    formData.append("message", message);

    const normalizedMode = mode === MODE.CUSTOMIZE ? "edit" : "generate";
    formData.append("mode", normalizedMode);

    if (sessionId) formData.append("sessionId", sessionId);

    if (image) {
      formData.append("image", {
        uri: image,
        name: "room.jpg",
        type: "image/jpeg",
      });
    }

    const response = await fetch(API_URL, { method: "POST", body: formData });
    if (!response.ok) throw new Error("AI backend error");
    return response.json();
  };

  const sendMessage = async (text = input) => {
    const clean = String(text || "").trim();
    if (!clean) return;

    // ✅ Save first user prompt as header title (once)
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
          layoutSuggestions: FALLBACK_LAYOUT_SUGGESTIONS,
          furnitureMatches: [],
        },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
      return;
    }

    const desiredMode = detectModeFromMessage(clean);
    const localInputImage = uploadedImage;
    const hasReference = !!(localInputImage || lastReferenceImage);

    const effectiveImage =
      desiredMode === MODE.CUSTOMIZE ? localInputImage || lastReferenceImage || null : null;

    if (desiredMode === MODE.CUSTOMIZE && !hasReference) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: clean },
        {
          role: "ai",
          explanation:
            "Customization requires a reference image. Please upload or capture a room photo first, then try again.",
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

    // ✅ upload reference image to Supabase (store URL in Firestore)
    let firestoreRefUrl = null;
    if (effectiveImage) {
      firestoreRefUrl = await uploadLocalImageIfNeeded(effectiveImage);
      if (firestoreRefUrl) setLastReferenceImageUrl(firestoreRefUrl);
    }

    // ✅ Save USER message to Firestore
    try {
      const cid = conversationIdRef.current || (await ensureConversationOnce(clean));
      await saveAIUserMessage(cid, {
        text: clean,
        image: safeFirestoreImage(firestoreRefUrl),
      });
    } catch (e) {
      console.warn("saveAIUserMessage failed:", e?.message || e);
    }

    setMessages((prev) => [...prev, { role: "user", text: clean }]);
    setInput("");
    setIsTyping(true);

    if (!isPro && dailyGenCount === WARNING_AT) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          explanation: "Notice: You have 1 generation left today.",
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
      });

      if (result?.sessionId) setSessionId(result.sessionId);
      if (!isPro) await incrementDailyCount();

      setUploadedImage(null);
      setIsTyping(false);

      const explanation =
        result?.data?.explanation ||
        "Design report is currently unavailable. Please try again.";

      const tips =
        Array.isArray(result?.data?.tips) && result.data.tips.length > 0
          ? result.data.tips
          : [];

      const palette = result?.data?.palette || null;

      const layoutSuggestions =
        Array.isArray(result?.data?.layoutSuggestions) &&
        result.data.layoutSuggestions.length > 0
          ? result.data.layoutSuggestions
          : FALLBACK_LAYOUT_SUGGESTIONS;

      const rawFurniture =
        Array.isArray(result?.data?.furnitureMatches) &&
        result.data.furnitureMatches.length > 0
          ? result.data.furnitureMatches
          : Array.isArray(result?.data?.furniture) && result.data.furniture.length > 0
          ? result.data.furniture
          : [];

      const furnitureMatches = rawFurniture.map(normalizeFurnitureItem);

      const newRef =
        result?.image ||
        result?.inputImage ||
        result?.data?.inputImage ||
        effectiveImage ||
        null;

      if (newRef) setLastReferenceImage(newRef);

      const computedInputImage =
        result?.inputImage ||
        result?.data?.inputImage ||
        (desiredMode === MODE.CUSTOMIZE ? effectiveImage : null) ||
        null;

      const firestoreInputImage =
        firestoreRefUrl ||
        (lastReferenceImageUrl && desiredMode === MODE.CUSTOMIZE ? lastReferenceImageUrl : null) ||
        null;

      // ✅ Save AI response to Firestore (CRITICAL: uses ref id)
      try {
        const cid = conversationIdRef.current || (await ensureConversationOnce(clean));

        await saveAIResponse(cid, {
          mode: desiredMode,
          explanation,
          tips,
          palette,
          layoutSuggestions,
          furnitureMatches,
          inputImage: safeFirestoreImage(firestoreInputImage),
          image: safeFirestoreImage(result?.image),
          sessionId: result?.sessionId || sessionId || null,
          lastReferenceImage: safeFirestoreImage(firestoreInputImage) || null,
        });
      } catch (e) {
        console.warn("saveAIResponse failed:", e?.message || e);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          mode: desiredMode,
          inputImage: computedInputImage,
          image: result?.image || null,
          explanation,
          tips,
          palette,
          layoutSuggestions,
          furnitureMatches,
        },
      ]);

      const nextCount = !isPro ? dailyGenCount + 1 : dailyGenCount;
      if (!isPro && nextCount >= DAILY_LIMIT) {
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
          layoutSuggestions: FALLBACK_LAYOUT_SUGGESTIONS,
          furnitureMatches: [],
        },
      ]);
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
      setLastReferenceImage(uri);

      setMessages((prev) => [
        ...prev,
        { role: "user", text: "Reference image attached.", image: uri },
      ]);

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
      setLastReferenceImage(uri);

      setMessages((prev) => [
        ...prev,
        { role: "user", text: "Photo captured and attached.", image: uri },
      ]);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const clearAttachment = () => setUploadedImage(null);

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
            <Image source={{ uri: item.image }} style={styles.userPreviewImage} />
          )}

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

          {isAi && layoutSuggestions.length > 0 && (
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

          {isAi && furnitureMatches.length > 0 && (
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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
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
                  Upgrade to Pro to unlock unlimited generations and continue chatting.
                </Text>
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => router.push("/subscription")}
                >
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

                <TouchableOpacity
                  onPress={clearAttachment}
                  style={styles.attachmentRemove}
                  disabled={isLocked}
                >
                  <Feather name="x" size={16} color="#334155" />
                </TouchableOpacity>
              </View>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
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
                  colors={
                    !isLocked && input.trim()
                      ? ["#0F172A", "#334155"]
                      : ["#CBD5E1", "#E2E8F0"]
                  }
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
