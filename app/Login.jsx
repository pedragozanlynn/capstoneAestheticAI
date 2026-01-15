import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../config/firebase";
import Button from "./components/Button";
import Input from "./components/Input";

/* ================= CONSTANTS ================= */
const ROLE_KEY_PREFIX = "aestheticai:user-role:";
const PROFILE_KEY_PREFIX = "aestheticai:user-profile:";

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialRole = params.role || "user";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const unsubscribeProfileRef = useRef(null);

  /* ================= ROLE LABEL ================= */
  const roleLabel =
    initialRole === "consultant" ? "Consultant" : "User";

  /* ================= CREATE ACCOUNT ================= */
  const goToRegister = () => {
    if (initialRole === "consultant") {
      router.push("/Consultant/Step1Register");
    } else {
      router.push("/User/Register");
    }
  };

  /* ================= HELPERS ================= */
  const cacheUserRole = async (uid, role) => {
    await AsyncStorage.setItem(`${ROLE_KEY_PREFIX}${uid}`, role);
  };

  const saveProfile = async (uid, profile) => {
    await AsyncStorage.setItem(
      `${PROFILE_KEY_PREFIX}${uid}`,
      JSON.stringify(profile)
    );
  };

  const detectSubscription = (data) => {
    const now = new Date();
    const expiresAt = data.subscription_expires_at?.toDate?.();
    return expiresAt && expiresAt > now ? "Premium" : "Free";
  };

  const fetchProfileFromFirestore = async (uid, role) => {
    let collection = "users";
    if (role === "consultant") collection = "consultants";
    if (role === "admin") collection = "admin";

    const snap = await getDoc(doc(db, collection, uid));
    if (!snap.exists()) return null;

    const data = snap.data();
    return { uid, ...data, subscription_type: detectSubscription(data) };
  };

  const subscribeToProfile = (uid, role) => {
    let collection = "users";
    if (role === "consultant") collection = "consultants";
    if (role === "admin") collection = "admin";

    return onSnapshot(doc(db, collection, uid), (snap) => {
      if (snap.exists()) {
        saveProfile(uid, { uid, ...snap.data() });
      }
    });
  };

  /* ================= LOGIN ================= */
  const login = async () => {
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const uid = credential.user.uid;

      const profile = await fetchProfileFromFirestore(uid, initialRole);
      if (!profile) {
        Alert.alert("No Profile", "Please register your account first.");
        return;
      }

      if (initialRole === "consultant") {
        if (profile.status === "pending") {
          Alert.alert("Pending Approval", "Please wait for admin approval.");
          return;
        }
        if (profile.status === "rejected") {
          Alert.alert("Registration Rejected", "Please contact admin.");
          return;
        }
      }

      await AsyncStorage.setItem("aestheticai:current-user-id", uid);
      await AsyncStorage.setItem(
        "aestheticai:current-user-role",
        initialRole
      );

      if (initialRole === "user") {
        await AsyncStorage.setItem("userUid", uid);
      } else if (initialRole === "consultant") {
        await AsyncStorage.setItem("consultantUid", uid);
      }

      await cacheUserRole(uid, initialRole);
      await saveProfile(uid, profile);

      unsubscribeProfileRef.current = subscribeToProfile(uid, initialRole);

      Alert.alert(
        "Login Successful",
        `Welcome back, ${profile.fullName || profile.name || "User"}!`,
        [
          {
            text: "Continue",
            onPress: () => {
              if (initialRole === "user") {
                router.replace("/User/Home");
              } else {
                router.replace("/Consultant/Homepage");
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert("Login Error", "Invalid email or password.");
    }
  };

  useEffect(() => {
    return () => unsubscribeProfileRef.current?.();
  }, []);

  /* ================= UI ================= */
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.header}>
        <Image
          source={require("../assets/new_background.jpg")}
          style={styles.image}
        />

        <TouchableOpacity
          onPress={() => router.push("/")}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Welcome Back</Text>

          {/* ✅ HIGHLIGHTED ROLE */}
          <Text style={styles.subtitle}>
            Sign in to continue as{" "}
            <Text style={styles.roleHighlight}>{roleLabel}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Account Information</Text>

        <Input
          placeholder="Email"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Input
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity onPress={() => router.push("/ForgotPassword")}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <Button title="Login" onPress={login} />

        <View style={{ marginTop: 20, alignItems: "center" }}>
          <TouchableOpacity onPress={goToRegister}>
            <Text style={{ color: "#01579B", fontWeight: "700" }}>
              Create an account
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  header: { height: 360 },
  image: { width: "100%", height: "100%" },

  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
  },

  headerTextContainer: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    alignItems: "center",
  },

  title: { fontSize: 30, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 14, color: "#eee", marginTop: 6 },

  /* ✅ ROLE HIGHLIGHT */
  roleHighlight: {
    color: "#F3F9FA",
    fontWeight: "700",
    letterSpacing: 0.5,
    fontSize: 18,
  },

  content: {
    flex: 1,
    marginTop: -40,
    padding: 40,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
  },

  forgotText: {
    color: "#912f56",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 16,
  },
});
