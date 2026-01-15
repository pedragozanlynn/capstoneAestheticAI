import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { markNotificationAsRead, useNotifications } from "../../hooks/useNotification";


export default function NotificationList() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Load logged-in user
  useEffect(() => {
    const loadUser = async () => {
      const keys = await AsyncStorage.getAllKeys();
      const profileKey = keys.find((k) =>
        k.startsWith("aestheticai:user-profile:")
      );
      if (!profileKey) return;

      const data = await AsyncStorage.getItem(profileKey);
      setUser(JSON.parse(data));
    };

    loadUser();
  }, []);

  const { notifications } = useNotifications(user?.uid);

  const openNotif = async (notif) => {
    await markNotificationAsRead(user.uid, notif.id);

    if (notif.link) {
      router.push(notif.link); // Go to linked screen
    }
  };

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Notifications</Text>

      <ScrollView>
        {notifications.length === 0 ? (
          <Text style={styles.noNotif}>No notifications yet</Text>
        ) : (
          notifications.map((notif) => (
            <TouchableOpacity
              key={notif.id}
              style={[styles.card, !notif.isRead && styles.unreadCard]}
              onPress={() => openNotif(notif)}
            >
              <Ionicons
                name={notif.isRead ? "notifications-outline" : "notifications"}
                size={22}
                color="#0F3E48"
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.message}>{notif.message}</Text>
                <Text style={styles.date}>
                  {new Date(notif.createdAt?.seconds * 1000).toLocaleString()}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, backgroundColor: "#F3F9FA" },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0F3E48",
    marginBottom: 20,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: "#E7F4F6",
  },
  message: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0E3E48",
  },
  date: { fontSize: 12, color: "#888", marginTop: 4 },
  noNotif: {
    marginTop: 40,
    textAlign: "center",
    color: "#888",
    fontStyle: "italic",
  },
});
