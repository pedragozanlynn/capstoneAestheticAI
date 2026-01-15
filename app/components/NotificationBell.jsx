// components/NotificationBell.jsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { auth } from "../../config/firebase";
import { useNotifications } from "../../hooks/useNotification";

export default function NotificationBell() {
  const userId = auth.currentUser?.uid;
  const { unread } = useNotifications(userId);
  const router = useRouter();

  return (
    <TouchableOpacity
      style={{ marginRight: 15 }}
      onPress={() => router.push("/notifications")}
    >
      <Ionicons name="notifications-outline" size={28} color="#333" />

      {unread > 0 && (
        <View
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            backgroundColor: "red",
            borderRadius: 10,
            paddingHorizontal: 6,
            paddingVertical: 1,
          }}
        >
          <Text style={{ color: "white", fontSize: 12 }}>{unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
