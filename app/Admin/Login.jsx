import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleAdminLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      const adminDoc = await getDoc(doc(db, "admin", uid));
      if (adminDoc.exists()) {
        Alert.alert("Success", "Admin login successful!");
        router.replace("/Admin/Dashboard");
      } else {
        Alert.alert("Unauthorized", "You are not authorized as admin.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", error.message || "Something went wrong");
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      {/* Header with background image */}
      <View style={styles.header}>
        <Image source={require("../../assets/new_background.jpg")} style={styles.image} />
<TouchableOpacity 
  onPress={() => router.replace("/")} // Ito ang magpapabalik sa index page
  style={styles.backButton}
>
  <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
</TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Admin Login</Text>
          <Text style={styles.subtitle}>Sign in to access the dashboard</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Account Information</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleAdminLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { width: "100%", height: 300, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
  },
  headerTextContainer: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    transform: [{ translateY: -20 }],
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  subtitle: {
    fontSize: 14,
    color: "#f5f5f5",
    textAlign: "center",
    fontWeight: "500",
    marginTop: 6,
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  content: {
    flex: 1,
    paddingTop: 32,
    marginTop: -40,
    paddingHorizontal: 40,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2c4f4f",
    marginBottom: 10,
    marginLeft: 6,
    letterSpacing: 0.3,
    paddingBottom: 2,
  },
  input: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dce3ea",
    fontSize: 14,
    marginBottom: 16,
    color: "#2c3e50",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  button: {
    backgroundColor: "#0F3E48",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
