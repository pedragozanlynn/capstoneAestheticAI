// app/User/ManageSubscription.jsx
// ✅ FIXED LOGIC (Manual Payment Renewal) + ✅ RENEW NOTIFICATION
// - Cancel = stop renewal prompt; user stays premium until expiry
// - If NOT cancelled and renewal is due/near: show "Renew?" modal (manual payment prompt)
// - ✅ Also writes a notification once per billing period when renewal is due/near
// - Auto-downgrade to Free when subscription_expires_at has passed
// - Guard: renew modal/notification shows once per billing period using users/{uid}.renew_prompted_for_expires_at
// - No UI redesign; logic additions only

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../config/firebase";

export default function ManageSubscription() {
  const router = useRouter();
  const auth = getAuth();

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // ✅ guards (prevents alert spam)
  const didWarnNoAuth = useRef(false);
  const didWarnNoUserData = useRef(false);
  const didWarnLoadError = useRef(false);

  const uid = auth.currentUser?.uid;

  const formatNumericDate = useCallback((firebaseTimestamp) => {
    try {
      if (!firebaseTimestamp?.toDate) return "—";
      return firebaseTimestamp.toDate().toLocaleDateString("en-US");
    } catch {
      return "—";
    }
  }, []);

  const tsToMs = (ts) => {
    try {
      if (!ts) return 0;
      if (ts?.toDate) return ts.toDate().getTime();
      const d = new Date(ts);
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : 0;
    } catch {
      return 0;
    }
  };

  /**
   * ✅ Manual-renew policy:
   * - show renewal prompt + notification when expiry is due/near AND not cancelled
   * - "near" window: 24 hours before expiry (adjust as you like)
   */
  const RENEW_PROMPT_WINDOW_MS = 24 * 60 * 60 * 1000;

  const writeRenewalNotificationOnce = useCallback(
    async ({ expiresAtMs, expiresAtTs }) => {
      if (!uid || !expiresAtMs) return;

      // ✅ deterministic id => no duplicate spam for the same billing period
      const notifId = `renew_${uid}_${expiresAtMs}`;

      const endText = formatNumericDate(expiresAtTs);

      await setDoc(
        doc(db, "notifications", notifId),
        {
          userId: uid,
          createdAt: serverTimestamp(),
          read: false,

          // keep it consistent with your Notifications screen mapping
          type: "reminder_renewal",
          title: "Subscription Renewal Reminder",
          message:
            endText !== "—"
              ? `Your Premium plan will end on ${endText}. Renew manually to keep Premium access.`
              : "Your Premium plan is ending soon. Renew manually to keep Premium access.",

          // optional metadata
          appointmentAt: null,
          consultantId: "",
          expiresAt: expiresAtTs || null,

          _system: true,
        },
        { merge: true }
      );
    },
    [formatNumericDate, uid]
  );

  const enforceExpiryAndMaybePromptRenew = useCallback(
    async (data) => {
      try {
        if (!uid || !data) return;

        const subscription_type = data?.subscription_type || "Free";
        const isPremium = subscription_type === "Premium";

        const cancelAtPeriodEnd = !!data?.cancel_at_period_end;
        const expiresAtTs = data?.subscription_expires_at;
        const expiresAtMs = tsToMs(expiresAtTs);
        const nowMs = Date.now();

        // If not premium or no expiry date, nothing to enforce
        if (!isPremium || !expiresAtMs) return;

        const isExpired = nowMs >= expiresAtMs;

        // ✅ 1) Auto-downgrade when expired
        if (isExpired) {
          await updateDoc(doc(db, "users", uid), {
            subscription_type: "Free",
            isPro: false,

            // clear cancel flags
            cancel_at_period_end: false,

            // optional audit fields
            subscription_ended_at: serverTimestamp(),
          });

          // update local immediately
          setUserData((prev) => ({
            ...(prev || {}),
            subscription_type: "Free",
            isPro: false,
            cancel_at_period_end: false,
          }));

          return; // after downgrade, no renew prompt
        }

        // ✅ 2) Renewal prompt + notification ONLY if not cancelled
        if (cancelAtPeriodEnd) return;

        const msUntilExpiry = expiresAtMs - nowMs;
        const isWithinWindow = msUntilExpiry <= RENEW_PROMPT_WINDOW_MS;

        if (!isWithinWindow) return;

        // Guard: show once per period (keyed by expiry date)
        const promptedFor = tsToMs(data?.renew_prompted_for_expires_at);
        if (promptedFor && Math.abs(promptedFor - expiresAtMs) < 1000) {
          return; // already prompted for this expiry
        }

        // mark as prompted (so hindi spam)
        await updateDoc(doc(db, "users", uid), {
          renew_prompted_for_expires_at: expiresAtTs || serverTimestamp(),
          renew_prompted_at: serverTimestamp(),
        });

        // ✅ ALSO write notification once
        await writeRenewalNotificationOnce({ expiresAtMs, expiresAtTs });

        // Show modal prompt (manual renew)
        Alert.alert(
          "Renew Subscription?",
          `Your Premium plan will end on ${formatNumericDate(expiresAtTs)}.\n\nSince payments are manual, you need to renew to continue Premium access.`,
          [
            { text: "Not Now", style: "cancel" },
            {
              text: "Renew Now",
              onPress: () => {
                router.push("/User/UpgradeInfo");
              },
            },
          ]
        );
      } catch (e) {
        console.log("enforceExpiryAndMaybePromptRenew error:", e?.message || e);
      }
    },
    [formatNumericDate, router, uid, writeRenewalNotificationOnce]
  );

  const loadSubscription = useCallback(async () => {
    try {
      setLoading(true);

      if (!uid) {
        setUserData(null);
        if (!didWarnNoAuth.current) {
          didWarnNoAuth.current = true;
          Alert.alert("Session Required", "Please sign in to view your subscription.");
        }
        return;
      }

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        setUserData(null);
        if (!didWarnNoUserData.current) {
          didWarnNoUserData.current = true;
          Alert.alert("User Data Not Found", "We could not find your account data.");
        }
        return;
      }

      const data = snap.data() || null;
      setUserData(data);

      // ✅ Enforce expiry + renew prompt + notification logic
      await enforceExpiryAndMaybePromptRenew(data);
    } catch (e) {
      console.log("Subscription load error:", e);
      setUserData(null);
      if (!didWarnLoadError.current) {
        didWarnLoadError.current = true;
        Alert.alert("Error", "Failed to load subscription details. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [enforceExpiryAndMaybePromptRenew, uid]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const subscription_type = userData?.subscription_type || "Free";
  const isPremium = subscription_type === "Premium";

  const subscribed_at = userData?.subscribed_at;
  const subscription_expires_at = userData?.subscription_expires_at;

  const cancelAtPeriodEnd = !!userData?.cancel_at_period_end;

  const planLabel = useMemo(() => (isPremium ? "PRO" : "FREE"), [isPremium]);
  const planName = useMemo(() => (isPremium ? "Premium Member" : "Free Explorer"), [isPremium]);

  const planDesc = useMemo(() => {
    if (!isPremium) return "Premium features are locked. Subscribe to unlock.";

    if (cancelAtPeriodEnd) {
      const end = formatNumericDate(subscription_expires_at);
      return end !== "—" ? `Active until ${end}. Renewal is cancelled.` : "Active. Renewal is cancelled.";
    }

    const end = formatNumericDate(subscription_expires_at);
    return end !== "—"
      ? `Active until ${end}. Renew manually to continue.`
      : "Premium is active. Renew manually to continue.";
  }, [isPremium, cancelAtPeriodEnd, formatNumericDate, subscription_expires_at]);

  const currentStatusText = useMemo(() => {
    if (!isPremium) return "Not Subscribed";
    if (cancelAtPeriodEnd) {
      const end = formatNumericDate(subscription_expires_at);
      return end !== "—" ? `Active (Cancels on ${end})` : "Active (Cancellation scheduled)";
    }
    return "Active";
  }, [cancelAtPeriodEnd, formatNumericDate, isPremium, subscription_expires_at]);

  const handleSubscribe = useCallback(() => {
    if (isPremium) {
      Alert.alert("Already Premium", "Your plan is already active.");
      return;
    }
    router.push("/User/UpgradeInfo");
  }, [isPremium, router]);

  const handleCancelSubscription = useCallback(() => {
    if (!uid) {
      Alert.alert("Session Required", "Please sign in again.");
      return;
    }
    if (!isPremium) {
      Alert.alert("Not Available", "You do not have an active subscription.");
      return;
    }
    if (cancelAtPeriodEnd) {
      Alert.alert("Already Scheduled", "Your cancellation is already scheduled.");
      return;
    }

    Alert.alert(
      "Cancel Subscription",
      "Your Premium access will remain active until the renewal date. After that, your plan will return to Free.\n\nDo you want to continue?",
      [
        { text: "Keep Premium", style: "cancel" },
        {
          text: "Cancel Subscription",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);

              await updateDoc(doc(db, "users", uid), {
                cancel_at_period_end: true,
                cancelled_at: serverTimestamp(),
              });

              setUserData((prev) => ({
                ...(prev || {}),
                cancel_at_period_end: true,
              }));

              Alert.alert("Cancellation Scheduled", "Your subscription will end on the renewal date.");
            } catch (e) {
              console.log("Cancel subscription error:", e?.message || e);
              Alert.alert("Error", "Failed to cancel subscription. Please try again.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [cancelAtPeriodEnd, isPremium, uid]);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />
        <ActivityIndicator size="large" color="#01579B" />
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />
        <Text style={styles.errorText}>User data not found</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadSubscription} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color="#01579B" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backCircle} onPress={router.back} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Subscription</Text>
            <Text style={styles.headerSubtitle}>Manage your current plan</Text>
          </View>
        </View>

        {/* HERO CARD */}
        <View style={[styles.heroCard, isPremium ? styles.heroPremium : styles.heroFree]}>
          <View style={styles.heroTopRow}>
            <View
              style={[
                styles.iconBox,
                { backgroundColor: isPremium ? "rgba(255,255,255,0.2)" : "rgba(1, 87, 155, 0.06)" },
              ]}
            >
              <Ionicons
                name={isPremium ? "diamond" : "sparkles"}
                size={25}
                color={isPremium ? "#FFF" : "#01579B"}
              />
            </View>

            <View style={[styles.planBadge, { backgroundColor: isPremium ? "#FFD700" : "#E2E8F0" }]}>
              <Text style={styles.planBadgeText}>{planLabel}</Text>
            </View>
          </View>

          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroPlanName, { color: isPremium ? "#FFF" : "#01579B" }]}>{planName}</Text>
            <Text style={[styles.heroStatusText, { color: isPremium ? "rgba(255,255,255,0.9)" : "#64748B" }]}>
              {planDesc}
            </Text>
          </View>

          {!isPremium && (
            <TouchableOpacity style={styles.heroCta} activeOpacity={0.9} onPress={handleSubscribe}>
              <Text style={styles.heroCtaText}>Subscribe</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {isPremium && cancelAtPeriodEnd && (
            <View style={styles.cancelNote}>
              <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.cancelNoteText}>
                Cancellation scheduled. Premium remains until your renewal date.
              </Text>
            </View>
          )}
        </View>

        {/* PLAN DETAILS */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>Plan Details</Text>

          <InfoRow
            label="Current Status"
            value={currentStatusText}
            highlight={isPremium}
            icon={isPremium ? "shield-checkmark-outline" : "alert-circle-outline"}
            tint={isPremium ? "#16A34A" : "#F59E0B"}
          />

          <InfoRow label="Subscribed On" value={formatNumericDate(subscribed_at)} icon="calendar-outline" tint="#0284C7" />

          <InfoRow
            label="Renewal Date"
            value={isPremium ? formatNumericDate(subscription_expires_at) : "—"}
            icon="time-outline"
            tint="#0284C7"
            isLast
          />
        </View>

        {/* PREMIUM FEATURES (ONLY WHEN FREE) */}
        {!isPremium && (
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>Premium Features</Text>

            <LockedFeatureRow icon="infinite" text="Unlimited AI Room Generations" />
            <LockedFeatureRow icon="grid" text="AI Layout Suggestions" />
            <LockedFeatureRow icon="bag-handle" text="Furniture Matching" isLast />
          </View>
        )}

        {/* FOOTER ACTIONS */}
        <View style={styles.footer}>
          {isPremium ? (
            <TouchableOpacity
              style={[styles.dangerBtn, (actionLoading || cancelAtPeriodEnd) && { opacity: 0.6 }]}
              onPress={handleCancelSubscription}
              activeOpacity={0.9}
              disabled={actionLoading || cancelAtPeriodEnd}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.dangerText}>
                  {cancelAtPeriodEnd ? "Cancellation Scheduled" : "Cancel Subscription"}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubscribe} activeOpacity={0.9}>
              <Text style={styles.primaryText}>Subscribe to Premium</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          <Text style={styles.footerHint}>
            {isPremium
              ? cancelAtPeriodEnd
                ? "Your plan will return to Free after the renewal date."
                : "Cancel anytime. Premium stays active until the renewal date."
              : "Subscribe to unlock premium AI tools, layout suggestions, furniture matching, and unlimited access."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* SMALL COMPONENTS */
function InfoRow({ label, value, highlight, icon, tint = "#01579B", isLast }) {
  return (
    <View style={[styles.infoRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={styles.infoLeft}>
        <View style={[styles.miniIconBg, { backgroundColor: "rgba(2,132,199,0.06)" }]}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, highlight && styles.highlightText]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LockedFeatureRow({ icon, text, isLast }) {
  return (
    <View style={[styles.featureRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={styles.featureLeft}>
        <View style={styles.miniIconBgLocked}>
          <Ionicons name={icon} size={18} color="#94A3B8" />
        </View>
        <Text style={styles.infoLabel}>{text}</Text>
      </View>

      <View style={styles.lockPill}>
        <Ionicons name="lock-closed" size={12} color="#64748B" />
        <Text style={styles.lockPillText}>Locked</Text>
      </View>
    </View>
  );
}

/* STYLES */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDFEFF" },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
    paddingTop: Platform.OS === "ios" ? 60 : 65,
  },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  backCircle: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#0F172A", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: "#64748B", fontWeight: "700", marginTop: 2 },

  heroCard: {
    borderRadius: 30,
    padding: 22,
    marginBottom: 18,
    overflow: "hidden",
    minHeight: 210,
    justifyContent: "space-between",
  },
  heroPremium: {
    backgroundColor: "#01579B",
    shadowColor: "#01579B",
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 8,
  },
  heroFree: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  iconBox: { width: 60, height: 60, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  planBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  planBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#01579B" },

  heroTextContainer: { marginTop: 8 },
  heroPlanName: { fontSize: 24, fontWeight: "900", marginBottom: 6 },
  heroStatusText: { fontSize: 14, fontWeight: "700", lineHeight: 20 },

  heroCta: {
    alignSelf: "flex-start",
    marginTop: 14,
    backgroundColor: "#01579B",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroCtaText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  cancelNote: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  cancelNoteText: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12, flex: 1, lineHeight: 16 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardSectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1.3,
    marginBottom: 16,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  infoLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  miniIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  miniIconBgLocked: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  infoLabel: { color: "#475569", fontSize: 14, fontWeight: "800" },
  infoValue: { color: "#0F172A", fontSize: 14, fontWeight: "900", maxWidth: 180, textAlign: "right" },
  highlightText: { color: "#16A34A" },

  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  featureLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },

  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  lockPillText: { fontSize: 12, fontWeight: "900", color: "#64748B" },

  footer: { gap: 14, marginTop: 6 },
  primaryBtn: {
    backgroundColor: "#01579B",
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  dangerBtn: {
    backgroundColor: "#DC2626",
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  dangerText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  footerHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#94A3B8",
    paddingHorizontal: 20,
    lineHeight: 18,
  },

  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FDFEFF", padding: 20 },
  errorText: { color: "#64748B", fontWeight: "800", marginBottom: 10 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  retryText: { fontWeight: "900", color: "#01579B" },
});
