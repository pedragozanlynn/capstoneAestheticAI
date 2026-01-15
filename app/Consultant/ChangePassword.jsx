import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from "firebase/auth";

import Button from "../components/Button";
import Input from "../components/Input";

export default function ConsultantChangePassword() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Validation", "Please fill in all fields.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      await signOut(auth);
      await AsyncStorage.multiRemove([
        "aestheticai:current-user-id",
        "aestheticai:current-user-role",
      ]);

      Alert.alert(
        "Password Updated ✅",
        "Please login again using your new password.",
        [{ text: "OK", onPress: () => router.replace("/Login") }]
      );
    } catch (error) {
      console.log("Change password error:", error);
      if (error.code === "auth/wrong-password") {
        Alert.alert("Error", "Current password is incorrect.");
      } else if (error.code === "auth/too-many-requests") {
        Alert.alert("Too Many Attempts", "Please try again later.");
      } else {
        Alert.alert("Error", "Failed to update password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Tinitiyak na ang status bar ay hindi translucent para hindi mag-overlap ang content */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />
      
      {/* 2. SafeAreaView para sa iOS Notch at Android Top Spacing */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={router.back}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Change Password</Text>
            <Text style={styles.headerSubtitle}>Secure your consultant account</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
      </SafeAreaView>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.content}
      >
        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
          <Text style={styles.infoText}>
            Updating your password will log you out from all devices for security.
          </Text>
        </View>

        <View style={styles.card}>
          <Input
            label="Current Password"
            placeholder="Enter current password"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            icon={<Ionicons name="lock-closed" size={18} color="#94A3B8" />}
          />

          <View style={styles.inputDivider} />

          <Input
            label="New Password"
            placeholder="Enter new password"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            icon={<Ionicons name="key" size={18} color="#94A3B8" />}
          />

          <Input
            label="Confirm New Password"
            placeholder="Confirm new password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            icon={<Ionicons name="checkmark-circle" size={18} color="#94A3B8" />}
          />
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={loading ? "Processing..." : "Update Password"}
            onPress={handleChangePassword}
            disabled={loading}
            backgroundColor="#0F3E48"
            textColor="#fff"
            style={styles.submitBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  safeArea: {
    backgroundColor: "#FFF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    // 3. Binawasan ang vertical padding mula 30 dahil sa SafeAreaView
    paddingVertical: Platform.OS === 'android' ? 15 : 10,
    backgroundColor: "#FFF",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F3E48",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  content: {
    flex: 1,
    padding: 20,
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
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  inputDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 10,
  },
  buttonContainer: {
    marginTop: "auto",
    paddingBottom: 20,
  },
  submitBtn: {
    borderRadius: 16,
    height: 56,
  },
});