// services/dailyLimitService.js
import AsyncStorage from "@react-native-async-storage/async-storage";

export const getLimitKey = (uid) => `aestheticai:daily_generations:v1:${uid || "anon"}`;

export const getLocalDateKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const loadDailyCounter = async (uid) => {
  const key = getLimitKey(uid);
  const today = getLocalDateKey();
  const raw = await AsyncStorage.getItem(key);

  if (!raw) {
    await AsyncStorage.setItem(key, JSON.stringify({ dateKey: today, count: 0 }));
    return { dateKey: today, count: 0 };
  }

  const parsed = JSON.parse(raw);
  if (parsed?.dateKey !== today) {
    await AsyncStorage.setItem(key, JSON.stringify({ dateKey: today, count: 0 }));
    return { dateKey: today, count: 0 };
  }

  return { dateKey: parsed.dateKey, count: Number(parsed.count || 0) };
};

export const incrementDailyCount = async (uid, fallbackCount = 0) => {
  const key = getLimitKey(uid);
  const today = getLocalDateKey();

  const raw = await AsyncStorage.getItem(key);
  let currentCount = 0;
  let currentDateKey = today;

  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.dateKey === today) {
      currentCount = Number(parsed?.count || 0);
      currentDateKey = parsed?.dateKey;
    }
  }

  if (currentDateKey !== today) {
    currentCount = 0;
    currentDateKey = today;
  }

  const next = currentCount + 1;
  await AsyncStorage.setItem(key, JSON.stringify({ dateKey: today, count: next }));
  return next;
};
