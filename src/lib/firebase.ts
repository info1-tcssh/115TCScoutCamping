import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  Auth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const config = firebaseConfig as any;

let app: any = null;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.error('Firebase initializeApp failed:', e);
}

const dbId = config.firestoreDatabaseId || config.databaseId;

let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (app) {
  try {
    authInstance = getAuth(app);
    // Explicitly configure browser local persistence (localStorage)
    // to prevent IndexedDB connection crashes ("Database is closing/hidden") in popups/tabs
    setPersistence(authInstance, browserLocalPersistence).catch((e) => {
      console.warn('Failed to set browserLocalPersistence:', e);
    });
  } catch (err) {
    console.error('Failed to initialize Firebase Auth:', err);
  }

  const firestoreSettings = {
    experimentalForceLongPolling: true,
  };

  try {
    if (dbId && dbId !== '(default)' && typeof dbId === 'string' && dbId.trim().length > 0) {
      firestoreInstance = initializeFirestore(app, firestoreSettings, dbId.trim());
    } else {
      firestoreInstance = initializeFirestore(app, firestoreSettings);
    }
  } catch (err) {
    try {
      if (dbId && dbId !== '(default)' && typeof dbId === 'string' && dbId.trim().length > 0) {
        firestoreInstance = getFirestore(app, dbId.trim());
      } else {
        firestoreInstance = getFirestore(app);
      }
    } catch (fallbackErr) {
      console.error('Failed to initialize Firestore instance:', fallbackErr);
    }
  }
}

export const db = firestoreInstance as Firestore;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
// Force Google Account Chooser so users can always pick another account or enter their .edu account
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function loginWithGooglePopup(): Promise<string> {
  if (!auth) {
    throw new Error('Firebase Auth 尚未初始化，請檢查 config。');
  }

  // Ensure prompt: 'select_account' is set
  googleProvider.setCustomParameters({
    prompt: 'select_account',
  });

  // Ensure persistence strategy is set to browserLocalPersistence to avoid IndexedDB closing state
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn('setPersistence browserLocalPersistence warning:', e);
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (!result.user || !result.user.email) {
      throw new Error('無法取回有效的 Google 電子郵件。');
    }
    return result.user.email.toLowerCase();
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isDbClosing = msg.includes('Database is closing') || msg.includes('Database is hidden') || msg.includes('indexedDB') || err?.code === 'auth/internal-error';

    if (isDbClosing) {
      console.warn('Detected IndexedDB connection error during login. Retrying with session & memory persistence...', err);
      try {
        await setPersistence(auth, browserSessionPersistence);
        const retryResult = await signInWithPopup(auth, googleProvider);
        if (retryResult.user && retryResult.user.email) {
          return retryResult.user.email.toLowerCase();
        }
      } catch (retryErr: any) {
        console.warn('Retry with session persistence failed, trying inMemoryPersistence...', retryErr);
        try {
          await setPersistence(auth, inMemoryPersistence);
          const finalRetry = await signInWithPopup(auth, googleProvider);
          if (finalRetry.user && finalRetry.user.email) {
            return finalRetry.user.email.toLowerCase();
          }
        } catch (finalErr: any) {
          console.error('All login retries failed:', finalErr);
          throw new Error('瀏覽器快取/資料庫連線中斷（Database is closing）。請重新整理頁面後再試一次即可！');
        }
      }
    }

    if (err?.code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
      const customErr: any = new Error('popup-blocked');
      customErr.code = 'auth/popup-blocked';
      throw customErr;
    }

    throw err;
  }
}

export async function logoutGoogleAuth(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }
}

