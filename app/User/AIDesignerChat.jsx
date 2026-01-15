import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
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

export default function ProfessionalAIAssistant() {
  const router = useRouter();
  const { tab } = useLocalSearchParams();

  const HEADER_DARK = "#01579B"; // ✅ match header + status bar area

  const [messages, setMessages] = useState([
    {
      role: "ai",
      explanation:
        tab === "customize"
          ? "System initialized. I am ready to assist with your interior customization. Please upload or capture a space reference."
          : "Welcome. I am your Aesthetic AI Assistant. How can I assist you with your design architectural needs today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const flatListRef = useRef(null);

  const API_URL = "http://192.168.1.11:3001/ai/design";

  const quickPrompts = useMemo(
    () => [
      "Generate a layout idea for this space",
      "Suggest furniture placement",
      "Suggest a color palette that fits my request",
      "Make it brighter and more spacious",
      "Make it more minimalist",
      "Add cozy lighting and decor",
    ],
    []
  );

  const imageQuickPrompts = useMemo(
    () => [
      "Use this image as reference — improve the design",
      "Keep the layout, change the style to modern",
      "Keep the style, make it warmer and brighter",
      "Suggest decor upgrades based on this image",
      "Recommend a palette that matches the photo",
    ],
    []
  );

  const callAIDesignAPI = async ({ message, mode, image, sessionId }) => {
    const formData = new FormData();
    formData.append("message", message);

    const normalizedMode = mode === "customize" ? "edit" : "generate";
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
    if (!String(text || "").trim()) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsTyping(true);

    // ✅ capture current attachment BEFORE you clear it
    const localInputImage = uploadedImage;

    try {
      const result = await callAIDesignAPI({
        message: text,
        mode: tab,
        image: uploadedImage,
        sessionId,
      });

      if (result?.sessionId) setSessionId(result.sessionId);

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

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          // ✅ show the original photo you captured/uploaded
          inputImage:
            result?.inputImage ||
            result?.data?.inputImage ||
            localInputImage ||
            null,
          // ✅ show the generated output
          image: result?.image || null,
          explanation,
          tips,
          palette,
        },
      ]);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
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
        },
      ]);
    }
  };

  // ✅ Gallery pick
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setUploadedImage(uri);

      // ✅ show the selected image immediately in chat
      setMessages((prev) => [
        ...prev,
        { role: "user", text: "Reference image attached.", image: uri },
      ]);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
    }
  };

  // ✅ Camera capture
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setUploadedImage(uri);

      // ✅ show the captured image immediately in chat
      setMessages((prev) => [
        ...prev,
        { role: "user", text: "Photo captured and attached.", image: uri },
      ]);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
    }
  };

  const clearAttachment = () => setUploadedImage(null);

  const renderMessage = ({ item }) => {
    const isAi = item.role === "ai";
    const paletteColors = Array.isArray(item?.palette?.colors)
      ? item.palette.colors
      : [];

    return (
      <View style={[styles.messageRow, isAi ? styles.aiRow : styles.userRow]}>
        {isAi && (
          <View style={[styles.miniAvatar, styles.aiMiniAvatar]}>
            <MaterialCommunityIcons name="robot" size={12} color="#FFF" />
          </View>
        )}

        <View style={[styles.bubble, isAi ? styles.aiBubble : styles.userBubble]}>
          {/* ✅ USER IMAGE PREVIEW (when they attach/capture) */}
          {!isAi && item.image && (
            <Image source={{ uri: item.image }} style={styles.userPreviewImage} />
          )}

          {/* ✅ AI: show ORIGINAL + RESULT */}
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
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: c.hex || "#CBD5E1" },
                      ]}
                    />
                    <Text style={styles.swatchLabel} numberOfLines={1}>
                      {c.name || "Color"}
                    </Text>
                    <Text style={styles.swatchHex}>
                      {(c.hex || "").toUpperCase()}
                    </Text>
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
            <Text style={styles.headerTitle}>Aesthetic AI</Text>
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {chipsToShow.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.promptPill}
                  onPress={() => sendMessage(p)}
                >
                  <Text style={styles.promptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <TouchableOpacity onPress={takePhoto} style={styles.iconBtnLight}>
                <Feather name="camera" size={20} color="#334155" />
              </TouchableOpacity>

              <TouchableOpacity onPress={pickImage} style={styles.iconBtnLight}>
                <Feather name="image" size={20} color="#334155" />
              </TouchableOpacity>

              <View style={styles.inputBox}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Message Aesthetic AI..."
                  placeholderTextColor="#94A3B8"
                  value={input}
                  onChangeText={setInput}
                  multiline
                />
              </View>

              <TouchableOpacity onPress={() => sendMessage()} disabled={!input.trim()}>
                <LinearGradient
                  colors={
                    input.trim()
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
  statusDot: { width: 8, height: 8, borderRadius: 20, backgroundColor: "#10B981", marginRight: 6 },
  statusText: { fontSize: 12, color: "rgba(255,255,255,0.82)", fontWeight: "600" },
  sessionText: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginLeft: 6, maxWidth: 200 },
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
  aiBubble: { backgroundColor: "#FFFFFF", marginLeft: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  userBubble: { backgroundColor: "#0F172A", marginRight: 8 },

  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginBottom: 12,
  },

  // ✅ NEW: show user-attached image
  userPreviewImage: {
    width: 220,
    height: 160,
    borderRadius: 14,
    marginBottom: 10,
    alignSelf: "flex-end",
  },

  // ✅ NEW: show Original + Result blocks for AI
  imageCompareWrap: {
    marginBottom: 12,
  },
  imageBlock: {
    marginBottom: 10,
  },
  imageLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },

  section: { marginBottom: 10 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
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

  userText: { color: "#FFFFFF", fontSize: 15, lineHeight: 20 },

  typingWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingBottom: 10 },
  typingDot: { width: 7, height: 7, borderRadius: 10, backgroundColor: "#38BDF8", marginRight: 8 },
  typingText: { textAlign: "center", fontSize: 12, color: "#64748B", fontWeight: "600" },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },

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
