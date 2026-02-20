// BottomNavbar.jsx
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  Pressable,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function BottomNavbar({
  consultationNotifications = 0,
  role = "user",
  subType = "Free",
  disabled = false, // ✅ NEW: block taps during logout or transitions
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const userTabs = useMemo(
    () => [
      { name: "Home", icon: "home", routePath: "/User/Home" },
      { name: "AI Designer", icon: "color-palette", routePath: "/User/AIDesigner" },
      { name: "Consultants", icon: "chatbubbles", routePath: "/User/Consultants" },
      { name: "Projects", icon: "albums", routePath: "/User/Projects" },
      { name: "Profile", icon: "person", routePath: "/User/Profile" },
    ],
    []
  );

  const consultantTabs = useMemo(
    () => [
      { name: "Homepage", icon: "home", routePath: "/Consultant/Homepage" },
      { name: "Requests", icon: "people", routePath: "/Consultant/Requests" },
      { name: "My Clients", icon: "chatbubble", routePath: "/Consultant/ChatList" },
      { name: "Earnings", icon: "wallet", routePath: "/Consultant/EarningsScreen" },
      { name: "Profile", icon: "person", routePath: "/Consultant/Profile" },
    ],
    []
  );

  const adminTabs = useMemo(
    () => [
      { name: "Home", icon: "speedometer", routePath: "/Admin/Dashboard" },
      { name: "Withdrawals", icon: "cash", routePath: "/Admin/Withdrawals" },
      { name: "Consultants", icon: "briefcase", routePath: "/Admin/Consultants" },
      { name: "Transactions", icon: "wallet", routePath: "/Admin/Transactions" },
    ],
    []
  );

  const tabs = role === "admin" ? adminTabs : role === "consultant" ? consultantTabs : userTabs;

  // ✅ keep anim array length stable
  const scaleAnim = useRef([]);
  if (scaleAnim.current.length !== tabs.length) {
    scaleAnim.current = tabs.map(() => new Animated.Value(1));
  }

  // ✅ prevent any delayed animation callback from navigating after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handlePressIn = (index) => {
    if (disabled) return;
    Animated.spring(scaleAnim.current[index], {
      toValue: 0.92,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (index) => {
    Animated.spring(scaleAnim.current[index], {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const safeBottom = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 0);
  const wrapperBottom = safeBottom;

  const isActive = (routePath) => {
    const p = String(pathname || "").toLowerCase();
    const r = String(routePath || "").toLowerCase();
    return p === r || p.startsWith(r + "/"); // ✅ works for nested
  };

  const activeColor = "#008080";
  const inactiveColor = "#0F3E48";

  const goTo = (routePath) => {
    if (disabled) return;
    if (!mountedRef.current) return;

    // ✅ prevent extra stacks & reduce navigator weirdness
    if (isActive(routePath)) return;

    // ✅ replace is safer for tabs
    router.replace(routePath);
  };

  return (
    <View style={[styles.wrapper, { bottom: wrapperBottom }]}>
      <View style={styles.container}>
        {tabs.map((tab, index) => {
          const active = isActive(tab.routePath);

          return (
            <Pressable
              key={tab.name}
              onPressIn={() => handlePressIn(index)}
              onPressOut={() => handlePressOut(index)}
              onPress={() => goTo(tab.routePath)} // ✅ ONLY onPress navigates
              disabled={disabled}
              style={{ flex: 1 }}
            >
              <Animated.View style={[styles.tabButton, { transform: [{ scale: scaleAnim.current[index] }] }]}>
                {active && <View style={[styles.activeIndicator, { backgroundColor: activeColor }]} />}

                <Ionicons
                  name={active ? tab.icon : `${tab.icon}-outline`}
                  size={26}
                  color={active ? activeColor : inactiveColor}
                />

                <Text
                  style={[
                    styles.tabText,
                    {
                      color: active ? activeColor : inactiveColor,
                      fontWeight: active ? "700" : "500",
                      opacity: active ? 1 : 0.8,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {tab.name}
                </Text>

                {tab.name === "Consultants" && consultationNotifications > 0 && role === "user" && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{consultationNotifications}</Text>
                  </View>
                )}
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    width: width,
    alignItems: "center",
  },
  container: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: width - 20,
    height: 70,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 8,
    paddingHorizontal: 10,
  },
  tabButton: {
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
  activeIndicator: {
    position: "absolute",
    top: 8,
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  tabText: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 12,
    right: "15%",
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  badgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
  },
});