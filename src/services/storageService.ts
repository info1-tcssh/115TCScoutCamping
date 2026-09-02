import { AdminAccount, AuditLog, UploadedFile, UserRecord, TemplateItemConfig, UploadSlotConfig } from '../types';
import { SCHOOLS } from '../data/schools';
import { db } from '../lib/firebase';
import { validatePhoneFormat, sanitizeInput } from '../lib/security';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

const STORAGE_KEYS = {
  ADMINS: 'scout_app_admins_v2',
  USERS: 'scout_app_users_v2',
  FILES: 'scout_app_files_v2',
  LOGS: 'scout_app_logs_v2',
  CURRENT_AUTH: 'scout_app_current_auth_v2',
  TEMPLATES: 'scout_app_templates_v2',
  UPLOAD_SLOTS: 'scout_app_upload_slots_v2',
};

// Default Admins
const DEFAULT_ADMINS: AdminAccount[] = [
  {
    email: 'info1@cloud.tcssh.tc.edu.tw',
    name: '系統總管理員 (臺中二中)',
    addedAt: '2026-08-01 09:00:00',
    addedBy: '系統預設',
  }
];

// Default Template Downloads Configuration
export const DEFAULT_TEMPLATE_ITEMS: TemplateItemConfig[] = [
  {
    id: 'tpl_excel',
    title: '報名表 (Excel 範本)',
    description: '點擊下方按鈕自動下載 .xlsx 試算表檔並於電腦編輯填寫',
    url: 'https://docs.google.com/spreadsheets/d/1YlbAMCysWygLlzVeCeNxyYogkrGV85X6/edit?usp=sharing',
    downloadUrl: 'https://docs.google.com/spreadsheets/d/1YlbAMCysWygLlzVeCeNxyYogkrGV85X6/export?format=xlsx',
    fileType: 'xlsx',
  },
  {
    id: 'tpl_word',
    title: '繳費證明與開立收據抬頭 (Word 範本)',
    description: '點擊下方按鈕自動下載 .docx 文件檔並填寫開立抬頭資訊',
    url: 'https://docs.google.com/document/d/1yHr_YhXKiiJEmy704b5tQhR_KPCRnFbG/edit?usp=drive_link',
    downloadUrl: 'https://docs.google.com/document/d/1yHr_YhXKiiJEmy704b5tQhR_KPCRnFbG/export?format=docx',
    fileType: 'docx',
  },
];

// Default Upload Slots Configuration
export const DEFAULT_UPLOAD_SLOTS: UploadSlotConfig[] = [
  {
    key: 'form',
    label: '1. 報名表 (Excel / PDF)',
    accept: '.pdf,.xls,.xlsx,.csv,.ods',
    targetName: '報名表',
    exts: ['pdf', 'xls', 'xlsx', 'csv', 'ods'],
    description: '請使用大會提供之「團體報名表範本」填寫或列印後上傳 (支援 PDF / Excel / LibreOffice ODS)。',
  },
  {
    key: 'stamp',
    label: '2. 學校核章之報名掃描檔 (PDF / 圖片 / 文件)',
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.odt',
    targetName: '學校核章掃描檔',
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'odt'],
    description: '列印報名表經校長與承辦人核章後之彩色清晰掃描件或照片。',
  },
  {
    key: 'cert',
    label: '3. 領隊 SAFE FROM HARM 研習證書 (PDF / 圖片 / 文件)',
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.odt',
    targetName: 'SAFE_FROM_HARM證書',
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'odt'],
    description: '帶隊團長或領隊教師完成「Safe from Harm」防制傷害之研習證書。',
  },
  {
    key: 'receipt',
    label: '4. 繳費收據影本與開立表 (PDF / 圖片 / Excel / Word)',
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.odt,.xls,.xlsx,.ods',
    targetName: '繳費收據影本',
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods'],
    description: '郵局匯款或轉帳收據影本，以及開立收據抬頭資訊。',
  },
];

// Helper to derive automatic export/download link from Google Docs/Sheets URL
export function deriveDownloadUrl(url: string, fileType?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const fmt = fileType || 'xlsx';
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=${fmt}`;
    }
  }
  if (trimmed.includes('docs.google.com/document/d/')) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const fmt = fileType || 'docx';
      return `https://docs.google.com/document/d/${match[1]}/export?format=${fmt}`;
    }
  }
  if (trimmed.includes('drive.google.com/file/d/')) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  return trimmed;
}

// Helper to safely parse LocalStorage
function getStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.error(`Failed to read ${key} from localStorage`, e);
    return fallback;
  }
}

