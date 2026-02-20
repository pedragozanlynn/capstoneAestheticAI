import React, { useEffect, useRef, useState } from "react";
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

// ✅ Firestore
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";

// ✅ CenterMessageModal
import CenterMessageModal from "./CenterMessageModal";

/* ---------------- THEME ---------------- */
const THEME = {
  primary: "#01579B",
  surface: "#FFFFFF",
  bgSoft: "#F8FAFC",
  border: "#E2E8F0",
  textDark: "#0F172A",
  textGray: "#64748B",
  success: "#16A34A",
  danger: "#DC2626",
  starActive: "#FBBF24",
  starInactive: "#E2E8F0",
  overlay: "rgba(15, 23, 42, 0.6)",
};

export default function RatingModal({
  visible,
  onSubmit, // optional override
  onClose,
  reviewerName = "Anonymous",

  // ✅ IDs for internal submit (recommended)
  roomId = null,
  appointmentId = null, // optional
  userId = null,
  consultantId = null,
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const sendingRef = useRef(false);

  // CenterMessageModal state
  const [cmOpen, setCmOpen] = useState(false);
  const [cmType, setCmType] = useState("info");
  const [cmTitle, setCmTitle] = useState("");
  const [cmBody, setCmBody] = useState("");

  const showCenterMsg = (type, title, body = "") => {
    setCmType(type);
    setCmTitle(String(title || ""));
    setCmBody(String(body || ""));
    setCmOpen(true);
  };

  useEffect(() => {
    if (visible) {
      setRating(0);
      setFeedback("");
      setLoading(false);
      sendingRef.current = false;

      setCmOpen(false);
      setCmType("info");
      setCmTitle("");
      setCmBody("");
    }
  }, [visible]);

  /* ---------------- HELPERS ---------------- */
  const safeStr = (v) => String(v ?? "").trim();
  const trimmedFeedback = feedback.trim();

  // ✅ appointmentId optional; fallback to roomId
  const getAppointmentId = () => {
    const aid = safeStr(appointmentId);
    const rid = safeStr(roomId);
    return aid || rid || "";
  };

  const canInternalSubmit = () => {
    const rid = safeStr(roomId);
    return !!rid; // ✅ roomId is enough now
  };

  const validate = () => {
    if (!visible) return "Rating form is not open.";
    if (loading || sendingRef.current) return "Submitting... please wait.";

    const hasHandler = typeof onSubmit === "function";
    if (!hasHandler && !canInternalSubmit()) {
      return "Missing roomId. Please reopen the chat then try again.";
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return "Please select a star rating (1–5).";
    }

    if (safeStr(reviewerName).length > 60) return "Reviewer name is too long.";
    if (trimmedFeedback.length > 300) return "Feedback is too long (max 300).";

    return "";
  };

  /* ---------------- INTERNAL SUBMIT ----------------
     ✅ Saves rating + completes chat room (and appointment if exists)
  */
  const internalSubmit = async (payload) => {
    try {
      const rid = safeStr(roomId);
      const aid = getAppointmentId(); // ✅ fallback to roomId

      if (!rid) return false;

      const ratingNum = Number(payload?.rating || 0);
      if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) return false;

      // 1) Save rating record
      await addDoc(collection(db, "ratings"), {
        roomId: rid,
        appointmentId: aid || null,
        userId: safeStr(userId) || null,
        consultantId: safeStr(consultantId) || null,
        rating: ratingNum,
        feedback: safeStr(payload?.feedback || ""),
        reviewerName: safeStr(payload?.reviewerName || "Anonymous"),
        createdAt: serverTimestamp(),
      });

      // 2) Complete chat room
      await updateDoc(doc(db, "chatRooms", rid), {
        ratingSubmitted: true,
        ratingRequiredForUser: false, // ✅ cleanup
        status: "completed",
        completedAt: serverTimestamp(),
      });

      // 3) Complete appointment (only if doc exists / rules allow)
      // ✅ If your appointmentId is not same as roomId, pass it; otherwise fallback is ok.
      if (aid) {
        try {
          await updateDoc(doc(db, "appointments", aid), {
            status: "completed",
            completedAt: serverTimestamp(),
          });
        } catch (e) {
          // Do not fail rating if appointment update fails
          console.log("⚠️ appointment complete skipped:", e?.message || e);
        }
      }

      return true;
    } catch (e) {
      console.log("❌ internalSubmit error:", e?.message || e);
      return false;
    }
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      showCenterMsg("error", "Cannot submit", err);
      return;
    }

    sendingRef.current = true;
    setLoading(true);

    try {
      const payload = {
        rating: Number(rating),
        feedback: trimmedFeedback,
        reviewerName: safeStr(reviewerName) || "Anonymous",
      };

      const ok =
        typeof onSubmit === "function"
          ? await onSubmit(payload)
          : await internalSubmit(payload);

      if (ok === false) {
        showCenterMsg("error", "Submit failed", "Please check your connection and try again.");
        return;
      }

      showCenterMsg("success", "Thank you!", "Your rating was submitted.");

      setTimeout(() => {
        try {
          onClose?.();
        } catch {}
      }, 450);
    } catch (e) {
      showCenterMsg("error", "Something went wrong", "Please try again.");
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  return (
    <>
      <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            {/* top icon */}
            <View style={styles.topIconWrap}>
              <View style={styles.topIconCircle}>
                <Ionicons name="star" size={28} color={THEME.starActive} />
              </View>
            </View>

            <Text style={styles.title}>Rate your consultation</Text>
            <Text style={styles.subtitle}>
              Your feedback helps improve the experience.
            </Text>

            {/* stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((num) => {
                const active = rating >= num;
                return (
                  <TouchableOpacity
                    key={num}
                    disabled={loading}
                    activeOpacity={0.75}
                    onPress={() => setRating(num)}
                    style={styles.starBtn}
                  >
                    <Ionicons
                      name={active ? "star" : "star-outline"}
                      size={40}
                      color={active ? THEME.starActive : THEME.starInactive}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* feedback */}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Write a short feedback (optional)..."
                placeholderTextColor={THEME.textGray}
                value={feedback}
                onChangeText={(t) => {
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

            {/* buttons */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (loading || rating === 0) && styles.primaryBtnDisabled,
              ]}
              disabled={loading || rating === 0}
              onPress={handleSubmit}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Submit</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              disabled={loading}
              onPress={onClose}
              style={styles.secondaryBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CenterMessageModal
        visible={cmOpen}
        type={cmType}
        title={cmTitle}
        message={cmBody}
        onClose={() => setCmOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: THEME.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: THEME.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },

  topIconWrap: {
    alignItems: "center",
    marginTop: -38,
    marginBottom: 10,
  },
  topIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: THEME.surface,
    borderWidth: 6,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },

  title: {
    fontSize: 18,
    fontWeight: "900",
    color: THEME.textDark,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textGray,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 14,
  },

  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
  },
  starBtn: { paddingHorizontal: 4 },

  inputWrap: { marginTop: 4 },
  input: {
    minHeight: 110,
    borderRadius: 16,
    backgroundColor: THEME.bgSoft,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: THEME.textDark,
    fontSize: 14,
    fontWeight: "700",
  },
  counter: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: THEME.textGray,
    textAlign: "right",
  },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: THEME.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#CBD5E1" },
  primaryBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "900",
  },

  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: THEME.textGray,
    fontSize: 13,
    fontWeight: "800",
  },
});
