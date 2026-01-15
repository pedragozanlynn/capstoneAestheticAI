// App.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect } from "react";
import { AppState } from "react-native";
import { db } from "./config/firebase";
import "./polyfills";

/* ================= AUTH ================= */
import ForgotPassword from "./app/ForgotPassword";
import Login from "./app/Login";
import Register from "./app/User/Register";

/* ================= CONSULTANT REGISTER ================= */
import Step1Register from "./app/Consultant/Step1Register";
import Step2Details from "./app/Consultant/Step2Details";
import Step3Review from "./app/Consultant/Step3Review";

/* ================= CONSULTANT APP ================= */
import EarningsScreen from "./app/Consultant/EarningsScreen";
import Homepage from "./app/Consultant/Homepage";
import Requests from "./app/Consultant/Requests";

/* ================= USER APP ================= */
import AIDesigner from "./app/User/AIDesigner";
import ChangePassword from "./app/User/ChangePassword";
import Consultants from "./app/User/Consultants";
import Consultations from "./app/User/Consultations";
import EditProfile from "./app/User/EditProfile";
import Home from "./app/User/Home";
import ManageSubscription from "./app/User/ManageSubscription";
import Profile from "./app/User/Profile";
import Projects from "./app/User/Projects";



/* ================= PREMIUM ================= */
import UpgradeInfo from "./app/User/UpgradeInfo";
import UpgradePayment from "./app/User/UpgradePayment";

/* ================= ADMIN ================= */
import ConsultantDetails from "./app/Admin/ConsultantDetails";
import Dashboard from "./app/Admin/Dashboard";
import Ratings from "./app/Admin/Ratings";
import Subscription from "./app/Admin/Subscription";
import Withdrawals from "./app/Admin/Withdrawals";

const Stack = createNativeStackNavigator();

export default function App() {
  /* ======================================================
     🔥 REAL ONLINE / OFFLINE PRESENCE (FINAL & CORRECT)
     ====================================================== */
  useEffect(() => {
    let appStateListener;

    const initPresence = async () => {
      try {
        /**
         * ✅ SINGLE SOURCE OF TRUTH
         * This key MUST be set on login (user OR consultant)
         */
        const uid = await AsyncStorage.getItem(
          "aestheticai:current-user-id"
        );

        const role = await AsyncStorage.getItem(
          "aestheticai:current-user-role"
        ); // "user" | "consultant"

        if (!uid || !role) return;

        const collectionName =
          role === "consultant" ? "consultants" : "users";

        const userRef = doc(db, collectionName, uid);

        const setOnline = async () => {
          await updateDoc(userRef, {
            isOnline: true,
            lastSeen: serverTimestamp(),
          });
        };

        const setOffline = async () => {
          await updateDoc(userRef, {
            isOnline: false,
            lastSeen: serverTimestamp(),
          });
        };

        // ✅ App opened
        await setOnline();

        // ✅ Listen to app background / foreground
        appStateListener = AppState.addEventListener(
          "change",
          (state) => {
            if (state === "active") {
              setOnline();
            } else {
              setOffline();
            }
          }
        );
      } catch (err) {
        console.log("❌ Presence error:", err);
      }
    };

    initPresence();

    return () => {
      appStateListener?.remove();
    };
  }, []);

  /* ======================================================
     🧭 NAVIGATION
     ====================================================== */
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      >
        {/* AUTH */}
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
        <Stack.Screen name="Register" component={Register} />

        {/* CONSULTANT REGISTER */}
        <Stack.Screen name="Step1Register" component={Step1Register} />
        <Stack.Screen name="Step2Details" component={Step2Details} />
        <Stack.Screen name="Step3Review" component={Step3Review} />

        {/* CONSULTANT APP */}
        <Stack.Screen name="Homepage" component={Homepage} />
        <Stack.Screen name="Requests" component={Requests} />
        <Stack.Screen
          name="EarningsScreen"
          component={EarningsScreen}
        />

        {/* USER APP */}
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="AIDesigner" component={AIDesigner} />
        <Stack.Screen name="Consultants" component={Consultants} />
        <Stack.Screen name="Projects" component={Projects} />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen
          name="Consultations"
          component={Consultations}
        />
        <Stack.Screen name="EditProfile" component={EditProfile}/>
        <Stack.Screen name="ChangePassword" component={ChangePassword}/>
        <Stack.Screen name="ManageSubscription" component={ManageSubscription}/>
         

        {/* PREMIUM */}
        <Stack.Screen
          name="UpgradeInfo"
          component={UpgradeInfo}
        />
        <Stack.Screen
          name="UpgradePayment"
          component={UpgradePayment}
        />

        {/* ADMIN */}
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen
          name="ConsultantDetails"
          component={ConsultantDetails}
        />
        <Stack.Screen
          name="Subscription"
          component={Subscription}
        />
        <Stack.Screen name="Ratings" component={Ratings} />
        <Stack.Screen
          name="Withdrawals"
          component={Withdrawals}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