// Helper to safely write to LocalStorage
function setStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to write ${key} to localStorage`, e);
  }
}

// Helper to safely store files in LocalStorage without hitting 5MB quota errors
function safeSaveFilesStorage(files: Record<string, Record<string, UploadedFile>>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
  } catch (e) {
    console.warn('LocalStorage quota limit reached, saving metadata-only cache...', e);
    try {
      // Create a lightweight copy without giant Base64 strings for localStorage fallback
      const lightFiles: Record<string, Record<string, UploadedFile>> = {};
      Object.entries(files).forEach(([sId, slots]) => {
        lightFiles[sId] = {};
        Object.entries(slots).forEach(([sKey, file]) => {
          lightFiles[sId][sKey] = {
            ...file,
            url: file.url.startsWith('data:') && file.url.length > 50000 ? (file.driveUrl || file.name) : file.url,
          };
        });
      });
      localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(lightFiles));
    } catch (e2) {
      console.error('Failed to write files to localStorage even with compact payload:', e2);
    }
  }
}

// Global In-Memory Caches synchronized with Firestore Realtime Listeners
let cachedAdmins: AdminAccount[] = getStorage(STORAGE_KEYS.ADMINS, DEFAULT_ADMINS);
let cachedUsers: Record<string, UserRecord> = getStorage(STORAGE_KEYS.USERS, {});
let cachedFiles: Record<string, Record<string, UploadedFile>> = getStorage(STORAGE_KEYS.FILES, {});
let cachedLogs: AuditLog[] = getStorage(STORAGE_KEYS.LOGS, []);
let cachedTemplates: TemplateItemConfig[] = getStorage(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATE_ITEMS);
let cachedUploadSlots: UploadSlotConfig[] = getStorage(STORAGE_KEYS.UPLOAD_SLOTS, DEFAULT_UPLOAD_SLOTS);


// Listeners subscribers list
type ChangeCallback = () => void;
const subscribers = new Set<ChangeCallback>();

export function subscribeDataChanges(cb: ChangeCallback) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notifySubscribers() {
  subscribers.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Subscriber callback error:', e);
    }
  });
}

// Fire-and-forget real-time Firestore listeners setup
let firebaseInitialized = false;

export function initSeedData() {
  if (firebaseInitialized) return;
  firebaseInitialized = true;

  if (!db) {
    console.warn('Firestore db instance is not available. Running in offline/localStorage mode.');
    return;
  }

  // 1. Sync Admins
  try {
    const adminsColRef = collection(db, 'admins');
    onSnapshot(adminsColRef, (snapshot) => {
      if (!snapshot.empty) {
        const list: AdminAccount[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as AdminAccount);
        });
        cachedAdmins = list;
        setStorage(STORAGE_KEYS.ADMINS, cachedAdmins);
        notifySubscribers();
      } else {
        // Seed default admin to Firestore if collection is empty
        DEFAULT_ADMINS.forEach(admin => {
          if (db) setDoc(doc(db, 'admins', admin.email.toLowerCase().trim()), admin).catch(console.error);
        });
      }
    }, (err) => {
      console.warn('Firestore admins listener warning:', err);
    });
  } catch (err) {
    console.warn('Firebase init error admins:', err);
  }

  // 2. Sync Users
  try {
    const usersColRef = collection(db, 'users');
    onSnapshot(usersColRef, (snapshot) => {
      const usersMap: Record<string, UserRecord> = {};
      snapshot.forEach(docSnap => {
        const u = docSnap.data() as UserRecord;
        if (u) {
          const emailKey = (u.user_email || docSnap.id || '').toLowerCase().trim();
          if (emailKey) {
            usersMap[emailKey] = {
              ...u,
              user_email: emailKey,
            };
          }
        }
      });
      cachedUsers = usersMap;
      setStorage(STORAGE_KEYS.USERS, cachedUsers);
      notifySubscribers();
    }, (err) => {
      console.warn('Firestore users listener warning:', err);
    });
  } catch (err) {
    console.warn('Firebase init error users:', err);
  }

  // 3. Sync Files
  try {
    const filesColRef = collection(db, 'schoolFiles');
    onSnapshot(filesColRef, (snapshot) => {
      const filesMap: Record<string, Record<string, UploadedFile>> = {};
      snapshot.forEach(docSnap => {
        const item = docSnap.data() as UploadedFile & { school_id: string };
        if (item && item.school_id && item.slotKey) {
          if (!filesMap[item.school_id]) {
            filesMap[item.school_id] = {};
          }
          filesMap[item.school_id][item.slotKey] = item;
        }
      });
      cachedFiles = filesMap;
      safeSaveFilesStorage(cachedFiles);
      notifySubscribers();
    }, (err) => {
      console.warn('Firestore files listener warning:', err);
    });
  } catch (err) {
    console.warn('Firebase init error files:', err);
  }

  // 5. Sync System Drive Settings & App Configs
  try {
    const driveSettingsRef = doc(db, 'systemSettings', 'googleDrive');
    onSnapshot(driveSettingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.folderId !== undefined) {
          localStorage.setItem('scout_app_drive_folder_id', data.folderId);
        }
        if (data.gasWebAppUrl !== undefined) {
          localStorage.setItem('scout_app_drive_gas_url', data.gasWebAppUrl);
        }
        if (data.customClientId !== undefined) {
          localStorage.setItem('scout_app_drive_client_id', data.customClientId);
        }
        if (data.driveAccessToken !== undefined && data.driveAccessToken) {
          sessionStorage.setItem('scout_app_drive_access_token', data.driveAccessToken);
        }
        notifySubscribers();
      }
    }, (err) => {
      console.warn('Firestore systemSettings listener warning:', err);
    });

    const tplRef = doc(db, 'systemSettings', 'templateItems');
    onSnapshot(tplRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().items) {
        cachedTemplates = docSnap.data().items;
        setStorage(STORAGE_KEYS.TEMPLATES, cachedTemplates);
        notifySubscribers();
      }
    });

    const slotRef = doc(db, 'systemSettings', 'uploadSlots');
    onSnapshot(slotRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().slots) {
        cachedUploadSlots = docSnap.data().slots;
        setStorage(STORAGE_KEYS.UPLOAD_SLOTS, cachedUploadSlots);
        notifySubscribers();
      }
    });
  } catch (err) {
    console.warn('Firebase init error systemSettings:', err);
  }

  // 4. Sync Audit Logs
  try {
    const logsColRef = collection(db, 'auditLogs');
    onSnapshot(logsColRef, (snapshot) => {
      const list: AuditLog[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...(docSnap.data() as AuditLog) });
      });
      // Safe Sort by time desc
      list.sort((a, b) => {
        const timeA = new Date(a.time).getTime();
        const timeB = new Date(b.time).getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) {
          return timeB - timeA;
        }
        return (b.id || '').localeCompare(a.id || '');
      });
      cachedLogs = list;
      setStorage(STORAGE_KEYS.LOGS, cachedLogs);
      notifySubscribers();
    }, (err) => {
      console.warn('Firestore logs listener warning:', err);
    });
  } catch (err) {
    console.warn('Firebase init error logs:', err);
  }
}

// Clear non-admin users and files, while PERMANENTLY PRESERVING Audit Logs
export async function purgeAllUserData(byEmail: string): Promise<{ success: boolean; message: string }> {
  try {
    if (db) {
      // 1. Delete all Firestore users
      const userDocs = await getDocs(collection(db, 'users'));
      const userDeletes = userDocs.docs.map(docSnap => deleteDoc(doc(db, 'users', docSnap.id)));
      await Promise.all(userDeletes);

      // 2. Delete all Firestore schoolFiles
      const fileDocs = await getDocs(collection(db, 'schoolFiles'));
      const fileDeletes = fileDocs.docs.map(docSnap => deleteDoc(doc(db, 'schoolFiles', docSnap.id)));
      await Promise.all(fileDeletes);

      // NOTE: auditLogs are intentionally NEVER deleted to ensure an immutable audit trail
    }

    // 3. Reset local caches & LocalStorage for users and files ONLY
    cachedUsers = {};
    cachedFiles = {};
    // cachedLogs is preserved

    setStorage(STORAGE_KEYS.USERS, {});
    setStorage(STORAGE_KEYS.FILES, {});
    // STORAGE_KEYS.LOGS is preserved

    // 4. Record the reset action in audit logs
    addAuditLog({
      time: new Date().toLocaleString('zh-TW', { hour12: false }),
      userId: 'ADMIN',
      email: byEmail,
      schoolName: '總管理處',
      actionType: 'ADMIN_RESET',
      detail: '【全系統歸零重置】已清空所有學校註冊資料與上傳檔案記錄（歷史稽核日誌已完整保留）。',
    });

    notifySubscribers();
    return { success: true, message: '全系統已完成歸零重置！已清空所有學校註冊資料與上傳檔案，並永久保留歷史操作日誌。' };
  } catch (e) {
    console.error('Error purging data:', e);
    return { success: false, message: '重置過程發生錯誤：' + (e as Error).message };
  }
}


// Admins
export function getAdmins(): AdminAccount[] {
  return cachedAdmins && cachedAdmins.length > 0
    ? cachedAdmins
    : getStorage<AdminAccount[]>(STORAGE_KEYS.ADMINS, DEFAULT_ADMINS);
}

export function isAdmin(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const admins = getAdmins();
  return admins.some(a => a.email.toLowerCase().trim() === normalized);
}

export async function addAdmin(email: string, name: string, addedBy: string): Promise<{ success: boolean; message: string }> {
  const normalized = email.toLowerCase().trim();
  if (!normalized || !normalized.includes('@')) {
    return { success: false, message: '請輸入有效的 Google Email 信箱！' };
  }

  const admins = getAdmins();
  if (admins.some(a => a.email.toLowerCase().trim() === normalized)) {
    return { success: false, message: '該 Email 已經具備管理員權限！' };
  }

  const newAdmin: AdminAccount = {
    email: normalized,
    name: name || '新新增管理員',
    addedAt: new Date().toLocaleString('zh-TW', { hour12: false }),
    addedBy,
  };

  // Firestore update with strict verification
  if (db) {
    try {
      await setDoc(doc(db, 'admins', normalized), newAdmin);
    } catch (e: any) {
      console.error('Firestore addAdmin error:', e);
      return { success: false, message: `雲端資料庫寫入失敗：${e.message || e}，請稍後重試！` };
    }
  }

  // Local update after cloud confirms
  cachedAdmins.push(newAdmin);
  setStorage(STORAGE_KEYS.ADMINS, cachedAdmins);

  addAuditLog({
    time: new Date().toLocaleString('zh-TW', { hour12: false }),
    userId: 'ADMIN',
    email: addedBy,
    schoolName: '總管理處',
    actionType: 'ADMIN_ADD',
    detail: `新增管理員帳號：${normalized} (${name})`,
  });

  notifySubscribers();
  return { success: true, message: `成功新增管理員 ${normalized}！` };
}

export async function removeAdmin(email: string, removedBy: string): Promise<{ success: boolean; message: string }> {
  const normalized = email.toLowerCase().trim();
  if (normalized === 'info1@cloud.tcssh.tc.edu.tw') {
    return { success: false, message: '預設系統總管理員帳號不可刪除！' };
  }

  let admins = getAdmins();
  const target = admins.find(a => a.email.toLowerCase().trim() === normalized);
  if (!target) {
    return { success: false, message: '找不到該管理員帳號！' };
  }

  // Firestore update with strict verification
  if (db) {
    try {
      await deleteDoc(doc(db, 'admins', normalized));
    } catch (e: any) {
      console.error('Firestore removeAdmin error:', e);
      return { success: false, message: `雲端資料庫移除失敗：${e.message || e}，請稍後重試！` };
    }
  }

  cachedAdmins = admins.filter(a => a.email.toLowerCase().trim() !== normalized);
  setStorage(STORAGE_KEYS.ADMINS, cachedAdmins);

  addAuditLog({
    time: new Date().toLocaleString('zh-TW', { hour12: false }),
    userId: 'ADMIN',
    email: removedBy,
    schoolName: '總管理處',
    actionType: 'ADMIN_REMOVE',
    detail: `移除管理員權限：${normalized}`,
  });

  notifySubscribers();
  return { success: true, message: `已移除 ${normalized} 的管理員權限！` };
}

// User Registration & Records
export function getUsers(): Record<string, UserRecord> {
  return cachedUsers && Object.keys(cachedUsers).length > 0
    ? cachedUsers
    : getStorage<Record<string, UserRecord>>(STORAGE_KEYS.USERS, {});
}

export function getUserByEmail(email: string): UserRecord | null {
  if (!email) return null;
  const users = getUsers();
  return users[email.toLowerCase().trim()] || null;
}

export function isSchoolRegistered(school_id: string): { registered: boolean; registeredBy?: string; userEmail?: string } {
  // Exception: School 52 (臺中二中) allows multiple registrations for testing/main host
  if (school_id === '52' || school_id === '55') {
    return { registered: false };
  }

  const users = getUsers();
  const found = Object.values(users).find(u => u.school_id === school_id);
  if (found) {
    return {
      registered: true,
      registeredBy: `${found.user_name} (${found.school_name})`,
      userEmail: found.user_email,
    };
  }
  return { registered: false };
}

export async function registerUser(data: {
  email: string;
  user_name: string;
  school_id: string;
  user_phone: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; user?: UserRecord }> {
  const email = data.email.toLowerCase().trim();
  if (!email) return { success: false, message: '請提供有效的 Google 電子郵件！' };

  // Sanitize fields for security (XSS protection)
  const sanitizedName = sanitizeInput(data.user_name);
  const sanitizedPhone = sanitizeInput(data.user_phone);
  const sanitizedNotes = sanitizeInput(data.notes || '');

  if (!sanitizedName) {
    return { success: false, message: '註冊失敗！代表人姓名不得為空且不得包含 HTML 標籤。' };
  }
  if (!sanitizedPhone) {
    return { success: false, message: '註冊失敗！聯絡電話不得為空。' };
  }

  // Validate phone format
  if (!validatePhoneFormat(sanitizedPhone)) {
    return { success: false, message: '註冊失敗！聯絡電話格式不正確。必須是有效的台灣手機或市話，且長度合理。' };
  }

  // Check if school is already registered
  const schoolCheck = isSchoolRegistered(data.school_id);
  if (schoolCheck.registered) {
    return {
      success: false,
      message: '註冊失敗！該學校已經被註冊過了。一間學校只能有一個註冊帳號！',
    };
  }

  const schoolObj = SCHOOLS.find(s => s.school_id === data.school_id);
  if (!schoolObj) {
    return { success: false, message: '無效的學校選項！' };
  }

  const newUserRecord: UserRecord = {
    user_id: `usr_${data.school_id}_${Date.now().toString().slice(-4)}`,
    user_name: sanitizedName,
    school_id: data.school_id,
    school_name: schoolObj.school_name,
    user_phone: sanitizedPhone,
    user_email: email,
    user_type: isAdmin(email) ? 'admin' : 'user',
    notes: sanitizedNotes,
    createdAt: new Date().toLocaleString('zh-TW', { hour12: false }),
  };

  // Firestore update with STRICT CLOUD VERIFICATION
  // Only proceed and declare success if Firestore cloud database actually succeeds!
  if (db) {
    try {
      await setDoc(doc(db, 'users', email), newUserRecord);
    } catch (e: any) {
      console.error('Firestore registerUser error:', e);
      return {
        success: false,
        message: `⚠️ 雲端資料庫儲存失敗：${e.message || e}。\n為避免資料不同步，系統未完成註冊。請檢查網路連線後重新點選註冊！`,
      };
    }
  }

  // Local update ONLY after cloud write succeeds
  cachedUsers[email] = newUserRecord;
  setStorage(STORAGE_KEYS.USERS, cachedUsers);

  addAuditLog({
    time: newUserRecord.createdAt || new Date().toLocaleString('zh-TW', { hour12: false }),
    userId: newUserRecord.user_id,
    email: newUserRecord.user_email,
    schoolName: newUserRecord.school_name,
    actionType: 'REGISTER',
    detail: `完成學校代表註冊：${newUserRecord.user_name} (${newUserRecord.user_phone})`,
  });

  notifySubscribers();

  return { success: true, message: '註冊成功！已將您的 Google 帳號綁定至代表學校並同步至大會雲端資料庫。', user: newUserRecord };
}

export async function updateUserProfile(
  targetEmail: string,
  updates: {
    user_name: string;
    user_phone: string;
    school_id?: string;
    notes?: string;
  },
  operator: { email: string; name: string; schoolName: string; isAdmin: boolean }
): Promise<{ success: boolean; message: string; user?: UserRecord }> {
  const email = targetEmail.toLowerCase().trim();
  if (!email || !cachedUsers[email]) {
    return { success: false, message: '找不到該學校代表帳號！' };
  }

  const existingUser = cachedUsers[email];

  // Sanitize fields for security (XSS protection)
  const sanitizedName = sanitizeInput(updates.user_name);
  const sanitizedPhone = sanitizeInput(updates.user_phone);
  const sanitizedNotes = updates.notes !== undefined ? sanitizeInput(updates.notes) : undefined;

  if (updates.user_name !== undefined && !sanitizedName) {
    return { success: false, message: '修改失敗！姓名不得為空且不得包含 HTML 標籤。' };
  }
  if (updates.user_phone !== undefined && !sanitizedPhone) {
    return { success: false, message: '修改失敗！聯絡電話不得為空。' };
  }

  // Validate phone format if phone is provided/updated
  if (updates.user_phone !== undefined && !validatePhoneFormat(sanitizedPhone)) {
    return { success: false, message: '修改失敗！聯絡電話格式不正確。必須是有效的台灣手機或市話，且長度合理。' };
  }

  // If school_id changed, check whether the new school is available
  let newSchoolObj = SCHOOLS.find(s => s.school_id === existingUser.school_id);
  if (updates.school_id && updates.school_id !== existingUser.school_id) {
    const schoolCheck = isSchoolRegistered(updates.school_id);
    if (schoolCheck.registered && schoolCheck.userEmail !== email) {
      return {
        success: false,
        message: `修改失敗！目標學校 [${updates.school_id}] 已被其他帳號註冊。`,
      };
    }
    const foundSchool = SCHOOLS.find(s => s.school_id === updates.school_id);
    if (!foundSchool) {
      return { success: false, message: '無效的學校選項！' };
    }
    newSchoolObj = foundSchool;
  }

  const updatedUserRecord: UserRecord = {
    ...existingUser,
    user_name: sanitizedName || existingUser.user_name,
    user_phone: sanitizedPhone || existingUser.user_phone,
    school_id: newSchoolObj ? newSchoolObj.school_id : existingUser.school_id,
    school_name: newSchoolObj ? newSchoolObj.school_name : existingUser.school_name,
    notes: sanitizedNotes !== undefined ? sanitizedNotes : existingUser.notes,
  };

  // Firestore update with STRICT CLOUD VERIFICATION
  if (db) {
    try {
      await setDoc(doc(db, 'users', email), updatedUserRecord);
    } catch (e: any) {
      console.error('Firestore updateUserProfile error:', e);
      return {
        success: false,
        message: `⚠️ 雲端資料庫修改失敗：${e.message || e}。請稍後再試！`,
      };
    }
  }

  // Local update after cloud succeeds
  cachedUsers[email] = updatedUserRecord;
  setStorage(STORAGE_KEYS.USERS, cachedUsers);

  const changesList: string[] = [];
  if (existingUser.user_name !== updatedUserRecord.user_name) {
    changesList.push(`姓名: ${existingUser.user_name} -> ${updatedUserRecord.user_name}`);
  }
  if (existingUser.user_phone !== updatedUserRecord.user_phone) {
    changesList.push(`電話: ${existingUser.user_phone} -> ${updatedUserRecord.user_phone}`);
  }
  if (existingUser.school_id !== updatedUserRecord.school_id) {
    changesList.push(`學校: ${existingUser.school_name} -> ${updatedUserRecord.school_name}`);
  }

  addAuditLog({
    time: new Date().toLocaleString('zh-TW', { hour12: false }),
    userId: operator.isAdmin ? 'ADMIN' : updatedUserRecord.user_id,
    email: operator.email,
    schoolName: operator.schoolName,
    actionType: operator.isAdmin ? 'ADMIN_UPDATE_USER' : 'USER_UPDATE',
    detail: `${operator.isAdmin ? '大會管理員修改' : '學校代表修改自己'}帳號資料 [${email}]：${changesList.join('、') || '無欄位變更'}`,
  });

  notifySubscribers();

  return { success: true, message: '代表資料已成功修改並同步至雲端資料庫！', user: updatedUserRecord };
}

export async function deleteUserAccount(
  targetEmail: string,
  operator: { email: string; name: string; schoolName: string; isAdmin: boolean }
): Promise<{ success: boolean; message: string }> {
  const email = targetEmail.toLowerCase().trim();
  let existingUser = cachedUsers[email];

  if (!existingUser) {
    existingUser = Object.values(cachedUsers).find(
      u => u && u.user_email && u.user_email.toLowerCase().trim() === email
    )!;
  }

  if (!existingUser) {
    return { success: false, message: '找不到該學校代表帳號！' };
  }

  const realEmail = existingUser.user_email.toLowerCase().trim();

  // Firestore delete with STRICT CLOUD VERIFICATION
  if (db) {
    try {
      await deleteDoc(doc(db, 'users', realEmail));
    } catch (e: any) {
      console.error('Firestore deleteUserAccount error:', e);
      return { success: false, message: `雲端資料庫刪除失敗：${e.message || e}，請稍後重試！` };
    }
  }

  delete cachedUsers[realEmail];
  if (cachedUsers[email]) {
    delete cachedUsers[email];
  }
  setStorage(STORAGE_KEYS.USERS, cachedUsers);

  addAuditLog({
    time: new Date().toLocaleString('zh-TW', { hour12: false }),
    userId: operator.isAdmin ? 'ADMIN' : existingUser.user_id,
    email: operator.email,
    schoolName: operator.schoolName,
    actionType: 'ADMIN_DELETE_USER',
    detail: `大會管理員刪除學校代表帳號：[${realEmail}] ${existingUser.school_name} 代表人：${existingUser.user_name} (${existingUser.user_phone})`,
  });

  notifySubscribers();

  return { success: true, message: `已成功刪除 ${existingUser.school_name} 代表帳號 (${realEmail})！` };
}

// Uploaded Files
export function getAllFilesMap(): Record<string, Record<string, UploadedFile>> {
  return cachedFiles || getStorage<Record<string, Record<string, UploadedFile>>>(STORAGE_KEYS.FILES, {});
}

export function getSchoolFiles(school_id: string): UploadedFile[] {
  const map = getAllFilesMap();
  const schoolFilesMap = map[school_id] || {};
  return Object.values(schoolFilesMap).filter(f => !f.isDead);
}

export function getAllSchoolFilesWithDead(school_id: string): UploadedFile[] {
  const map = getAllFilesMap();
  const schoolFilesMap = map[school_id] || {};
  return Object.values(schoolFilesMap);
}

export function getSchoolSlotFile(school_id: string, slotKey: string): UploadedFile | undefined {
  const map = getAllFilesMap();
  const schoolFilesMap = map[school_id] || {};
  return schoolFilesMap[slotKey];
}

export async function saveSchoolFile(
  school_id: string,
  slotKey: string,
  fileInfo: { name: string; url: string; size?: number; driveFileId?: string; driveUrl?: string },
  user: { email: string; name: string; schoolName: string; userId: string }
): Promise<{ success: boolean; message?: string }> {
  if (!cachedFiles[school_id]) {
    cachedFiles[school_id] = {};
  }

  const newFile: UploadedFile = {
    slotKey,
    name: fileInfo.name,
    url: fileInfo.url,
    time: new Date().toLocaleString('zh-TW', { hour12: false }),
    size: fileInfo.size || 0,
    isDead: false,
    driveFileId: fileInfo.driveFileId || '',
    driveUrl: fileInfo.driveUrl || '',
  };

  // Helper to remove any undefined fields before sending to Firestore
  const cleanUndefined = (obj: Record<string, any>) => {
    const cleaned: Record<string, any> = {};
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) {
        cleaned[key] = obj[key];
      }
    });
    return cleaned;
  };

  // If URL is Base64 and exceeds ~700KB, Firestore setDoc will reject if payload > 1MB!
  // If driveUrl exists, we prioritize driveUrl for Firestore to ensure 100% upload success and never exceed 1MB limit.
  let firestoreUrl = newFile.url;
  if (firestoreUrl && firestoreUrl.startsWith('data:') && firestoreUrl.length > 700000) {
    if (newFile.driveUrl) {
      firestoreUrl = newFile.driveUrl;
    }
  }

  // Firestore update with STRICT CLOUD VERIFICATION
  const docId = `${school_id}_${slotKey}`;
  if (db) {
    try {
      await setDoc(doc(db, 'schoolFiles', docId), cleanUndefined({
        ...newFile,
        url: firestoreUrl,
        school_id,
        uploadedByEmail: user.email,
      }));
    } catch (e: any) {
      console.error('Firestore saveSchoolFile error:', e);
      return {
        success: false,
        message: `⚠️ 雲端資料庫儲存檔案失敗：${e.message || e}。\n請確認網路連線正常後重新上傳！`,
      };
    }
  }

  // Local update ONLY after cloud write succeeds
  cachedFiles[school_id][slotKey] = newFile;
  safeSaveFilesStorage(cachedFiles);

  addAuditLog({
    time: newFile.time,
    userId: user.userId,
    email: user.email,
    schoolName: user.schoolName,
    actionType: 'UPLOAD',
    detail: `成功上傳檔案 [${fileInfo.name}]${fileInfo.driveFileId ? ' (已同步存至 Google Drive)' : ''}`,
  });

  notifySubscribers();
  return { success: true };
}

export async function deleteSchoolFile(
  school_id: string,
  slotKey: string,
  user: { email: string; name: string; schoolName: string; userId: string },
  isAdminAction: boolean = false
): Promise<{ success: boolean; message?: string }> {
  if (cachedFiles[school_id] && cachedFiles[school_id][slotKey]) {
    const target = cachedFiles[school_id][slotKey];

    // Firestore deleteDoc with STRICT CLOUD VERIFICATION
    const docId = `${school_id}_${slotKey}`;
    if (db) {
      try {
        await deleteDoc(doc(db, 'schoolFiles', docId));
      } catch (e: any) {
        console.error('Firestore deleteSchoolFile error:', e);
        return { success: false, message: `雲端資料庫檔案刪除失敗：${e.message || e}` };
      }
    }

    delete cachedFiles[school_id][slotKey];
    safeSaveFilesStorage(cachedFiles);

    addAuditLog({
      time: new Date().toLocaleString('zh-TW', { hour12: false }),
      userId: user.userId,
      email: user.email,
      schoolName: user.schoolName,
      actionType: 'DELETE',
      detail: isAdminAction
        ? `大會管理員徹底刪除學校 [${user.schoolName}] 的檔案 [${target.name}]`
        : `學校代表自行刪除檔案 [${target.name}]`,
    });

    notifySubscribers();
    return { success: true };
  }
  return { success: false, message: '找不到欲刪除的檔案' };
}

export async function markSchoolFileDead(
  school_id: string,
  slotKey: string,
  user: { email: string; name: string; schoolName: string; userId: string }
): Promise<{ success: boolean; message?: string }> {
  if (cachedFiles[school_id] && cachedFiles[school_id][slotKey]) {
    const target = cachedFiles[school_id][slotKey];
    const updated = {
      ...target,
      isDead: true,
      size: target.size || 0,
      driveFileId: target.driveFileId || '',
      driveUrl: target.driveUrl || '',
      school_id,
      uploadedByEmail: user.email,
    };

    // Firestore update with STRICT CLOUD VERIFICATION
    const docId = `${school_id}_${slotKey}`;
    if (db) {
      try {
        await setDoc(doc(db, 'schoolFiles', docId), updated);
      } catch (e: any) {
        console.error('Firestore markSchoolFileDead error:', e);
        return { success: false, message: `退件更新至雲端失敗：${e.message || e}` };
      }
    }

    target.isDead = true;
    safeSaveFilesStorage(cachedFiles);

    addAuditLog({
      time: new Date().toLocaleString('zh-TW', { hour12: false }),
      userId: user.userId,
      email: user.email,
      schoolName: user.schoolName,
      actionType: 'DELETE',
      detail: `大會管理員退件註銷檔案 [${target.name}]`,
    });

    notifySubscribers();
    return { success: true };
  }
  return { success: false, message: '找不到欲退件的檔案' };
}

// Audit Logs
export function getAuditLogs(): AuditLog[] {
  return cachedLogs && cachedLogs.length > 0
    ? cachedLogs
    : getStorage<AuditLog[]>(STORAGE_KEYS.LOGS, []);
}

export function addAuditLog(log: AuditLog): void {
  const newLog = {
    ...log,
    id: log.id || `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  };

  cachedLogs.unshift(newLog); // latest first
  if (cachedLogs.length > 300) cachedLogs.pop();
  setStorage(STORAGE_KEYS.LOGS, cachedLogs);

  // Firestore update
  if (db) {
    setDoc(doc(db, 'auditLogs', newLog.id), newLog).catch(e => {
      console.error('Firestore addAuditLog error:', e);
    });
  }
}


