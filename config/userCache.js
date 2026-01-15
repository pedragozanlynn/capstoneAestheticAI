import AsyncStorage from '@react-native-async-storage/async-storage';

const ROLE_KEY_PREFIX = 'aestheticai:user-role:';

export async function cacheUserRole(uid, role) {
  try {
    await AsyncStorage.setItem(`${ROLE_KEY_PREFIX}${uid}`, role);
  } catch (error) {
    console.warn('Failed to cache user role', error);
  }
}

export async function getCachedUserRole(uid) {
  try {
    return (await AsyncStorage.getItem(`${ROLE_KEY_PREFIX}${uid}`)) || null;
  } catch (error) {
    console.warn('Failed to read cached user role', error);
    return null;
  }
}