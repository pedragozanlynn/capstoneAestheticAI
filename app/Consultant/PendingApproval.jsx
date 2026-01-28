import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StatusBar, // ✅ ADDED
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../config/firebase";

export default function PendingApproval() {
  const router = useRouter();

  // pending | accepted | rejected
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);

  const unsubRef = useRef(null);
  const redirectedRef = useRef(false);

  const safeLower = (v) => String(v || "").trim().toLowerCase();

  const cleanup = () => {
    try {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    } catch {}
  };

  const goBack = async () => {
    try {
      await AsyncStorage.multiRemove([
        "aestheticai:current-user-id",
        "aestheticai:current-user-role",
        "consultantUid",
        "userUid",
        "step1Data",
        "step2Data",
      ]);
    } catch {}

    try {
      await signOut(auth);
    } catch {}

    // ✅ BACK -> index.jsx (root)
    router.replace("/");
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      try {
        // ✅ PRIMARY: firebase auth current user
        let uid = auth.currentUser?.uid || "";

        // ✅ fallback to storage (if you still want)
        if (!uid) {
          uid =
            (await AsyncStorage.getItem("consultantUid")) ||
            (await AsyncStorage.getItem("aestheticai:current-user-id")) ||
            "";
        }

        if (!uid) {
          setLoading(false);
          Alert.alert("Session expired", "Please log in again.", [
            { text: "OK", onPress: goBack },
          ]);
          return;
        }

        // ✅ optional: cache it so future opens are safe
        try {
          await AsyncStorage.setItem("consultantUid", uid);
          await AsyncStorage.setItem("aestheticai:current-user-id", uid);
        } catch {}

        const ref = doc(db, "consultants", uid);

        unsubRef.current = onSnapshot(
          ref,
          (snap) => {
            setLoading(false);

            if (!snap.exists()) {
              setStatus("pending");
              return;
            }

            const data = snap.data();
            const s = safeLower(data?.status);

            if (s === "accepted") {
              setStatus("accepted");
              if (!redirectedRef.current) {
                redirectedRef.current = true;
                cleanup();
                router.replace("/Consultant/Homepage");
              }
              return;
            }

            if (s === "rejected") {
              setStatus("rejected");
              return;
            }

            setStatus("pending");
          },
          (err) => {
            setLoading(false);
            console.log("STATUS LISTENER ERROR:", err?.code || err?.message || err);
            Alert.alert(
              "Error",
              "Unable to check approval status. Please try again.",
              [{ text: "Go Back", onPress: goBack }]
            );
          }
        );
      } catch (e) {
        setLoading(false);
        console.log("PENDING INIT ERROR:", e?.message || e);
        Alert.alert("Error", "Something went wrong while checking your status.", [
          { text: "Go Back", onPress: goBack },
        ]);
      }
    };

    init();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===========================
     ✅ 2 "Pages" in ONE file
     =========================== */
  const PendingPage = () => (
    <View style={styles.card}>
      <Ionicons
        name="stopwatch-outline"
        size={48}
        color="#0F3E48"
        style={styles.icon}
      />
      <Text style={styles.title}>Pending Approval</Text>
      <Text style={styles.message}>
        Your consultant registration has been submitted and is awaiting admin
        approval.
      </Text>
      <Text style={styles.note}>
        You’ll receive access once your account is approved by the admin.
      </Text>

      <TouchableOpacity style={styles.button} onPress={goBack} activeOpacity={0.85}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons
            name="arrow-back"
            size={20}
            color="#fff"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.buttonText}>Go Back</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const RejectedPage = () => (
    <View style={styles.card}>
      <Ionicons
        name="close-circle-outline"
        size={50}
        color="#B91C1C"
        style={styles.icon}
      />
      <Text style={[styles.title, { color: "#B91C1C" }]}>
        Application Rejected
      </Text>
      <Text style={styles.message}>
        Your consultant registration was not approved by the admin.
      </Text>
      <Text style={styles.note}>
        If you believe this is a mistake, please contact the admin for
        clarification.
      </Text>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#B91C1C" }]}
        onPress={goBack}
        activeOpacity={0.85}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons
            name="arrow-back"
            size={20}
            color="#fff"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.buttonText}>Go Back</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ✅ ADDED STATUS BAR (no other UI/logic changes) */}
      <StatusBar barStyle="dark-content" backgroundColor="#faf9f6" />

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator
            size="large"
            color="#0F3E48"
            style={{ marginBottom: 14 }}
          />
          <Text style={styles.title}>Checking status...</Text>
          <Text style={styles.note}>
            Please wait while we verify your application.
          </Text>
        </View>
      ) : status === "rejected" ? (
        <RejectedPage />
      ) : (
        // default: pending page (also covers unknown status)
        <PendingPage />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
    backgroundColor: "#faf9f6",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    width: "100%",
  },
  icon: { marginBottom: 15 },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0F3E48",
    marginBottom: 15,
    textAlign: "center",
  },
  message: {
    textAlign: "center",
    fontSize: 16,
    color: "#333",
    marginBottom: 10,
    lineHeight: 22,
  },
  note: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 20,
  },
  button: {
    backgroundColor: "#0F3E48",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
