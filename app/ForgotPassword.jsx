import React, { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  StyleSheet, 
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../config/firebase"; // Siguraduhing tama ang path
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert("Input Required", "Please enter your email address to receive the reset link.");
      return;
    }

    try {
      setLoading(true);
      // Firebase Logic: Ito ang magpapadala ng actual email
      await sendPasswordResetEmail(auth, email.trim());
      
      Alert.alert(
        "Check Your Email",
        "A password reset link has been sent. Please check your inbox (and spam folder).",
        [{ text: "OK", onPress: () => router.push("/Login") }]
      );
    } catch (error) {
      console.log(error.code);
      let errorMessage = "Something went wrong. Please try again.";
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Please enter a valid email address.";
      }
      
      Alert.alert("Reset Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />
      
      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={28} color="#000" />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Icon & Header */}
        <View style={styles.iconCircle}>
          <Ionicons name="key-outline" size={40} color="#01579B" />
        </View>
        
        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter your registered email below to receive password reset instructions.
        </Text>

        {/* Input Field */}
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={onResetPassword}
          disabled={loading}
          style={[styles.button, loading && styles.disabledButton]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        {/* Footer */}
        <TouchableOpacity onPress={() => router.push("/Login")} style={styles.backToLogin}>
          <Text style={styles.backToLoginText}>
            Remember your password? <Text style={styles.loginLink}>Login</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDFEFF",
  },
  backButton: {
    marginTop: Platform.OS === "ios" ? 50 : 20,
    marginLeft: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -50, // Pull up slightly for better visual balance
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F0F7FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    color: "#000",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 35,
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 20,
    height: 60,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  button: {
    backgroundColor: "#01579B",
    width: "100%",
    height: 60,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#01579B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  backToLogin: {
    marginTop: 25,
  },
  backToLoginText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
  },
  loginLink: {
    color: "#01579B",
    fontWeight: "800",
  },
});