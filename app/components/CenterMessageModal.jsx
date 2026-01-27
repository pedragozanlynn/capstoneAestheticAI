// app/components/CenterMessageModal.jsx
import React, { useEffect, useRef } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MSG_COLORS = {
  info: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "information-circle",
    iconColor: "#01579B",
  },
  success: {
    bg: "#ECFDF5",
    border: "#BBF7D0",
    icon: "checkmark-circle",
    iconColor: "#16A34A",
  },
  error: {
    bg: "#FEF2F2",
    border: "#FECACA",
    icon: "close-circle",
    iconColor: "#DC2626",
  },
};

export default function CenterMessageModal({
  visible,
  type = "info",
  title = "",
  body = "",
  autoHideMs = 1800,
  onClose,
}) {
  const timerRef = useRef(null);

  useEffect(() => {
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
    } catch {}

    if (visible && autoHideMs && autoHideMs > 0) {
      timerRef.current = setTimeout(() => onClose?.(), autoHideMs);
    }

    return () => {
      try {
        if (timerRef.current) clearTimeout(timerRef.current);
      } catch {}
    };
  }, [visible, autoHideMs, onClose]);

  const theme = MSG_COLORS[type] || MSG_COLORS.info;

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}
          onPress={() => {}}
        >
          <View style={styles.row}>
            <Ionicons name={theme.icon} size={22} color={theme.iconColor} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              {!!title && <Text style={styles.title}>{title}</Text>}
              {!!body && <Text style={styles.body}>{body}</Text>}
            </View>
          </View>

          <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={18} color="#475569" />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "ios" ? 120 : 80,
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    position: "relative",
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  title: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  body: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
  close: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
