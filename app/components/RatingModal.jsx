import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    if (visible) {
      setRating(0);
      setFeedback("");
      setLoading(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (rating === 0 || loading) return;

    setLoading(true);
    try {
      const result = await onSubmit({
        rating,
        feedback: feedback || "",
        reviewerName,
      });

      if (result !== false) onClose?.();
      else alert("Failed to submit rating.");
    } catch (err) {
      console.log("Rating submit error:", err);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
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
                onPress={() => setRating(num)}
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
              onChangeText={setFeedback}
              multiline
              maxLength={300}
              editable={!loading}
            />
            <Text style={styles.counter}>{feedback.length}/300</Text>
          </View>

          {/* ACTIONS */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (loading || rating === 0) && styles.disabledBtn,
              ]}
              disabled={loading || rating === 0}
              onPress={handleSubmit}
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
    borderColor: THEME.overlay.replace('0.7', '1'), // Tugma sa background overlay
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
    marginBottom: 20,
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