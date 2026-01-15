import React, { useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import Button from "../components/Button";
import Input from "../components/Input";

export default function ChangePassword() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /* ================= CHANGE PASSWORD LOGIC ================= */
  const handleChangePassword = async () => {
    // 1. Validation: Check if fields are empty
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Validation", "Please fill in all fields");
      return;
    }

    // 2. Validation: Length check
    if (newPassword.length < 6) {
      Alert.alert("Weak Password", "New password must be at least 6 characters");
      return;
    }

    // 3. Validation: Match check
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New passwords do not match");
      return;
    }

    // 4. Firebase Process
    try {
      setLoading(true);

      // A. Create credential for re-authentication
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      // B. Re-authenticate (Required by Firebase for password changes)
      await reauthenticateWithCredential(user, credential);

      // C. Update the password
      await updatePassword(user, newPassword);

      Alert.alert("Success", "Your password has been updated successfully!", [
        { text: "OK", onPress: () => router.back() }
      ]);
      
    } catch (e) {
      console.log("Change password error:", e.code, e.message);

      // Error Handling
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        Alert.alert("Error", "The current password you entered is incorrect.");
      } else if (e.code === "auth/too-many-requests") {
        Alert.alert("Error", "Too many failed attempts. Please try again later.");
      } else {
        Alert.alert("Error", "Failed to change password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* ===== HEADER ===== */}
        <View style={styles.profileHeaderRow}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#0F3E48" />
          </TouchableOpacity>

          <View>
            <Text style={styles.profileHeaderTitle}>Change Password</Text>
            <Text style={styles.profileHeaderSubtitle}>
              Update your account security
            </Text>
          </View>
        </View>

        <View style={styles.profileHeaderDivider} />
        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
          <Text style={styles.infoText}>
            Updating your password will log you out from all devices for security.
          </Text>
        </View>

        {/* ===== FORM CARD ===== */}
        <View style={styles.card}>
          <Input
            label="Current Password"
            placeholder="Enter current password"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            icon={<Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />}
          />

          <View style={{ height: 15 }} />

          <Input
            label="New Password"
            placeholder="Minimum 6 characters"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            icon={<Ionicons name="key-outline" size={18} color="#9CA3AF" />}
          />

          <View style={{ height: 15 }} />

          <Input
            label="Confirm New Password"
            placeholder="Repeat new password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            icon={<Ionicons name="shield-checkmark-outline" size={18} color="#9CA3AF" />}
          />
        </View>

        {/* ===== SAVE BUTTON ===== */}
        <Button
          title={loading ? "Updating..." : "Update Password"}
          onPress={handleChangePassword}
          disabled={loading}
          backgroundColor="#0F3E48"
          textColor="#fff"
          icon={
            loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="shield-outline" size={20} color="#fff" />
            )
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    padding: 20,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  profileHeaderTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F3E48",
  },
  profileHeaderSubtitle: {
    fontSize: 13,
    color: "#777",
  },
  profileHeaderDivider: {
    height: 1,
    backgroundColor: "#E4E6EB",
    marginBottom: 25,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#F0FDFA",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    marginBottom: 20,
    alignItems: "center",
  },
  infoText: {
    fontSize: 12,
    color: "#0D9488",
    marginLeft: 10,
    flex: 1,
    fontWeight: "500",
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
});