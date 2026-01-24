import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ---------------- CONSTANTS ---------------- */
const THEME = {
  primary: "#01579B", // Ang iyong consistent Deep Blue
  surface: "#FFFFFF",
  textDark: "#0F172A",
  textGray: "#64748B",
  starActive: "#FFD166",
  starInactive: "#E2E8F0",
  inputBg: "#F8FAFC",
  overlay: "rgba(15, 23, 42, 0.7)",
};

export default function RatingModal({
  visible,
  onSubmit,
  onClose,
  reviewerName = "Anonymous",
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ prevent double submit (extra safety)
  const sendingRef = useRef(false);

  // ✅ inline message (no Alert, no toast, minimal UI impact)
  const [msg, setMsg] = useState({ visible: false, text: "", type: "info" });
  const msgTimerRef = useRef(null);

  const showMessage = (text, type = "info", ms = 2200) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      setMsg({ visible: true, text: String(text || ""), type });
      msgTimerRef.current = setTimeout(() => {
        setMsg((m) => ({ ...m, visible: false }));
      }, ms);
    } catch {}
  };

  useEffect(() => {
    if (visible) {
      setRating(0);
      setFeedback("");
      setLoading(false);
      sendingRef.current = false;
      setMsg({ visible: false, text: "", type: "info" });
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, []);

  /* ---------------- VALIDATIONS ---------------- */
  const safeStr = (v) => (v == null ? "" : String(v));
  const trimmedFeedback = feedback.trim();

  const validate = () => {
    if (loading || sendingRef.current) return "Submitting... please wait.";
    if (typeof onSubmit !== "function") return "Submit handler is missing.";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return "Please select a star rating (1–5).";
    if (safeStr(reviewerName).trim().length > 60)
      return "Reviewer name is too long.";
    if (trimmedFeedback.length > 300) return "Feedback is too long (max 300).";
    return "";
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) return showMessage(err, "error");

    sendingRef.current = true;
    setLoading(true);

    try {
      // ✅ ALWAYS pass clean, consistent payload for Firestore
      const payload = {
        rating: Number(rating),
        feedback: trimmedFeedback, // can be ""
        reviewerName: safeStr(reviewerName).trim() || "Anonymous",
        createdAt: new Date().toISOString(), // helpful if onSubmit forgets serverTimestamp
      };

      const result = await onSubmit(payload);

      // ✅ if onSubmit returns false -> treat as failure (keeps your behavior)
      if (result === false) {
        showMessage("Failed to submit rating. Please try again.", "error");
        return;
      }

      showMessage("Thank you! Your rating was submitted.", "success", 1200);

      // close after short delay so message is seen
      setTimeout(() => {
        try {
          onClose?.();
        } catch {}
      }, 450);
    } catch (err) {
      console.log("Rating submit error:", err?.message || err);
      showMessage("Something went wrong. Please try again.", "error");
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* HEADER SECTION */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="star" size={30} color={THEME.starActive} />
            </View>
          </View>

          <Text style={styles.title}>How was your consultation?</Text>
          <Text style={styles.subtitle}>
            Your feedback helps us provide better service for you ✨
          </Text>

          {/* ⭐ STAR RATING */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((num) => (
              <TouchableOpacity
                key={num}
                disabled={loading}
                activeOpacity={0.6}
                onPress={() => {
                  if (loading) return;
                  setRating(num);
                  if (msg.visible) setMsg((m) => ({ ...m, visible: false }));
                }}
                style={styles.starTouch}
              >
                <Ionicons
                  name={rating >= num ? "star" : "star-outline"}
                  size={42}
                  color={rating >= num ? THEME.starActive : THEME.starInactive}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* 📝 FEEDBACK INPUT */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Share your experience (optional)..."
              placeholderTextColor={THEME.textGray}
              value={feedback}
              onChangeText={(t) => {
                // ✅ enforce maxLength safely even if pasted
                const next = String(t || "");
                setFeedback(next.length > 300 ? next.slice(0, 300) : next);
              }}
              multiline
              maxLength={300}
              editable={!loading}
              textAlignVertical="top"
            />
            <Text style={styles.counter}>{feedback.length}/300</Text>
          </View>

          {/* ✅ messages (no alert/toast, minimal) */}
          {msg.visible ? (
            <Text
              style={[
                styles.inlineMsg,
                msg.type === "success" && styles.inlineMsgSuccess,
                msg.type === "error" && styles.inlineMsgError,
              ]}
            >
              {msg.text}
            </Text>
          ) : null}

          {/* ACTIONS */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (loading || rating === 0) && styles.disabledBtn,
              ]}
              disabled={loading || rating === 0}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>Submit Feedback</Text>
              )}
            </TouchableOpacity>

            {!loading && (
              <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Maybe later</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: THEME.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: THEME.surface,
    borderRadius: 30,
    padding: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  iconContainer: {
    marginTop: -60, // Para mag-overlap ang icon sa taas ng card
    marginBottom: 15,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 6,
    borderColor: THEME.overlay.replace("0.7", "1"), // Tugma sa background overlay
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    color: THEME.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: THEME.textGray,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
  },
  starTouch: {
    paddingHorizontal: 4,
  },
  inputWrapper: {
    width: "100%",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    backgroundColor: THEME.inputBg,
    borderRadius: 18,
    padding: 16,
    minHeight: 110,
    color: THEME.textDark,
    fontSize: 15,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  counter: {
    fontSize: 11,
    color: THEME.textGray,
    textAlign: "right",
    marginTop: 6,
    fontWeight: "600",
  },

  // ✅ inline message (minimal, no layout changes elsewhere)
  inlineMsg: {
    width: "100%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    opacity: 0.96,
  },
  inlineMsgSuccess: { backgroundColor: "#16A34A" },
  inlineMsgError: { backgroundColor: "#DC2626" },

  buttonContainer: {
    width: "100%",
  },
  submitBtn: {
    width: "100%",
    backgroundColor: "#2c4f4f",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
    elevation: 4,
  },
  disabledBtn: {
    backgroundColor: "#CBD5E1",
    elevation: 0,
  },
  submitText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 16,
  },
  cancelBtn: {
    paddingVertical: 10,
  },
  cancelText: {
    textAlign: "center",
    color: THEME.textGray,
    fontWeight: "700",
    fontSize: 14,
  },
});
