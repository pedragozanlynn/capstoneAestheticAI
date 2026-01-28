import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";

// ✅ ADD: use your reusable CenterMessageModal component
import CenterMessageModal from "../components/CenterMessageModal";

export default function ConsultantDetailsModal({
  visible,
  onClose,
  data,
  onStatusUpdated,
}) {
  const [updating, setUpdating] = useState(false);

  // ✅ full Firestore doc state (this is what we render)
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docData, setDocData] = useState(null);

  /* ===========================
     ✅ CENTER MESSAGE MODAL
     =========================== */
  const [centerMsg, setCenterMsg] = useState({
    visible: false,
    type: "info", // "success" | "error" | "info" | "warning"
    title: "",
    message: "",
  });

  const openCenterMsg = (type, title, message) => {
    setCenterMsg({
      visible: true,
      type: String(type || "info"),
      title: String(title || ""),
      message: String(message || ""),
    });
  };

  const closeCenterMsg = () => {
    setCenterMsg((m) => ({ ...m, visible: false }));
  };

  /* ================= HELPERS ================= */
  const safeStr = (v) => (v == null ? "" : String(v).trim());

  const normalizeStatus = (status) => {
    const s = safeStr(status).toLowerCase();
    if (s === "accepted") return "accepted";
    if (s === "rejected") return "rejected";
    return "pending";
  };

  const isValidUrl = (u) => {
    const s = safeStr(u);
    return s.startsWith("http://") || s.startsWith("https://");
  };

  const validateBeforeOpenLink = (url) => {
    const s = safeStr(url);
    if (!s) return "File link is missing.";
    if (!isValidUrl(s)) return "Invalid file link format.";
    return "";
  };

  const openLink = async (url) => {
    const err = validateBeforeOpenLink(url);
    if (err) return openCenterMsg("error", "Invalid Link", err);
    try {
      await Linking.openURL(url);
    } catch {
      openCenterMsg("error", "Open Failed", "Unable to open the file link.");
    }
  };

  // ✅ safe fallback render helpers
  const showVal = (v, fallback = "—") => {
    const s = safeStr(v);
    return s ? s : fallback;
  };

  // ✅ NEW: Rate formatter + rate getter (supports different field names)
  const formatPeso = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return showVal(v);
    return `₱${n.toLocaleString()}`;
  };

  const getRateDisplay = (obj) => {
    // try common keys: rate, fee, consultationFee, consultation_rate, hourlyRate
    const raw =
      obj?.rate ??
      obj?.fee ??
      obj?.consultationFee ??
      obj?.consultation_rate ??
      obj?.hourlyRate;

    if (raw == null || String(raw).trim() === "") return "—";
    return formatPeso(raw);
  };

  /* ===========================
     ✅ FETCH FULL DOC ON OPEN
     =========================== */
  const consultantId = safeStr(data?.id);

  useEffect(() => {
    let cancelled = false;

    const fetchFullDoc = async () => {
      if (!visible) return;
      if (!consultantId) {
        setDocData(data || null);
        return;
      }

      setLoadingDoc(true);
      try {
        const snap = await getDoc(doc(db, "consultants", consultantId));
        if (cancelled) return;

        if (!snap.exists()) {
          setDocData(data || null);
          openCenterMsg(
            "error",
            "Not Found",
            "Consultant record not found in Firestore."
          );
        } else {
          setDocData({ id: consultantId, ...snap.data() });
        }
      } catch (e) {
        if (cancelled) return;
        setDocData(data || null);
        openCenterMsg("error", "Load Failed", "Unable to load consultant details.");
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    };

    fetchFullDoc();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, consultantId]);

  /* ===========================
     ✅ UPDATE STATUS
     =========================== */
  const validateBeforeUpdate = (statusRaw) => {
    const st = normalizeStatus(statusRaw);

    if (!consultantId) return "Document ID is missing.";
    if (st !== "accepted" && st !== "rejected") return "Invalid status value.";
    if (updating) return "Please wait… updating is in progress.";

    const current = normalizeStatus(docData?.status ?? data?.status);
    if (current !== "pending") return "This application is no longer pending.";

    return "";
  };

  const handleUpdate = async (statusRaw) => {
    const status = normalizeStatus(statusRaw);
    const err = validateBeforeUpdate(status);
    if (err) return openCenterMsg("error", "Cannot Update", err);

    setUpdating(true);

    try {
      await updateDoc(doc(db, "consultants", consultantId), { status });

      // update local view immediately
      setDocData((prev) => ({ ...(prev || {}), status }));

      // notify parent so it moves tabs immediately
      try {
        onStatusUpdated?.(consultantId, status);
      } catch {}

      openCenterMsg(
        "success",
        "Updated",
        status === "accepted"
          ? "Consultant approved successfully."
          : "Consultant application rejected."
      );

      setTimeout(() => {
        try {
          onClose?.();
        } catch {}
      }, 350);
    } catch (error) {
      console.error("Firestore update error:", error);
      openCenterMsg("error", "Update Failed", "Unable to update status. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  // ✅ Use Firestore doc if available, else fallback to passed data
  const viewData = docData || data;
  if (!viewData) return null;

  const currentStatus = normalizeStatus(viewData.status);

  const badgeBg =
    currentStatus === "accepted"
      ? "#E8F5E9"
      : currentStatus === "rejected"
      ? "#FEE2E2"
      : "#FFF3E0";

  const badgeTextColor =
    currentStatus === "accepted"
      ? "#2E7D32"
      : currentStatus === "rejected"
      ? "#991B1B"
      : "#E65100";

  const badgeLabel = currentStatus.toUpperCase();

  const availabilityArr = useMemo(() => {
    const a = viewData?.availability;
    return Array.isArray(a) ? a.filter(Boolean) : [];
  }, [viewData]);

  // ✅ NEW: computed rate label (called/displayed in UI)
  const rateDisplay = useMemo(() => getRateDisplay(viewData), [viewData]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.dragIndicator} />

          <View style={styles.modalHeader}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.title}>{showVal(viewData.fullName, "(No name)")}</Text>

              <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                <Text style={[styles.statusText, { color: badgeTextColor }]}>
                  {badgeLabel}
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeIconButton}>
              <Ionicons name="close-circle" size={32} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          {loadingDoc ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#01579B" />
              <Text style={styles.loaderText}>Loading details...</Text>
            </View>
          ) : (
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
                    <Ionicons name="mail" size={18} color="#01579B" style={styles.iconSpace} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Email Address</Text>
                      <Text style={styles.fieldValue}>{showVal(viewData.email)}</Text>
                    </View>
                  </View>

                  <View style={[styles.infoRow, { marginTop: 15 }]}>
                    <Ionicons name="location" size={18} color="#01579B" style={styles.iconSpace} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Complete Address</Text>
                      <Text style={styles.fieldValue}>{showVal(viewData.address)}</Text>
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
                      <Text style={styles.fieldValue}>{showVal(viewData.gender)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* 2. PROFESSIONAL CREDENTIALS */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Professional Credentials</Text>
                <View style={styles.infoCard}>
                  {/* ✅ UPDATED: show Specialization + Rate side-by-side */}
                  <View style={styles.detailGrid}>
                    <View style={[styles.gridItem, { paddingRight: 10 }]}>
                      <Text style={styles.fieldLabel}>Specialization</Text>
                      <Text style={styles.fieldValueBold}>
                        {showVal(viewData.specialization)}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { alignItems: "flex-end" }]}>
                      <Text style={styles.fieldLabel}>Rate</Text>
                      <Text style={styles.fieldValueBold}>{rateDisplay}</Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 15 }}>
                    <Text style={styles.fieldLabel}>Educational Attainment</Text>
                    <Text style={styles.fieldValue}>{showVal(viewData.education)}</Text>
                  </View>

                  {viewData.experience || viewData.licenseNumber ? (
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
                          {showVal(viewData.experience, "0")} Years
                        </Text>
                      </View>

                      <View style={[styles.gridItem, { alignItems: "flex-end" }]}>
                        <Text style={styles.fieldLabel}>License No.</Text>
                        <Text style={styles.fieldValue}>
                          {showVal(viewData.licenseNumber, "N/A")}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* 3. AVAILABILITY */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Working Availability</Text>
                <View style={styles.availabilityContainer}>
                  {availabilityArr.length > 0 ? (
                    availabilityArr.map((day, index) => (
                      <View key={`${day}-${index}`} style={styles.dayBadge}>
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

                {viewData.idFrontUrl ? (
                  <TouchableOpacity
                    style={styles.portfolioBtn}
                    onPress={() => openLink(viewData.idFrontUrl)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.portfolioContent}>
                      <Ionicons name="card-outline" size={24} color="#FFF" />
                      <View style={{ marginLeft: 12 }}>
                        <Text style={styles.portfolioBtnText}>Open Valid ID (Front)</Text>
                        <Text style={styles.portfolioBtnSub}>View front side of ID</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#FFF" />
                  </TouchableOpacity>
                ) : null}

                {viewData.idBackUrl ? (
                  <TouchableOpacity
                    style={[styles.portfolioBtn, { marginTop: 10 }]}
                    onPress={() => openLink(viewData.idBackUrl)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.portfolioContent}>
                      <Ionicons name="card-outline" size={24} color="#FFF" />
                      <View style={{ marginLeft: 12 }}>
                        <Text style={styles.portfolioBtnText}>Open Valid ID (Back)</Text>
                        <Text style={styles.portfolioBtnSub}>View back side of ID</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#FFF" />
                  </TouchableOpacity>
                ) : null}

                {viewData.selfieUrl ? (
                  <TouchableOpacity
                    style={[styles.portfolioBtn, { marginTop: 10 }]}
                    onPress={() => openLink(viewData.selfieUrl)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.portfolioContent}>
                      <Ionicons name="camera-outline" size={24} color="#FFF" />
                      <View style={{ marginLeft: 12 }}>
                        <Text style={styles.portfolioBtnText}>Open Selfie</Text>
                        <Text style={styles.portfolioBtnSub}>View selfie verification</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#FFF" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* ACTION BUTTONS */}
              <View style={styles.footerAction}>
                {currentStatus === "pending" ? (
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
                      name={currentStatus === "accepted" ? "checkmark-done-circle" : "close-circle"}
                      size={22}
                      color={currentStatus === "accepted" ? "#2E7D32" : "#EF4444"}
                    />
                    <Text
                      style={[
                        styles.completedText,
                        { color: currentStatus === "accepted" ? "#2E7D32" : "#EF4444" },
                      ]}
                    >
                      Application {currentStatus}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ✅ CENTER MESSAGE MODAL */}
        <CenterMessageModal
          visible={centerMsg.visible}
          type={centerMsg.type}
          title={centerMsg.title}
          message={centerMsg.message}
          onClose={closeCenterMsg}
        />
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

  loaderBox: {
    flex: 1,
    paddingTop: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderText: {
    marginTop: 10,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
  },
});
