// app/components/CenterMessageModal.jsx
import React, { useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MSG_COLORS = {
  info: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "information-circle",
    iconColor: "#01579B",
    iconBg: "rgba(1,87,155,0.10)",
    iconBorder: "rgba(1,87,155,0.18)",
  },
  success: {
    bg: "#ECFDF5",
    border: "#BBF7D0",
    icon: "checkmark-circle",
    iconColor: "#16A34A",
    iconBg: "rgba(22,163,74,0.10)",
    iconBorder: "rgba(22,163,74,0.18)",
  },
  warning: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    icon: "warning",
    iconColor: "#F59E0B",
    iconBg: "rgba(245,158,11,0.12)",
    iconBorder: "rgba(245,158,11,0.22)",
  },
  error: {
    bg: "#FEF2F2",
    border: "#FECACA",
    icon: "close-circle",
    iconColor: "#DC2626",
    iconBg: "rgba(220,38,38,0.10)",
    iconBorder: "rgba(220,38,38,0.18)",
  },
};

export default function CenterMessageModal({
  visible,
  type = "info",
  title = "",
  body,
  message,
  autoHideMs = 1800,
  onClose,
  dismissOnBackdrop = true,
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
  const contentText = String(body ?? message ?? "");

  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <Pressable
        style={styles.backdrop}
        onPress={dismissOnBackdrop ? onClose : undefined}
      >
        <Pressable
          style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}
          onPress={() => {}}
        >
          <View style={styles.row}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.iconBg, borderColor: theme.iconBorder },
              ]}
            >
              <Ionicons name={theme.icon} size={24} color={theme.iconColor} />
            </View>

            <View style={styles.textWrap}>
              {!!title && <Text style={styles.title}>{String(title)}</Text>}
              {!!contentText && <Text style={styles.body}>{contentText}</Text>}
            </View>
          </View>
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
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  textWrap: {
    flex: 1,
    marginLeft: 10,
  },
  title: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  body: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    lineHeight: 18,
  },
});
