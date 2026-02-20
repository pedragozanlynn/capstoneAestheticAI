import React, { useMemo } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PolicyModal({
  visible,
  onClose,
  onAccept,
  variant = "user", // "user" | "consultant"
}) {
  const handleAccept = () => {
    if (onAccept) onAccept();
    if (onClose) onClose();
  };

  const content = useMemo(() => {
    if (variant === "consultant") {
      return {
        title: "Privacy Policy ",
        body:
          "This Privacy Policy explains how consultant registration information is collected and used.\n\n" +
          "1. We collect your name, email, and other submitted details for account creation and verification.\n\n" +
          "2. Your consultant profile information may be reviewed for approval and platform compliance.\n\n" +
          "2.1. Verification may be required. You may be asked to upload a valid government-issued ID and a selfie for identity verification.\n\n" +
          "2.2. These verification files may be reviewed to confirm authenticity and eligibility, and may be stored securely for compliance, fraud prevention, and platform safety.\n\n" +
          "3. Consultation chats, shared images, and appointment details may be stored to support communication and service delivery.\n\n" +
          "4. Do not submit sensitive personal information (passwords, bank PINs, or unrelated confidential data) in chats or uploads beyond the required verification documents.\n\n" +
          "5. We do not sell personal information. Access may be limited to authorized staff or systems necessary to operate and secure the service.\n\n" +
          "6. Verification documents may be retained only as long as necessary for approval processing, compliance, and fraud prevention, and may be securely deleted in accordance with platform policies.\n\n" +
          "7. You may request updates or removal of your data subject to platform requirements and legal obligations.\n\n" +
          "By tapping “I Agree”, you consent to the collection and processing of your information for consultant onboarding, identity verification, and service operations.",
        agreeText: "I Agree",
      };
      
    }

    return {
      title: "Privacy & User Agreement",
      body:
        "1. We collect your email for login and account identification.\n\n" +
        "2. Uploaded room images and saved designs are stored to generate AI suggestions and project history.\n\n" +
        "3. AI suggestions are provided by third-party AI models and may not be 100% accurate.\n\n" +
        "4. Please do not upload sensitive personal information (IDs, passwords, bank details).\n\n" +
        "5. Consultation chats, shared images, and appointment details may be stored to support communication.\n\n" +
        "6. Some consultation services inside the platform may require payment. Fees will be shown before booking and are handled between the user and consultant.\n\n" +
        "7. By tapping “I Agree”, you consent to the use of your data for AI features and consultation services within the system.",
      agreeText: "I Agree",
    };
  }, [variant]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <SafeAreaView edges={[]} style={styles.cardInner}>
            {/* Top Divider */}
            <View style={styles.topDivider} />

            {/* Title */}
            <Text style={styles.title}>{content.title}</Text>

            {/* Body */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.policyText}>{content.body}</Text>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity onPress={onClose} style={styles.btnGhost} activeOpacity={0.9}>
                <Text style={styles.btnGhostText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleAccept} style={styles.btnPrimary} activeOpacity={0.9}>
                <Text style={styles.btnPrimaryText}>{content.agreeText}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    overflow: "hidden",

    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  cardInner: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 0,
  },

  /* NEW divider */
  topDivider: {
    height: 4,
    width: 60,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 14,
  },

  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },

  scrollArea: {
    maxHeight: 340,
  },
  scrollContent: {
    paddingBottom: 6,
  },

  policyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#374151",
    fontWeight: "500",
  },

  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(17,24,39,0.08)",
  },

  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.18)",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  btnGhostText: {
    color: "#111827",
    fontWeight: "800",
  },

  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#0F3E48",
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});
