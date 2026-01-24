// BottomNavbar.jsx
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const { width } = Dimensions.get("window");

export default function BottomNavbar({
  consultationNotifications = 0,
  role = "user",
  subType = "Free",
}) {
  const router = useRouter();
  const pathname = usePathname();

  const userTabs = [
    { name: "Home", icon: "home", routePath: "/User/Home" },
    { name: "AI Designer", icon: "color-palette", routePath: "/User/AIDesigner" },
    { name: "Consultants", icon: "chatbubbles", routePath: "/User/Consultants" },
    { name: "Projects", icon: "albums", routePath: "/User/Projects" },
    { name: "Profile", icon: "person", routePath: "/User/Profile" },
  ];

  const consultantTabs = [
    { name: "Homepage", icon: "home", routePath: "/Consultant/Homepage" },
    { name: "Requests", icon: "people", routePath: "/Consultant/Requests" },
    { name: "My Clients", icon: "chatbubble", routePath: "/Consultant/ChatList" },
    { name: "Earnings", icon: "wallet", routePath: "/Consultant/EarningsScreen" },
    { name: "Profile", icon: "person", routePath: "/Consultant/Profile" },
  ];

  const adminTabs = [
    { name: "Home", icon: "speedometer", routePath: "/Admin/Dashboard" },
    { name: "Withdrawals", icon: "cash", routePath: "/Admin/Withdrawals" },
    { name: "Consultants", icon: "briefcase", routePath: "/Admin/Consultants" },
    { name: "Subscription", icon: "wallet", routePath: "/Admin/Subscription" },
  ];

  const tabs =
    role === "admin" ? adminTabs : role === "consultant" ? consultantTabs : userTabs;

  const scaleAnim = useRef(tabs.map(() => new Animated.Value(1))).current;

  const handlePressIn = (index) => {
    Animated.spring(scaleAnim[index], {
      toValue: 0.92,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (index, tab) => {
    Animated.spring(scaleAnim[index], {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start(() => {
      // INALIS ANG UPGRADE REDIRECT DITO
      router.push(tab.routePath);
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {tabs.map((tab, index) => {
          const isActive = pathname?.toLowerCase() === tab.routePath?.toLowerCase();
          
          const activeColor = "#008080"; 
          const inactiveColor = "#0F3E48";

          return (
            <TouchableWithoutFeedback
              key={tab.name}
              onPressIn={() => handlePressIn(index)}
              onPressOut={() => handlePressOut(index, tab)}
            >
              <Animated.View
                style={[
                  styles.tabButton,
                  { transform: [{ scale: scaleAnim[index] }] },
                ]}
              >
                {isActive && <View style={[styles.activeIndicator, { backgroundColor: activeColor }]} />}
                
                <Ionicons
                  name={isActive ? tab.icon : `${tab.icon}-outline`}
                  size={26}
                  color={isActive ? activeColor : inactiveColor}
                />

                <Text
                  style={[
                    styles.tabText,
                    { 
                        color: isActive ? activeColor : inactiveColor, 
                        fontWeight: isActive ? "700" : "500",
                        opacity: isActive ? 1 : 0.8
                    },
                  ]}
                >
                  {tab.name}
                </Text>

                {tab.name === "Consultants" &&
                  consultationNotifications > 0 &&
                  role === "user" && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {consultationNotifications}
                      </Text>
                    </View>
                  )}
              </Animated.View>
            </TouchableWithoutFeedback>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 15,
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
    flex: 1,
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