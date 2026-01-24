import { doc, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";

export default function ConsultantDetailsModal({
  visible,
  onClose,
  data,
  onStatusUpdated,
}) {
  const [updating, setUpdating] = useState(false);

  /* ===========================
     ✅ TOAST (TOP, NO OK BUTTON)
     =========================== */
  const [toast, setToast] = useState({ visible: false, text: "", type: "info" });
  const toastTimerRef = useRef(null);

  const showToast = (text, type = "info", ms = 2200) => {
    try {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ visible: true, text: String(text || ""), type });
      toastTimerRef.current = setTimeout(() => {
        setToast((t) => ({ ...t, visible: false }));
      }, ms);
    } catch {}
  };

  useEffect(() => {
    return () => {
      try {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      } catch {}
    };
  }, []);

  /* ================= HELPERS (VALIDATIONS) ================= */
  const safeStr = (v) => (v == null ? "" : String(v).trim());

  const isValidUrl = (u) => {
    const s = safeStr(u);
    return s.startsWith("http://") || s.startsWith("https://");
  };

  const validateBeforeUpdate = (status) => {
    if (!data) return "No consultant data found.";
    if (!data?.id) return "Document ID is missing.";
    if (!status) return "Missing status action.";
    const st = safeStr(status);
    if (st !== "accepted" && st !== "rejected") return "Invalid status value.";
    if (updating) return "Please wait… updating is in progress.";
    if (safeStr(data.status) !== "pending") return "This application is no longer pending.";
    return "";
  };

  const validateBeforeOpenLink = (url) => {
    const s = safeStr(url);
    if (!s) return "File link is missing.";
    if (!isValidUrl(s)) return "Invalid file link format.";
    return "";
  };

  const handleUpdate = async (status) => {
    const err = validateBeforeUpdate(status);
    if (err) return showToast(err, "error");

    setUpdating(true);

    try {
      await updateDoc(doc(db, "consultants", data.id), { status });

      if (typeof onStatusUpdated === "function") {
        onStatusUpdated(data.id, status);
      }

      // ✅ toast success (instead of Alert)
      showToast(
        status === "accepted"
          ? "Consultant approved successfully."
          : "Consultant application rejected.",
        "success",
        1600
      );

      // close after short delay so toast is seen
      setTimeout(() => {
        try {
          onClose?.();
        } catch {}
      }, 450);
    } catch (error) {
      console.error("Firestore update error:", error);
      showToast("Unable to update status. Please try again.", "error");
    } finally {
      setUpdating(false);
    }
  };

  if (!data) return null;

  const openLink = async (url) => {
    const err = validateBeforeOpenLink(url);
    if (err) return showToast(err, "error");

    try {
      await Linking.openURL(url);
    } catch (e) {
      showToast("Unable to open the file link.", "error");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.dragIndicator} />

          <View style={styles.modalHeader}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.title}>{data.fullName}</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      data.status === "accepted" ? "#E8F5E9" : "#FFF3E0",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: data.status === "accepted" ? "#2E7D32" : "#E65100",
                    },
                  ]}
                >
                  {(data.status || "pending").toUpperCase()}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeIconButton}>
              <Ionicons name="close-circle" size={32} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. PERSONAL INFORMATION */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Personal Profile</Text>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Ionicons
                    name="mail"
                    size={18}
                    color="#01579B"
                    style={styles.iconSpace}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Email Address</Text>
                    <Text style={styles.fieldValue}>{data.email}</Text>
                  </View>
                </View>
                <View style={[styles.infoRow, { marginTop: 15 }]}>
                  <Ionicons
                    name="location"
                    size={18}
                    color="#01579B"
                    style={styles.iconSpace}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Complete Address</Text>
                    <Text style={styles.fieldValue}>{data.address}</Text>
                  </View>
                </View>
                <View style={[styles.infoRow, { marginTop: 15 }]}>
                  <Ionicons
                    name="male-female"
                    size={18}
                    color="#01579B"
                    style={styles.iconSpace}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Gender</Text>
                    <Text style={styles.fieldValue}>{data.gender}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 2. PROFESSIONAL CREDENTIALS */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Professional Credentials</Text>
              <View style={styles.infoCard}>
                <View style={styles.detailGrid}>
                  <View style={styles.gridItem}>
                    <Text style={styles.fieldLabel}>Specialization</Text>
                    <Text style={styles.fieldValueBold}>
                      {data.specialization}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 15 }}>
                  <Text style={styles.fieldLabel}>Educational Attainment</Text>
                  <Text style={styles.fieldValue}>{data.education}</Text>
                </View>

                {(data.experience || data.licenseNumber) && (
                  <View
                    style={[
                      styles.detailGrid,
                      {
                        marginTop: 15,
                        borderTopWidth: 1,
                        borderTopColor: "#E2E8F0",
                        paddingTop: 15,
                      },
                    ]}
                  >
                    <View style={styles.gridItem}>
                      <Text style={styles.fieldLabel}>Experience</Text>
                      <Text style={styles.fieldValue}>
                        {data.experience} Years
                      </Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.fieldLabel}>License No.</Text>
                      <Text style={styles.fieldValue}>
                        {data.licenseNumber || "N/A"}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* 3. AVAILABILITY */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Working Availability</Text>
              <View style={styles.availabilityContainer}>
                {data.availability && data.availability.length > 0 ? (
                  data.availability.map((day, index) => (
                    <View key={index} style={styles.dayBadge}>
                      <Text style={styles.dayText}>{day}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No schedule specified</Text>
                )}
              </View>
            </View>

            {/* 4. DOCUMENT EVIDENCE */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Document Evidence</Text>

              {data.idFrontUrl ? (
                <TouchableOpacity
                  style={styles.portfolioBtn}
                  onPress={() => openLink(data.idFrontUrl)}
                  activeOpacity={0.8}
                >
                  <View style={styles.portfolioContent}>
                    <Ionicons name="card-outline" size={24} color="#FFF" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.portfolioBtnText}>
                        Open Valid ID (Front)
                      </Text>
                      <Text style={styles.portfolioBtnSub}>
                        View front side of ID
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              ) : null}

              {data.idBackUrl ? (
                <TouchableOpacity
                  style={[styles.portfolioBtn, { marginTop: 10 }]}
                  onPress={() => openLink(data.idBackUrl)}
                  activeOpacity={0.8}
                >
                  <View style={styles.portfolioContent}>
                    <Ionicons name="card-outline" size={24} color="#FFF" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.portfolioBtnText}>
                        Open Valid ID (Back)
                      </Text>
                      <Text style={styles.portfolioBtnSub}>
                        View back side of ID
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              ) : null}

              {data.selfieUrl ? (
                <TouchableOpacity
                  style={[styles.portfolioBtn, { marginTop: 10 }]}
                  onPress={() => openLink(data.selfieUrl)}
                  activeOpacity={0.8}
                >
                  <View style={styles.portfolioContent}>
                    <Ionicons name="camera-outline" size={24} color="#FFF" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.portfolioBtnText}>Open Selfie</Text>
                      <Text style={styles.portfolioBtnSub}>
                        View selfie verification
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* ACTION BUTTONS - Conditioned on 'pending' status */}
            <View style={styles.footerAction}>
              {data.status === "pending" ? (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleUpdate("rejected")}
                    disabled={updating}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionBtnText}>
                      {updating ? "UPDATING..." : "REJECT APPLICATION"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.acceptBtn]}
                    onPress={() => handleUpdate("accepted")}
                    disabled={updating}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionBtnText}>
                      {updating ? "UPDATING..." : "APPROVE CONSULTANT"}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.completedContainer}>
                  <Ionicons
                    name={
                      data.status === "accepted"
                        ? "checkmark-done-circle"
                        : "close-circle"
                    }
                    size={22}
                    color={data.status === "accepted" ? "#2E7D32" : "#EF4444"}
                  />
                  <Text
                    style={[
                      styles.completedText,
                      {
                        color:
                          data.status === "accepted" ? "#2E7D32" : "#EF4444",
                      },
                    ]}
                  >
                    Application {data.status}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* ✅ TOAST OVERLAY (TOP, NO OK BUTTON) */}
          {toast.visible && (
            <View
              pointerEvents="none"
              style={[
                styles.toast,
                toast.type === "success" && styles.toastSuccess,
                toast.type === "error" && styles.toastError,
                toast.type === "info" && styles.toastInfo,
              ]}
            >
              <Text style={styles.toastText}>{toast.text}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: "92%",
    width: "100%",
    paddingTop: 12,
  },
  dragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  headerTitleContainer: { flex: 1 },
  title: { fontSize: 22, fontWeight: "800", color: "#1E293B" },
  closeIconButton: { padding: 5 },
  scrollContent: { padding: 24, paddingBottom: 60 },
  section: { marginBottom: 25 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  infoCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  infoRow: { flexDirection: "row", alignItems: "center" },
  iconSpace: { marginRight: 12 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  fieldValue: { fontSize: 15, color: "#334155", fontWeight: "500", marginTop: 2 },
  fieldValueBold: { fontSize: 15, color: "#01579B", fontWeight: "700", marginTop: 2 },
  detailGrid: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 10 },
  gridItem: { flex: 1 },
  availabilityContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayBadge: {
    backgroundColor: "#E0F2F1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#B2DFDB",
  },
  dayText: { color: "#00695C", fontSize: 13, fontWeight: "700" },
  portfolioBtn: {
    backgroundColor: "#01579B",
    borderRadius: 15,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 4,
  },
  portfolioContent: { flexDirection: "row", alignItems: "center" },
  portfolioBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  portfolioBtnSub: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 5,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  footerAction: { marginTop: 10, gap: 12 },
  actionBtn: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  acceptBtn: { backgroundColor: "#2c4f4f" },
  rejectBtn: { backgroundColor: "#EF4444" },
  emptyText: { color: "#94A3B8", fontStyle: "italic" },

  completedContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  completedText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  /* ===== TOAST (TOP, NO OK) ===== */
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    top: Platform.OS === "ios" ? 16 : 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    opacity: 0.96,
    elevation: 10,
    zIndex: 9999,
  },
  toastText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  toastInfo: { backgroundColor: "#0F172A" },
  toastSuccess: { backgroundColor: "#16A34A" },
  toastError: { backgroundColor: "#DC2626" },
});
