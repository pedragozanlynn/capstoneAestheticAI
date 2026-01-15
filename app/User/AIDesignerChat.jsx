import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
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

  const [messages, setMessages] = useState([
    {
      role: "ai",
      explanation:
        tab === "customize"
          ? "System initialized. I am ready to assist with your interior customization. Please upload your floor plan or space reference."
          : "Welcome. I am your Aesthetic AI Assistant. How can I assist you with your design architectural needs today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const flatListRef = useRef(null);

  const API_URL = "http://192.168.1.7:3001/ai/design";
  const quickPrompts = ["Furniture Suggestion", "3D Preview"];

  const callAIDesignAPI = async ({ message, mode, image }) => {
    const formData = new FormData();
    formData.append("message", message);
    formData.append("mode", mode || "design");

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
    if (!text.trim()) return;
  
    setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setIsTyping(true);
  
    try {
      const result = await callAIDesignAPI({
        message: text,
        mode: tab,
        image: uploadedImage,
      });
  
      setUploadedImage(null);
      setIsTyping(false);
  
      // 🔒 SAFE NORMALIZATION
      const explanation =
        result?.data?.explanation ||
        "This 3D-rendered interior presents a balanced layout with cohesive materials, thoughtful lighting, and a visually inviting atmosphere.";
  
      const tips =
        Array.isArray(result?.data?.tips) && result.data.tips.length > 0
          ? result.data.tips
          : [
              "Add layered lighting to enhance depth and ambiance",
              "Use textures that complement the visible materials",
              "Maintain open spacing to preserve visual balance",
            ];
  
      setMessages(prev => [
        ...prev,
        {
          role: "ai",
          image: result.image,
          explanation,
          tips,
        },
      ]);
  
      // 🔽 Auto-scroll
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      console.error("AI UI ERROR:", err);
      setIsTyping(false);
  
      setMessages(prev => [
        ...prev,
        {
          role: "ai",
          explanation:
            "⚠️ Unable to process your request at the moment. Please try again.",
          tips: [],
        },
      ]);
    }
  };
  
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      setUploadedImage(result.assets[0].uri);
      setMessages(prev => [...prev, { role: "user", text: "Reference image attached." }]);
    }
  };

  /* ===============================
     RENDER MESSAGE (FINAL FIX)
     =============================== */
  const renderMessage = ({ item }) => {
    const isAi = item.role === "ai";

    return (
      <View style={[styles.messageRow, isAi ? styles.aiRow : styles.userRow]}>
        {isAi && (
          <View style={[styles.miniAvatar, styles.aiMiniAvatar]}>
            <MaterialCommunityIcons name="robot" size={12} color="#FFF" />
          </View>
        )}

        <View style={[styles.bubble, isAi ? styles.aiBubble : styles.userBubble]}>
          {/* IMAGE */}
          {isAi && item.image && (
            <Image source={{ uri: item.image }} style={styles.previewImage} />
          )}

          {/* DESIGN EXPLANATION */}
          {isAi && item.explanation && (
            <View style={styles.section}>
              <Text style={styles.paragraph}>{item.explanation}</Text>
            </View>
          )}

          {/* DECORATION TIPS */}
          {isAi && Array.isArray(item.tips) && item.tips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Decoration Tips</Text>
              {item.tips.map((tip, i) => (
                <Text key={i} style={styles.bullet}>• {tip}</Text>
              ))}
            </View>
          )}

          {/* USER TEXT */}
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>

        {/* HEADER (UNCHANGED) */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color="#1E293B" />
          </TouchableOpacity>
          <LinearGradient colors={["#1E293B", "#475569"]} style={styles.headerLogoBox}>
            <MaterialCommunityIcons name="robot" size={20} color="#FFF" />
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>Aesthetic AI</Text>
            <Text style={styles.statusText}>System Online</Text>
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

          {isTyping && <Text style={styles.typingText}>Aesthetic AI is analyzing…</Text>}

          {/* FOOTER (UNCHANGED) */}
          <View style={styles.footer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {quickPrompts.map(p => (
                <TouchableOpacity key={p} style={styles.promptPill} onPress={() => sendMessage(p)}>
                  <Text style={styles.promptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <TouchableOpacity onPress={pickImage}>
                <Feather name="plus" size={22} color="#64748B" />
              </TouchableOpacity>

              <TextInput
                style={styles.textInput}
                placeholder="Message Aesthetic AI..."
                value={input}
                onChangeText={setInput}
                multiline
              />

              <TouchableOpacity onPress={() => sendMessage()} disabled={!input.trim()}>
                <LinearGradient colors={["#1E293B", "#334155"]} style={styles.sendBtn}>
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

/* ===============================
   STYLES (DESIGN REPORT STYLE)
   =============================== */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFF" },
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFF",
  },
  backButton: { marginRight: 8 },
  headerLogoBox: { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 10 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  statusText: { fontSize: 11, color: "#10B981" },

  scrollArea: { padding: 16 },

  messageRow: { flexDirection: "row", marginBottom: 20, maxWidth: "90%" },
  aiRow: { alignSelf: "flex-start" },
  userRow: { alignSelf: "flex-end" },

  bubble: { borderRadius: 20, padding: 16 },
  aiBubble: { backgroundColor: "#FFF", marginLeft: 8 },
  userBubble: { backgroundColor: "#1E293B", marginRight: 8 },

  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },

  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4, color: "#111827" },
  paragraph: { fontSize: 14, lineHeight: 20, color: "#374151" },
  bullet: { fontSize: 14, lineHeight: 20, color: "#374151" },

  userText: { color: "#FFF", fontSize: 15 },

  miniAvatar: { width: 24, height: 24, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  aiMiniAvatar: { backgroundColor: "#1E293B" },
  userMiniAvatar: { backgroundColor: "#E5E7EB" },

  footer: { padding: 16, borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FFF" },
  promptPill: { padding: 10, borderRadius: 20, backgroundColor: "#F1F5F9", marginRight: 8 },
  promptText: { fontSize: 12, fontWeight: "600" },

  inputRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  textInput: { flex: 1, marginHorizontal: 8, fontSize: 15 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  typingText: { textAlign: "center", fontSize: 12, color: "#94A3B8", marginBottom: 8 },
});