// Current Auth Session State
export function getCurrentAuthSession(): { email: string; mode: 'user' | 'admin' } {
  return getStorage(STORAGE_KEYS.CURRENT_AUTH, {
    email: '',
    mode: 'user',
  });
}

// Template Items Getters & Setters
export function getTemplateItems(): TemplateItemConfig[] {
  return cachedTemplates && cachedTemplates.length > 0
    ? cachedTemplates
    : DEFAULT_TEMPLATE_ITEMS;
}

export async function saveTemplateItems(items: TemplateItemConfig[]): Promise<{ success: boolean; message: string }> {
  try {
    cachedTemplates = items;
    setStorage(STORAGE_KEYS.TEMPLATES, items);
    if (db) {
      await setDoc(doc(db, 'systemSettings', 'templateItems'), { items }, { merge: true });
    }
    notifySubscribers();
    return { success: true, message: '已成功儲存並同步「下載範本檔」設定！' };
  } catch (err: any) {
    console.error('saveTemplateItems error:', err);
    return { success: false, message: '儲存範本檔設定失敗：' + (err as Error).message };
  }
}

// Upload Slots Getters & Setters
export function getUploadSlots(): UploadSlotConfig[] {
  return cachedUploadSlots && cachedUploadSlots.length > 0
    ? cachedUploadSlots
    : DEFAULT_UPLOAD_SLOTS;
}

export async function saveUploadSlots(slots: UploadSlotConfig[]): Promise<{ success: boolean; message: string }> {
  try {
    cachedUploadSlots = slots;
    setStorage(STORAGE_KEYS.UPLOAD_SLOTS, slots);
    if (db) {
      await setDoc(doc(db, 'systemSettings', 'uploadSlots'), { slots }, { merge: true });
    }
    notifySubscribers();
    return { success: true, message: '已成功儲存並同步「上傳檔案表件」設定！' };
  } catch (err: any) {
    console.error('saveUploadSlots error:', err);
    return { success: false, message: '儲存上傳項目設定失敗：' + (err as Error).message };
  }
}


export function setCurrentAuthSession(session: { email: string; mode: 'user' | 'admin' }): void {
  setStorage(STORAGE_KEYS.CURRENT_AUTH, session);
}
