import React, { useState, useEffect } from 'react';
import { SCHOOLS } from '../data/schools';
import { UserRecord, UploadedFile, AdminDashboardItem, AuditLog, TemplateItemConfig, UploadSlotConfig } from '../types';
import { validatePhoneFormat, sanitizeInput } from '../lib/security';
import {
  Download, Upload, Trash2, CheckCircle2, AlertTriangle, RefreshCw, FileText, Search,
  ShieldAlert, Users, FolderCheck, ShieldCheck, UserPlus, Eye, FileDown, PlusCircle, LogOut, ExternalLink, ArrowRight,
  Edit3, UserX, Save, Lock, Info, X, HardDrive, School, CloudUpload, FolderOpen
} from 'lucide-react';
import {
  initSeedData, getUserByEmail, registerUser, isSchoolRegistered, getSchoolFiles, getAllSchoolFilesWithDead,
  getSchoolSlotFile, saveSchoolFile, deleteSchoolFile, markSchoolFileDead, getAllFilesMap, getUsers, getAuditLogs, addAuditLog, isAdmin,
  getCurrentAuthSession, setCurrentAuthSession, subscribeDataChanges, purgeAllUserData,
  updateUserProfile, deleteUserAccount, getTemplateItems, getUploadSlots, deriveDownloadUrl, parseLogTimestamp
} from '../services/storageService';
import {
  getDriveAccessToken,
  requestDriveAuth,
  getTargetDriveFolderId,
  setTargetDriveFolderId,
  clearDriveAccessToken,
  uploadFileToDrive,
  deleteFileFromDrive,
  getCustomDriveClientId,
  setCustomDriveClientId,
  getEffectiveDriveClientId,
  getGasWebAppUrl,
  setGasWebAppUrl,
  ensureDriveSettingsLoaded,
  parseErrorDetails,
  fileToBase64,
  dataURLtoFile,
} from '../services/googleDriveService';
import { UserRegisterView } from './UserRegisterView';
import { AdminManager } from './AdminManager';
import { GoogleAuthModal } from './GoogleAuthModal';
import { AppConfigManager } from './AppConfigManager';


interface AppSimulatorProps {
  userEmail: string;
  authMode: 'admin' | 'user';
  setAuthMode: (mode: 'admin' | 'user') => void;
  onOpenAuthModal: () => void;
}

export const AppSimulator: React.FC<AppSimulatorProps> = ({
  userEmail,
  authMode,
  setAuthMode,
  onOpenAuthModal,
}) => {
  const [, setTick] = useState(0);

  // Admin View Sub-Tab state: 'dashboard' | 'admins' | 'logs' | 'drive' | 'configs'
  const [adminSubTab, setAdminSubTab] = useState<'dashboard' | 'admins' | 'logs' | 'drive' | 'configs'>('dashboard');

  // Dynamic Upload Slots and Download Templates state
  const [fileSlots, setFileSlots] = useState<UploadSlotConfig[]>(getUploadSlots());
  const [templateItems, setTemplateItems] = useState<TemplateItemConfig[]>(getTemplateItems());

  // Ensure seed data and real-time listeners are initialized
  useEffect(() => {
    initSeedData();
    setFileSlots(getUploadSlots());
    setTemplateItems(getTemplateItems());
    const unsub = subscribeDataChanges(() => {
      setTick(t => t + 1);
      setDriveFolderIdState(getTargetDriveFolderId());
      setGasWebAppUrlState(getGasWebAppUrl());
      setCustomClientIdState(getCustomDriveClientId());
      setDriveAuthTokenState(getDriveAccessToken());
      setFileSlots(getUploadSlots());
      setTemplateItems(getTemplateItems());
    });
    return () => unsub();
  }, [userEmail]);

  const isCurrentAdmin = isAdmin(userEmail);

  // Get logged-in user record (if registered)
  const userRecord = getUserByEmail(userEmail);


  // Google Drive Settings state
  const [driveFolderId, setDriveFolderIdState] = useState(getTargetDriveFolderId());
  const [gasWebAppUrl, setGasWebAppUrlState] = useState(getGasWebAppUrl());
  const [customClientId, setCustomClientIdState] = useState(getCustomDriveClientId());
  const [driveAuthToken, setDriveAuthTokenState] = useState<string | null>(getDriveAccessToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  // Selected Files pending upload in school user view
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({
    form: null,
    stamp: null,
    cert: null,
    receipt: null,
  });

  // Admin Dashboard search and filter states
  const [dashSearch, setDashSearch] = useState('');
  const [dashFilter, setDashFilter] = useState<'all' | 'registered' | 'unregistered' | 'completed'>('all');
  const [sortColumn, setSortColumn] = useState<string>('school_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Logs Filter states
  const [logKeyword, setLogKeyword] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('');
  const [logSortOrder, setLogSortOrder] = useState<'desc' | 'asc'>('desc');

  // UI status messages
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // User Self Edit state
  const [isEditingSelf, setIsEditingSelf] = useState(false);
  const [selfEditName, setSelfEditName] = useState('');
  const [selfEditPhone, setSelfEditPhone] = useState('');
  const [selfEditNotes, setSelfEditNotes] = useState('');
  const [selfPhoneError, setSelfPhoneError] = useState<string | null>(null);

  // Admin Edit / Delete User state
  const [adminEditingUser, setAdminEditingUser] = useState<UserRecord | null>(null);
  const [adminEditName, setAdminEditName] = useState('');
  const [adminEditPhone, setAdminEditPhone] = useState('');
  const [adminEditSchoolId, setAdminEditSchoolId] = useState('');
  const [adminEditNotes, setAdminEditNotes] = useState('');
  const [deletingUserItem, setDeletingUserItem] = useState<AdminDashboardItem | null>(null);

  // Admin Delete File state
  const [adminDeletingFile, setAdminDeletingFile] = useState<{
    school_id: string;
    school_name: string;
    file: UploadedFile;
  } | null>(null);

  // System Reset Modal state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Expandable GAS code toggle state
  const [showGasCode, setShowGasCode] = useState(false);

  // Admin Manual Drive Sync states
  const [syncingFileKey, setSyncingFileKey] = useState<string | null>(null);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState<{ current: number; total: number } | null>(null);

  const handleAdminSyncSingleFile = async (school_id: string, school_name: string, file: UploadedFile) => {
    const syncKey = `${school_id}_${file.slotKey}`;
    setSyncingFileKey(syncKey);
    setStatusMessage(null);

    try {
      const driveSettings = await ensureDriveSettingsLoaded();
      const targetFolderId = driveSettings.folderId || getTargetDriveFolderId();
      if (!targetFolderId) {
        setStatusMessage({
          type: 'error',
          text: '❌ 補傳失敗：大會尚未設定 Google Drive 目標資料夾 ID。請至【設定與說明】區進行設定！',
        });
        setSyncingFileKey(null);
        return;
      }

      if (!file.url || !file.url.startsWith('data:')) {
        setStatusMessage({
          type: 'error',
          text: `❌ 檔案「${file.name}」無法重新補傳：該檔案不是存於 Firestore 的 Base64 格式，或已完成雲端同步。`,
        });
        setSyncingFileKey(null);
        return;
      }

      const fileObj = dataURLtoFile(file.url, file.name);
      const driveResult = await uploadFileToDrive(fileObj, targetFolderId, file.name, file.driveFileId);

      const saveRes = await saveSchoolFile(
        school_id,
        file.slotKey,
        {
          name: file.name,
          url: file.url,
          size: file.size,
          driveFileId: driveResult.id,
          driveUrl: driveResult.url,
        },
        {
          email: userEmail,
          name: '大會管理員',
          schoolName: school_name,
          userId: 'ADMIN',
        }
      );

      if (!saveRes.success) {
        throw new Error(saveRes.message || '寫入資料庫失敗');
      }

      addAuditLog({
        time: new Date().toLocaleString('zh-TW', { hour12: false }),
        userId: 'ADMIN',
        email: userEmail,
        schoolName: school_name,
        actionType: 'UPLOAD',
        detail: `☁️ 管理員將「${school_name}」之檔案 [${file.name}] 手動補傳同步至 Google Drive 成功！`,
      });

      setStatusMessage({
        type: 'success',
        text: `🎉 成功將【${school_name}】的檔案「${file.name}」補傳上傳至大會 Google Drive！`,
      });
      forceRefresh();
    } catch (err) {
      const errMsg = parseErrorDetails(err);
      setStatusMessage({
        type: 'error',
        text: `❌ 手動補傳檔案「${file.name}」至 Google Drive 失敗：${errMsg}`,
      });
    } finally {
      setSyncingFileKey(null);
    }
  };

  const calculateUnsyncedFilesCount = () => {
    const filesMap = getAllFilesMap();
    let count = 0;
    Object.keys(filesMap).forEach(sId => {
      const sFiles = filesMap[sId] || {};
      Object.values(sFiles).forEach(f => {
        if (!f.isDead && !f.driveFileId && f.url && f.url.startsWith('data:')) {
          count++;
        }
      });
    });
    return count;
  };

  const handleAdminBatchSyncAllFiles = async () => {
    const driveSettings = await ensureDriveSettingsLoaded();
    const targetFolderId = driveSettings.folderId || getTargetDriveFolderId();
    if (!targetFolderId) {
      setStatusMessage({
        type: 'error',
        text: '❌ 批次補傳失敗：大會尚未設定 Google Drive 目標資料夾 ID。請至【設定與說明】區進行設定！',
      });
      return;
    }

    const filesMap = getAllFilesMap();
    const pendingFiles: { school_id: string; school_name: string; file: UploadedFile }[] = [];

    Object.keys(filesMap).forEach(sId => {
      const schoolObj = SCHOOLS.find(s => s.school_id === sId);
      const schoolName = schoolObj ? schoolObj.school_name : `學校 ${sId}`;
      const sFiles = filesMap[sId] || {};
      Object.values(sFiles).forEach(f => {
        if (!f.isDead && !f.driveFileId && f.url && f.url.startsWith('data:')) {
          pendingFiles.push({ school_id: sId, school_name: schoolName, file: f });
        }
      });
    });

    if (pendingFiles.length === 0) {
      setStatusMessage({
        type: 'success',
        text: '✨ 目前全區所有學校檔案皆已同步至 Google Drive，無須補傳！',
      });
      return;
    }

    if (!window.confirm(`【大會管理員權限】檢測到共有 ${pendingFiles.length} 份僅存於 Firestore 資料庫的檔案，確定要自動批次補傳至大會 Google Drive 資料夾嗎？`)) {
      return;
    }

    setIsBatchSyncing(true);
    setBatchSyncProgress({ current: 0, total: pendingFiles.length });
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const item = pendingFiles[i];
      setBatchSyncProgress({ current: i + 1, total: pendingFiles.length });

      try {
        const fileObj = dataURLtoFile(item.file.url, item.file.name);
        const driveResult = await uploadFileToDrive(fileObj, targetFolderId, item.file.name, item.file.driveFileId);

        const saveRes = await saveSchoolFile(
          item.school_id,
          item.file.slotKey,
          {
            name: item.file.name,
            url: item.file.url,
            size: item.file.size,
            driveFileId: driveResult.id,
            driveUrl: driveResult.url,
          },
          {
            email: userEmail,
            name: '大會管理員',
            schoolName: item.school_name,
            userId: 'ADMIN',
          }
        );

        if (!saveRes.success) {
          throw new Error(saveRes.message || '寫入資料庫失敗');
        }

        addAuditLog({
          time: new Date().toLocaleString('zh-TW', { hour12: false }),
          userId: 'ADMIN',
          email: userEmail,
          schoolName: item.school_name,
          actionType: 'UPLOAD',
          detail: `☁️ 批次補傳 [${item.school_name}] - [${item.file.name}] 至 Google Drive 成功`,
        });

        successCount++;
      } catch (e) {
        console.warn(`Batch sync failed for ${item.school_name} - ${item.file.name}:`, e);
        failCount++;
      }
    }

    setIsBatchSyncing(false);
    setBatchSyncProgress(null);
    forceRefresh();

    if (failCount === 0) {
      setStatusMessage({
        type: 'success',
        text: `🎉 批次補傳完成！共成功同步 ${successCount} 份檔案至大會 Google Drive！`,
      });
    } else {
      setStatusMessage({
        type: 'warning',
        text: `⚠️ 批次補傳結束：成功同步 ${successCount} 份，失敗 ${failCount} 份。失敗檔案可點擊單檔旁邊的「補傳雲端」按鈕重新再試！`,
      });
    }
  };

  const handleConfirmAdminDeleteFile = async () => {
    if (!adminDeletingFile) return;

    const { school_id, school_name, file } = adminDeletingFile;
    setAdminDeletingFile(null);

    // Attempt to delete from Google Drive if file has driveFileId and OAuth token or GAS Web App is present
    if (file.driveFileId && (getDriveAccessToken() || getGasWebAppUrl())) {
      try {
        await deleteFileFromDrive(file.driveFileId);
      } catch (err) {
        console.warn('Admin delete from Drive error:', err);
      }
    }

    const res = await deleteSchoolFile(
      school_id,
      file.slotKey,
      {
        email: userEmail,
        name: '大會管理員',
        schoolName: school_name,
        userId: 'ADMIN',
      },
      true
    );

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `🗑️ 大會管理員已成功徹底刪除學校【${school_name}】之檔案 [${file.name}]！\nGoogle 雲端硬碟與系統紀錄皆已同步移除。`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: res.message || '刪除檔案失敗，請稍後重試！',
      });
    }
    forceRefresh();
  };

  // Handlers for user self edit
  const handleSaveSelfProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord) return;
    setSelfPhoneError(null);

    // Sanitize fields for security (XSS protection)
    const sanitizedName = sanitizeInput(selfEditName);
    const sanitizedPhone = sanitizeInput(selfEditPhone);
    const sanitizedNotes = sanitizeInput(selfEditNotes);

    if (!sanitizedName) {
      setStatusMessage({ type: 'error', text: '請輸入代表姓名，且不得包含 HTML 標籤。' });
      return;
    }
    if (!sanitizedPhone) {
      setSelfPhoneError('請輸入代表聯絡電話。');
      return;
    }

    // Phone format validation
    if (!validatePhoneFormat(sanitizedPhone)) {
      setSelfPhoneError('聯絡電話格式不正確！必須是有效的台灣手機 (如：0912-345678) 或市話 (如：04-22021521)。');
      return;
    }

    const res = await updateUserProfile(
      userRecord.user_email,
      {
        user_name: sanitizedName,
        user_phone: sanitizedPhone,
        notes: sanitizedNotes,
      },
      {
        email: userEmail,
        name: userRecord.user_name,
        schoolName: userRecord.school_name,
        isAdmin: false,
      }
    );

    if (res.success) {
      setStatusMessage({ type: 'success', text: `✅ ${res.message}` });
      setIsEditingSelf(false);
      forceRefresh();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  // Handlers for admin editing representative user
  const handleAdminEditUserClick = (itemOrUser: AdminDashboardItem | UserRecord) => {
    let user: UserRecord | null = null;
    if ('user_email' in itemOrUser && itemOrUser.user_email) {
      user = 'user_id' in itemOrUser ? (itemOrUser as UserRecord) : getUserByEmail(itemOrUser.user_email);
    }
    if (!user) {
      setStatusMessage({ type: 'error', text: '找不到該校代表帳號之詳細資料！' });
      return;
    }
    setAdminEditingUser(user);
    setAdminEditName(user.user_name);
    setAdminEditPhone(user.user_phone);
    setAdminEditSchoolId(user.school_id);
    setAdminEditNotes(user.notes || '');
  };

  const handleAdminSaveUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEditingUser) return;

    // Sanitize fields for security (XSS protection)
    const sanitizedName = sanitizeInput(adminEditName);
    const sanitizedPhone = sanitizeInput(adminEditPhone);
    const sanitizedNotes = sanitizeInput(adminEditNotes);

    if (!sanitizedName) {
      setStatusMessage({ type: 'error', text: '請輸入代表姓名，且不得包含 HTML 標籤。' });
      return;
    }
    if (!sanitizedPhone) {
      setStatusMessage({ type: 'error', text: '請輸入代表聯絡電話。' });
      return;
    }

    // Phone format validation
    if (!validatePhoneFormat(sanitizedPhone)) {
      setStatusMessage({
        type: 'error',
        text: '聯絡電話格式不正確！必須是有效的台灣手機 (如：0912-345678) 或市話 (如：04-22021521)，可含分機，且長度合理。'
      });
      return;
    }

    const res = await updateUserProfile(
      adminEditingUser.user_email,
      {
        user_name: sanitizedName,
        user_phone: sanitizedPhone,
        school_id: adminEditSchoolId,
        notes: sanitizedNotes,
      },
      {
        email: userEmail,
        name: '大會管理員',
        schoolName: '總管理處',
        isAdmin: true,
      }
    );

    if (res.success) {
      setStatusMessage({ type: 'success', text: `✅ ${res.message}` });
      setAdminEditingUser(null);
      forceRefresh();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleAdminDeleteUserClick = (itemOrUser: AdminDashboardItem | UserRecord) => {
    const email = itemOrUser.user_email;
    if (!email || email === '-') {
      setStatusMessage({ type: 'error', text: '該校尚未註冊代表帳號！' });
      return;
    }
    const schoolName = itemOrUser.school_name;
    setDeletingUserItem({
      school_id: itemOrUser.school_id,
      school_name: schoolName,
      user_email: email,
      user_name: itemOrUser.user_name,
      user_phone: itemOrUser.user_phone,
      registered: true,
      upload_count: 0,
      files: [],
    });
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUserItem || !deletingUserItem.user_email) return;

    const targetEmail = deletingUserItem.user_email;
    setDeletingUserItem(null);

    const res = await deleteUserAccount(targetEmail, {
      email: userEmail,
      name: '大會管理員',
      schoolName: '總管理處',
      isAdmin: true,
    });

    if (res.success) {
      setStatusMessage({ type: 'success', text: `🗑️ ${res.message}` });
      forceRefresh();
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  // Refresh trigger state for component updates
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefresh = () => setRefreshKey(prev => prev + 1);

  // Safe & Robust File Download Handler (Converts Data URL / Blob URL dynamically without network errors)
  const downloadUploadedFile = async (file: { name: string; url: string }) => {
    if (!file || !file.url) {
      alert('無效的檔案連結');
      return;
    }

    // 1. Data URL (Base64) - Convert to fresh Blob at download time
    if (file.url.startsWith('data:')) {
      try {
        const parts = file.url.split(';base64,');
        const contentType = parts[0].replace('data:', '') || 'application/octet-stream';
        const base64Data = parts[1] || '';

        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      } catch (err) {
        console.error('Data URL download error:', err);
        alert('檔案解碼下載失敗，請嘗試重新上傳。');
        return;
      }
    }

    // 2. Temporary Blob URL (blob:...)
    if (file.url.startsWith('blob:')) {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error('Blob expired');
        const blob = await res.blob();
        const freshBlobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = freshBlobUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(freshBlobUrl), 10000);
        return;
      } catch (e) {
        console.warn('Blob URL fetch error:', e);
        alert(`⚠️ 檔案「${file.name}」先前上傳的瀏覽器暫存位址已過期。\n請點選「刪除檔案」並重新選取電腦檔案上傳，即可建立永續下載存檔！`);
        return;
      }
    }

    // 3. Google Drive Link - Open Google Drive Viewer / Download Page
    if (file.url.includes('drive.google.com')) {
      let driveId = '';
      const match = file.url.match(/\/d\/([a-zA-Z0-9_-]+)/) || file.url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        driveId = match[1];
      }

      const targetUrl = driveId
        ? `https://drive.google.com/file/d/${driveId}/view?usp=sharing`
        : file.url;

      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // 4. Fallback standard http/https link
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to handle local file choice
  const handleFileChange = (slotKey: string, file: File | null) => {
    if (file && file.size > 2 * 1024 * 1024) {
      setStatusMessage({
        type: 'error',
        text: `❌ 檔案「${file.name}」大小（${(file.size / (1024 * 1024)).toFixed(1)}MB）超過單檔 2MB 上限！`,
      });
      return;
    }
    setSelectedFiles(prev => ({ ...prev, [slotKey]: file }));
    setStatusMessage(null);
  };

  // Upload file action
  const handleUploadSubmit = async () => {
    if (!userRecord) {
      setStatusMessage({ type: 'error', text: '請先完成學校代表註冊！' });
      return;
    }

    const activeUploads = (Object.entries(selectedFiles) as [string, File | null][])
      .filter((entry): entry is [string, File] => entry[1] !== null);

    if (activeUploads.length === 0) {
      setStatusMessage({ type: 'error', text: '⚠️ 請至少選擇 1 項欲上傳的檔案！' });
      return;
    }

    // Validate size & extension
    for (const [key, file] of activeUploads) {
      const slotCfg = fileSlots.find(s => s.key === key);
      if (!slotCfg) continue;

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!slotCfg.exts.includes(ext)) {
        setStatusMessage({
          type: 'error',
          text: `❌ 「${slotCfg.label}」選取了副檔名 .${ext}，不符合格式需求！只允許上傳：${slotCfg.exts.join(', ')}`,
        });
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        setStatusMessage({
          type: 'error',
          text: `❌ 檔案「${file.name}」過大（超過 2MB），請壓縮後再上傳！`,
        });
        return;
      }
    }

    setIsUploading(true);
    setStatusMessage(null);

    // Auto-fetch fresh drive settings from Firestore to prevent stale/empty localStorage issues
    const driveSettings = await ensureDriveSettingsLoaded();
    const targetFolderId = driveSettings.folderId || getTargetDriveFolderId();
    const gasWebAppUrl = driveSettings.gasWebAppUrl || getGasWebAppUrl();
    const driveAccessToken = getDriveAccessToken();

    if (!targetFolderId) {
      addAuditLog({
        time: new Date().toLocaleString('zh-TW', { hour12: false }),
        userId: userRecord.user_id,
        email: userEmail,
        schoolName: userRecord.school_name,
        actionType: 'UPLOAD_FAILED',
        detail: '❌ 檔案上傳失敗：大會管理員尚未設定指定 Google Drive 資料夾 ID',
      });
      setIsUploading(false);
      setStatusMessage({
        type: 'error',
        text: '❌ 檔案上傳失敗：大會管理員尚未設定指定 Google Drive 資料夾 ID。\n請聯繫主辦學校 04-22021521#1340、1341',
      });
      return;
    }

    if (!driveAccessToken && !gasWebAppUrl) {
      addAuditLog({
        time: new Date().toLocaleString('zh-TW', { hour12: false }),
        userId: userRecord.user_id,
        email: userEmail,
        schoolName: userRecord.school_name,
        actionType: 'UPLOAD_FAILED',
        detail: '❌ 檔案上傳失敗：大會管理員尚未設定 GAS 雲端網址，且無有效 Google Drive 授權',
      });
      setIsUploading(false);
      setStatusMessage({
        type: 'error',
        text: '❌ 檔案上傳失敗：大會管理員尚未授權連線 Google Drive (或未設定 GAS 雲端網址)。\n請聯繫主辦學校 04-22021521#1340、1341',
      });
      return;
    }

    try {
      const uploadedNames: string[] = [];
      let hasDriveWarning = false;
      let driveWarningMsg = '';

      for (const [slotKey, file] of activeUploads) {
        const slotCfg = fileSlots.find(s => s.key === slotKey)!;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const finalName = `${userRecord.school_id}_${slotCfg.targetName}.${ext}`;

        // Check if school already has an existing file record for this slot to pass existingDriveFileId for in-place overwrite
        const existingSlotFile = getSchoolSlotFile(userRecord.school_id, slotKey);
        const existingDriveFileId = existingSlotFile?.driveFileId;

        let driveFileId: string | undefined = undefined;
        let driveUrl: string | undefined = undefined;
        let driveSyncErr: string | null = null;

        // Step 1: Attempt Google Drive Auto-Sync Upload (passing existingDriveFileId to replace content on the same file ID)
        try {
          const driveResult = await uploadFileToDrive(file, targetFolderId, finalName, existingDriveFileId);
          driveFileId = driveResult.id;
          driveUrl = driveResult.webViewLink;
        } catch (driveErr: any) {
          driveSyncErr = parseErrorDetails(driveErr);
          console.warn(`Google Drive sync notice for [${finalName}]:`, driveSyncErr);
          hasDriveWarning = true;
          driveWarningMsg = driveSyncErr;

          // Record COMPLETE failed Drive sync error to Audit Logs in Firestore so admin can review full diagnostic reason
          addAuditLog({
            time: new Date().toLocaleString('zh-TW', { hour12: false }),
            userId: userRecord.user_id,
            email: userEmail,
            schoolName: userRecord.school_name,
            actionType: 'UPLOAD_FAILED',
            detail: `❌ 上傳 [${finalName}] 至 Google Drive 同步提醒：${driveSyncErr}`,
          });
        }

        // Step 2: Convert file to Base64 URL to guarantee 100% self-contained database persistence
        let base64Url = '';
        try {
          const b64 = await fileToBase64(file);
          base64Url = `data:${file.type || 'application/octet-stream'};base64,${b64}`;
        } catch (b64Err: any) {
          const b64Msg = parseErrorDetails(b64Err);
          setIsUploading(false);
          setStatusMessage({
            type: 'error',
            text: `❌ 讀取檔案內容失敗 [${file.name}]：${b64Msg}。\n請重新點選檔案選擇框並上傳。`,
          });
          return;
        }

        // Step 3: Save file record to Firestore schoolFiles!
        const saveRes = await saveSchoolFile(
          userRecord.school_id,
          slotKey,
          {
            name: finalName,
            url: base64Url,
            size: file.size,
            driveFileId,
            driveUrl,
          },
          {
            email: userEmail,
            name: userRecord.user_name,
            schoolName: userRecord.school_name,
            userId: userRecord.user_id,
          }
        );

        if (!saveRes.success) {
          throw new Error(saveRes.message || '寫入大會中央資料庫失敗');
        }

        uploadedNames.push(slotCfg.targetName);
      }

      // Clear file selection inputs
      setSelectedFiles({ form: null, stamp: null, cert: null, receipt: null });

      if (hasDriveWarning) {
        setStatusMessage({
          type: 'warning',
          text: `⚠️ 成功儲存 ${uploadedNames.length} 份檔案至大會系統資料庫！\n\n您的報名與檔案已安全存入大會雲端系統，大會後台已確實收到紀錄。`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `🎉 成功完成 ${uploadedNames.length} 份檔案上傳！\n檔案已同步存至 Google 雲端硬碟與大會中央數據庫。`,
        });
      }
      forceRefresh();
    } catch (err) {
      const errMsg = parseErrorDetails(err);
      console.error('File upload error:', err);
      setStatusMessage({ type: 'error', text: `❌ 檔案上傳發生錯誤：${errMsg}` });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete uploaded file (User self-deletion)
  const handleDeleteFile = async (slotKey: string, fileName: string) => {
    if (!userRecord) return;

    const existingSlotFile = getSchoolSlotFile(userRecord.school_id, slotKey);

    if (existingSlotFile?.driveFileId && (getDriveAccessToken() || getGasWebAppUrl())) {
      try {
        await deleteFileFromDrive(existingSlotFile.driveFileId);
      } catch (err) {
        console.warn('User delete from drive error:', err);
      }
    }

    const delRes = await deleteSchoolFile(userRecord.school_id, slotKey, {
      email: userEmail,
      name: userRecord.user_name,
      schoolName: userRecord.school_name,
      userId: userRecord.user_id,
    });

    if (delRes.success) {
      // Reset selected slot state
      setSelectedFiles(prev => ({ ...prev, [slotKey]: null }));

      setStatusMessage({
        type: 'success',
        text: `🗑️ 已成功刪除檔案「${fileName}」！\nGoogle 雲端硬碟與系統紀錄皆已同步移除，該欄位已回復初始化，您可以隨時重新選擇檔案上傳。`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: delRes.message || '刪除檔案失敗，請稍後重試！',
      });
    }
    forceRefresh();
  };

  // Build Admin Items for 55 schools
  const getAdminDashboardItems = (): AdminDashboardItem[] => {
    const allUsersMap = getUsers();

    return SCHOOLS.map(school => {
      // Find registered users for this school
      const schoolUsers = Object.values(allUsersMap).filter(u => u.school_id === school.school_id);
      const regUser = schoolUsers[0];
      const activeFiles = getSchoolFiles(school.school_id);
      const allFilesWithDead = getAllSchoolFilesWithDead(school.school_id);

      return {
        school_id: school.school_id,
        school_name: school.school_name,
        registered: schoolUsers.length > 0,
        user_name: schoolUsers.length > 1
          ? schoolUsers.map(u => u.user_name).join(' / ')
          : regUser ? regUser.user_name : '-',
        user_phone: schoolUsers.length > 1
          ? schoolUsers.map(u => u.user_phone).join(' / ')
          : regUser ? regUser.user_phone : '-',
        user_email: schoolUsers.length > 1
          ? schoolUsers.map(u => u.user_email).join(' / ')
          : regUser ? regUser.user_email : '-',
        upload_count: activeFiles.length,
        files: allFilesWithDead,
        users: schoolUsers,
      };
    });
  };

  // Filter & Sort Admin Items
  const adminItems = getAdminDashboardItems();
  const filteredAdminItems = adminItems.filter(item => {
    const matchKw =
      !dashSearch ||
      item.school_name.toLowerCase().includes(dashSearch.toLowerCase()) ||
      item.user_name.toLowerCase().includes(dashSearch.toLowerCase()) ||
      item.user_phone.includes(dashSearch) ||
      item.user_email.toLowerCase().includes(dashSearch.toLowerCase());

    if (!matchKw) return false;

    if (dashFilter === 'registered') return item.registered;
    if (dashFilter === 'unregistered') return !item.registered;
    if (dashFilter === 'completed') return item.upload_count === 4;

    return true;
  }).sort((a, b) => {
    let valA: any = a[sortColumn as keyof AdminDashboardItem];
    let valB: any = b[sortColumn as keyof AdminDashboardItem];

    if (sortColumn === 'school_id') {
      valA = parseInt(a.school_id, 10);
      valB = parseInt(b.school_id, 10);
    } else if (sortColumn === 'registered') {
      valA = a.registered ? 1 : 0;
      valB = b.registered ? 1 : 0;
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSortClick = (colName: string) => {
    if (sortColumn === colName) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(colName);
      setSortDirection('asc');
    }
  };

  // Filter Audit Logs
  const allLogs = getAuditLogs();
  const filteredLogs = allLogs.filter(l => {
    const matchKw =
      !logKeyword ||
      l.schoolName.toLowerCase().includes(logKeyword.toLowerCase()) ||
      l.email.toLowerCase().includes(logKeyword.toLowerCase()) ||
      l.detail.toLowerCase().includes(logKeyword.toLowerCase()) ||
      l.actionType.toLowerCase().includes(logKeyword.toLowerCase());
    const matchAct = !logActionFilter || l.actionType === logActionFilter;
    return matchKw && matchAct;
  }).sort((a, b) => {
    const tA = parseLogTimestamp(a.time, a.id);
    const tB = parseLogTimestamp(b.time, b.id);
    if (tA && tB && tA !== tB) {
      return logSortOrder === 'desc' ? tB - tA : tA - tB;
    }
    return logSortOrder === 'desc' ? (b.id || '').localeCompare(a.id || '') : (a.id || '').localeCompare(b.id || '');
  });

  // Export Dashboard to CSV/Excel format
  const handleExportCSV = () => {
    const headers = ['學校編號', '學校名稱', '註冊狀態', '代表姓名', '聯絡電話', 'Google Email', '上傳檔案件數'];
    const rows = adminItems.map(i => [
      i.school_id,
      `"${i.school_name}"`,
      i.registered ? '已註冊' : '未註冊',
      `"${i.user_name}"`,
      `"${i.user_phone}"`,
      `"${i.user_email}"`,
      i.upload_count,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `全區55所學校報名狀態總表_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // System Reset Handler
  const handleOpenResetModal = () => {
    setShowResetConfirmModal(true);
  };

  const handleExecuteReset = async () => {
    setIsResetting(true);
    try {
      const res = await purgeAllUserData(userEmail);
      if (res.success) {
        setStatusMessage({ type: 'success', text: '🎉 ' + res.message });
        forceRefresh();
      } else {
        setStatusMessage({ type: 'error', text: '❌ ' + res.message });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: '❌ 重置失敗：' + (err as Error).message });
    } finally {
      setIsResetting(false);
      setShowResetConfirmModal(false);
    }
  };

  // Check if current mode is ADMIN and user is authorized as ADMIN
  const showAdminView = isCurrentAdmin && authMode === 'admin';

  // User mode view logic:
  const showSchoolView = !showAdminView && !!userRecord;
  const showRegisterView = !showAdminView && !userRecord;

  return (
    <div className="bg-slate-100 min-h-screen pb-16 font-sans">
      {/* Centered Modal Status Notification */}
      {statusMessage && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center transform transition-all border border-slate-100 animate-in zoom-in-95 duration-200 relative">
            <button
              onClick={() => setStatusMessage(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
              title="關閉"
            >
              <X className="w-5 h-5" />
            </button>

            {statusMessage.type === 'success' ? (
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>
            ) : statusMessage.type === 'warning' ? (
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <AlertTriangle className="w-9 h-9" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <AlertTriangle className="w-9 h-9" />
              </div>
            )}

            <h3 className="text-lg font-bold text-slate-800">
              {statusMessage.type === 'success'
                ? '操作完成'
                : statusMessage.type === 'warning'
                ? '檔案上傳成功 (雲端同步提醒)'
                : '系統提示資訊'}
            </h3>

            <p className="text-sm font-medium text-slate-600 mt-2 mb-6 leading-relaxed whitespace-pre-line text-left">
              {statusMessage.text}
            </p>

            <button
              onClick={() => setStatusMessage(null)}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-white shadow-md hover:shadow-lg transition-all cursor-pointer ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
                  : statusMessage.type === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-700 active:scale-[0.98]'
                  : 'bg-slate-800 hover:bg-slate-900 active:scale-[0.98]'
              }`}
            >
              確定並關閉
            </button>
          </div>
        </div>
      )}

      {/* RENDER VIEW ACCORDING TO USER STATE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* 1. SCENARIO A: UNAUTHENTICATED USER (NEEDS LOGIN) */}
        {!userEmail && (
          <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
            <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-200/80 space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
                <School className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  臺中市童軍專科考驗與聯團露營報名系統
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed max-w-lg mx-auto">
                  本系統專供全區 55 所學校代表上傳報名表件、大會審核與檔案管理。請點擊下方按鈕進行 Google 身分驗證與登入。
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 hover:shadow-xl transition-all text-sm inline-flex items-center space-x-2.5 cursor-pointer transform hover:-translate-y-0.5"
                >
                  <UserPlus className="w-5 h-5" />
                  <span>點此驗證 / 登入 Google 帳號</span>
                </button>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 text-left border border-slate-200 space-y-1">
                <p className="font-bold text-slate-700">🔒 身分驗證與權限說明：</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px]">
                  <li>學校代表：登入後請選擇您代表的學校進行資料綁定與表件上傳。</li>
                  <li>大會管理員：請以承辦學校授權之 Google 帳號登入即可開啟管理權限。</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 2. SCENARIO B: USER LOGGED IN, NEEDS REGISTRATION */}
        {userEmail && showRegisterView && (
          <UserRegisterView
            userEmail={userEmail}
            onSuccessRegister={() => {
              setStatusMessage({ type: 'success', text: '🎉 註冊成功！系統已將您的 Google 帳號綁定至代表學校。' });
              forceRefresh();
            }}
            onSwitchAccount={onOpenAuthModal}
          />
        )}

        {/* 2. SCENARIO B: ADMIN VIEW */}
        {showAdminView && (
          <div className="space-y-6">
            {/* Admin Header Notice */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4 border border-slate-800">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold">社團組總管理員後台</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      主辦單位權限 (臺中二中)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    目前登入：<span className="text-amber-300 font-bold">{userEmail}</span> | 可隨時切換為代表學校上傳視角
                  </p>
                </div>
              </div>

              {/* Sub-Tabs for Admin */}
              <div className="flex items-center space-x-1 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setAdminSubTab('dashboard')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    adminSubTab === 'dashboard'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>全區 55 校報名總表</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('admins')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    adminSubTab === 'admins'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>管理員帳號管理</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('logs')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    adminSubTab === 'logs'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>系統操作 Audit Logs</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('drive')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    adminSubTab === 'drive'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <HardDrive className="w-4 h-4" />
                  <span>Google Drive 自動備份與資料夾設定</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubTab('configs')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    adminSubTab === 'configs'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>下載範本與上傳表件設定</span>
                </button>
              </div>

            </div>

            {/* SUB-TAB 1: DASHBOARD */}
            {adminSubTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Stats Summary Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">全區參與學校</div>
                    <div className="text-3xl font-black text-slate-800 mt-1">55 <span className="text-xs font-normal text-slate-500">所</span></div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">已完成帳號註冊</div>
                    <div className="text-3xl font-black text-emerald-600 mt-1">
                      {adminItems.filter(i => i.registered).length} <span className="text-xs font-normal text-slate-500">校</span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">四項指定檔案皆齊全</div>
                    <div className="text-3xl font-black text-blue-600 mt-1">
                      {adminItems.filter(i => i.upload_count === 4).length} <span className="text-xs font-normal text-slate-500">校</span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">檔案繳交總計件數</div>
                    <div className="text-3xl font-black text-purple-600 mt-1">
                      {adminItems.reduce((acc, curr) => acc + curr.upload_count, 0)} <span className="text-xs font-normal text-slate-500">件</span>
                    </div>
                  </div>
                </div>

                {/* Filter and Search controls */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={dashSearch}
                      onChange={(e) => setDashSearch(e.target.value)}
                      placeholder="搜尋校名、代表姓名、電話或 Email..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex items-center space-x-2 flex-wrap gap-2">
                    <select
                      value={dashFilter}
                      onChange={(e) => setDashFilter(e.target.value as any)}
                      className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">顯示全部學校 (55 校)</option>
                      <option value="registered">僅顯示已註冊學校</option>
                      <option value="unregistered">僅顯示未註冊學校</option>
                      <option value="completed">僅顯示檔案上傳齊全學校 (4/4)</option>
                    </select>

                    {calculateUnsyncedFilesCount() > 0 && (
                      <button
                        type="button"
                        onClick={handleAdminBatchSyncAllFiles}
                        disabled={isBatchSyncing}
                        className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        title={`共有 ${calculateUnsyncedFilesCount()} 份檔案僅存於 Firestore，可一鍵批次補傳至 Google Drive`}
                      >
                        <CloudUpload className="w-4 h-4" />
                        <span>
                          {isBatchSyncing
                            ? `同步中 (${batchSyncProgress?.current}/${batchSyncProgress?.total})...`
                            : `☁️ 一鍵將 ${calculateUnsyncedFilesCount()} 檔補傳至 Drive`}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const folderId = getTargetDriveFolderId();
                        if (folderId) {
                          window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
                        } else {
                          alert('尚未設定大會 Google Drive 資料夾 ID！\n請前往頁面右上角的【設定與說明】進行設定。');
                        }
                      }}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5 cursor-pointer"
                      title="開啟收件之 Google Drive 雲端總資料夾"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>開啟 Drive 雲端總資料夾</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>匯出 Excel / CSV 總表</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenResetModal}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5 cursor-pointer"
                      title="清空所有使用者註冊與上傳檔案，系統還原歸零"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>重置系統資料 (歸零)</span>
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Status Tags Legend Banner */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                    <div className="flex items-center space-x-3 flex-wrap gap-y-1.5">
                      <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                        <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span>圖示標籤說明：</span>
                      </span>
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                        <span>☁️ Drive</span>
                        <span className="font-normal text-slate-600 ml-1">：檔案已成功自動同步至大會 Google Drive 雲端資料夾</span>
                      </span>
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                        <span>💾 僅存 DB</span>
                        <span className="font-normal text-slate-600 ml-1">：檔案已完整存於大會 Firebase 數據庫，管理者可點選「補傳雲端」按鈕同步至 Google Drive</span>
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3.5 cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('school_id')}>
                            編號 {sortColumn === 'school_id' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th className="px-4 py-3.5">學校名稱</th>
                          <th className="px-4 py-3.5 cursor-pointer hover:bg-slate-200" onClick={() => handleSortClick('registered')}>
                            註冊狀態 {sortColumn === 'registered' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th className="px-4 py-3.5">代表人員</th>
                          <th className="px-4 py-3.5">聯絡電話</th>
                          <th className="px-4 py-3.5">Google Email</th>
                          <th className="px-4 py-3.5 text-center">帳號管理</th>
                          <th className="px-4 py-3.5">繳交進度</th>
                          <th className="px-4 py-3.5 text-right">上傳檔案明細與審查</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredAdminItems.map(item => (
                          <tr key={item.school_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3.5 font-bold text-slate-700">{item.school_id}</td>
                            <td className="px-4 py-3.5 font-bold text-slate-900">{item.school_name}</td>
                            <td className="px-4 py-3.5">
                              {item.users && item.users.length > 1 ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                                  多位代表 ({item.users.length}位)
                                </span>
                              ) : item.registered ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                  已註冊
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                                  未註冊
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {item.users && item.users.length > 0 ? (
                                <div className="space-y-1.5">
                                  {item.users.map(u => (
                                    <div key={u.user_email} className="text-slate-800 font-medium text-xs flex items-center space-x-1">
                                      <span>{u.user_name}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {item.users && item.users.length > 0 ? (
                                <div className="space-y-1.5">
                                  {item.users.map(u => (
                                    <div key={u.user_email} className="text-slate-600 text-xs font-mono">
                                      {u.user_phone}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {item.users && item.users.length > 0 ? (
                                <div className="space-y-1.5">
                                  {item.users.map(u => (
                                    <div key={u.user_email} className="text-slate-600 text-xs font-mono">
                                      {u.user_email}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              {item.users && item.users.length > 0 ? (
                                <div className="space-y-1.5">
                                  {item.users.map(u => (
                                    <div key={u.user_email} className="flex items-center justify-center space-x-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleAdminEditUserClick(u)}
                                        className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[11px] rounded transition-colors flex items-center space-x-1 shadow-sm cursor-pointer"
                                        title={`編輯 ${u.user_name} 的代表資料`}
                                      >
                                        <Edit3 className="w-3 h-3 text-amber-600" />
                                        <span>編輯</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAdminDeleteUserClick(u)}
                                        className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[11px] rounded transition-colors flex items-center space-x-1 shadow-sm cursor-pointer"
                                        title={`解除 ${u.user_name} (${u.user_email}) 的代表綁定`}
                                      >
                                        <UserX className="w-3 h-3 text-rose-600" />
                                        <span>刪除</span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">未綁定</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-black ${
                                  item.upload_count === 4
                                    ? 'bg-blue-100 text-blue-800'
                                    : item.upload_count > 0
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {item.upload_count} / 4 份
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              {item.files.length === 0 ? (
                                <span className="text-xs text-slate-400 italic">尚無檔案</span>
                              ) : (
                                <div className="flex flex-col items-end gap-1.5">
                                  {item.files.map(f => {
                                    const isDriveSynced = !!(f.driveFileId || f.driveUrl);
                                    return (
                                      <div key={f.name} className="flex items-center space-x-2 text-xs">
                                        <span className="font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                                          {f.name}
                                        </span>
                                        <span
                                          className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[11px] font-bold cursor-help"
                                          title="💾 檔案已完整備份存於大會 Firestore 數據庫"
                                        >
                                          💾
                                        </span>
                                        {isDriveSynced && (
                                          <span
                                            className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[11px] font-bold cursor-help"
                                            title="☁️ 檔案已同步至 Google Drive 雲端資料夾"
                                          >
                                            ☁️
                                          </span>
                                        )}
                                        {f.isDead && (
                                          <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 font-bold rounded text-[11px] border border-rose-200">
                                            ❌ 已退件
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => downloadUploadedFile(f)}
                                          className="text-emerald-600 hover:text-emerald-800 font-bold underline flex items-center space-x-0.5 cursor-pointer"
                                          title="從大會 Firestore 數據庫直接下載完整原檔至電腦"
                                        >
                                          <Download className="w-3 h-3 inline" />
                                          <span>下載</span>
                                        </button>
                                        {!f.isDead && !isDriveSynced && (
                                          <button
                                            type="button"
                                            onClick={() => handleAdminSyncSingleFile(item.school_id, item.school_name, f)}
                                            disabled={syncingFileKey === `${item.school_id}_${f.slotKey}`}
                                            className="text-blue-700 hover:text-blue-900 font-bold bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 cursor-pointer flex items-center space-x-0.5 disabled:opacity-50"
                                            title="將此份存於 Firestore 的檔案手動補傳同步至大會 Google Drive"
                                          >
                                            <CloudUpload className="w-3 h-3 inline text-blue-600" />
                                            <span>{syncingFileKey === `${item.school_id}_${f.slotKey}` ? '補傳中...' : '補傳雲端'}</span>
                                          </button>
                                        )}
                                        {!f.isDead && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              if (window.confirm(`【管理員權限】確定要退件/註銷「${f.name}」嗎？\n退件後，該校代表的畫面上會立即顯示紅底退件警告提示，並能重新選取檔案上傳。`)) {
                                                const res = await markSchoolFileDead(item.school_id, f.slotKey, {
                                                  email: userEmail,
                                                  name: '大會管理員',
                                                  schoolName: item.school_name,
                                                  userId: 'ADMIN',
                                                });
                                                if (res.success) {
                                                  setStatusMessage({
                                                    type: 'success',
                                                    text: `已成功將「${f.name}」執行退件！該校代表畫面已同步顯示退件警示。`,
                                                  });
                                                } else {
                                                  setStatusMessage({
                                                    type: 'error',
                                                    text: res.message || '退件操作失敗，請稍後重試！',
                                                  });
                                                }
                                                forceRefresh();
                                              }
                                            }}
                                            className="text-amber-700 hover:text-amber-900 font-bold hover:underline bg-amber-50 px-2 py-0.5 rounded border border-amber-200 cursor-pointer"
                                            title="將檔案標示為退件 (保留紀錄，允許學校重新上傳)"
                                          >
                                            退件
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAdminDeletingFile({
                                              school_id: item.school_id,
                                              school_name: item.school_name,
                                              file: f,
                                            });
                                          }}
                                          className="text-rose-600 hover:text-rose-800 font-bold hover:underline bg-rose-50 px-2 py-0.5 rounded border border-rose-200 cursor-pointer flex items-center space-x-0.5"
                                          title="徹底刪除該檔案紀錄與內容"
                                        >
                                          <Trash2 className="w-3 h-3 inline" />
                                          <span>刪除</span>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB 2: ADMIN MANAGEMENT */}
            {adminSubTab === 'admins' && <AdminManager currentAdminEmail={userEmail} />}

            {/* SUB-TAB 3: AUDIT LOGS */}
            {adminSubTab === 'logs' && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-4">
                  <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-amber-600" />
                    <span>全系統 Audit Logs 操作履歷日誌</span>
                  </h3>

                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={logKeyword}
                      onChange={(e) => setLogKeyword(e.target.value)}
                      placeholder="搜尋日誌關鍵字..."
                      className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    />
                    <select
                      value={logActionFilter}
                      onChange={(e) => setLogActionFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold"
                    >
                      <option value="">全部動作類型</option>
                      <option value="UPLOAD">UPLOAD (檔案上傳成功)</option>
                      <option value="UPLOAD_FAILED">UPLOAD_FAILED (檔案上傳失敗)</option>
                      <option value="DELETE">DELETE (檔案刪除)</option>
                      <option value="REGISTER">REGISTER (帳號註冊)</option>
                      <option value="USER_UPDATE">USER_UPDATE (代表修改個人資料)</option>
                      <option value="ADMIN_UPDATE_USER">ADMIN_UPDATE_USER (管理員編輯代表帳號)</option>
                      <option value="ADMIN_DELETE_USER">ADMIN_DELETE_USER (管理員刪除代表帳號)</option>
                      <option value="ADMIN_ADD">ADMIN_ADD (新增管理員)</option>
                      <option value="ADMIN_REMOVE">ADMIN_REMOVE (移除管理員)</option>
                      <option value="ADMIN_RESET">ADMIN_RESET (系統歸零重置)</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">時間</th>
                        <th className="px-4 py-2.5">帳號 Email</th>
                        <th className="px-4 py-2.5">代表單位/學校</th>
                        <th className="px-4 py-2.5">動作</th>
                        <th className="px-4 py-2.5">詳細說明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{log.time}</td>
                          <td className="px-4 py-2 text-slate-800 font-bold">{log.email}</td>
                          <td className="px-4 py-2 text-slate-700">{log.schoolName}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.actionType === 'UPLOAD'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : log.actionType === 'UPLOAD_FAILED'
                                  ? 'bg-red-100 text-red-800 font-black border border-red-300'
                                  : log.actionType === 'DELETE'
                                  ? 'bg-rose-100 text-rose-800'
                                  : log.actionType === 'REGISTER'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {log.actionType}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-700">{log.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 4: GOOGLE DRIVE BACKUP SETTINGS */}
            {adminSubTab === 'drive' && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
                <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                  <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
                    <HardDrive className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Google Drive 雲端資料夾自動同步設定</h3>
                    <p className="text-xs text-slate-500">
                      設定大會專用的 Google Drive 目標資料夾。當學校代表上傳報名表件時，系統會自動在指定資料夾（同一層）產生備份正本。
                    </p>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="p-4 rounded-xl border flex items-center justify-between flex-wrap gap-4 bg-slate-50 border-slate-200">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${gasWebAppUrl || driveAuthToken ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                    <div>
                      <div className="text-xs font-bold text-slate-700">
                        Google Drive 授權連線狀態：
                        <span className={gasWebAppUrl || driveAuthToken ? 'text-emerald-600 font-bold ml-1' : 'text-rose-600 font-bold ml-1'}>
                          {gasWebAppUrl
                            ? '🟢 已設定 GAS 雲端自動橋接 (永久免認證運作中)'
                            : driveAuthToken
                            ? '🟢 已成功授權連線 (OAuth Token 有效中)'
                            : '🔴 尚未授權連線'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {gasWebAppUrl
                          ? '已啟用 Google Apps Script 永久免登入連線，各校代表上傳檔案將自動備份至 Drive。'
                          : driveAuthToken
                          ? '上傳功能已具備 Drive 自動備份能力 (以 OAuth 臨時權限連線)。'
                          : '請於下方設定 GAS 網址，或點擊右側按鈕進行 Google OAuth 授權連線。'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={isConnectingDrive}
                      onClick={async () => {
                        setIsConnectingDrive(true);
                        try {
                          const token = await requestDriveAuth();
                          setDriveAuthTokenState(token);
                          setStatusMessage({
                            type: 'success',
                            text: '🎉 已成功授權連線 Google Drive！',
                          });
                        } catch (err: any) {
                          setStatusMessage({
                            type: 'error',
                            text: `❌ Google Drive 授權失敗：${err.message || err}`,
                          });
                        } finally {
                          setIsConnectingDrive(false);
                        }
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <HardDrive className="w-4 h-4" />
                      <span>{isConnectingDrive ? '授權連線中...' : driveAuthToken ? '重新授權 Google Drive' : '授權連線 Google Drive'}</span>
                    </button>

                    {driveAuthToken && (
                      <button
                        type="button"
                        onClick={() => {
                          clearDriveAccessToken();
                          setDriveAuthTokenState(null);
                          setStatusMessage({
                            type: 'success',
                            text: '已解除 Google Drive 連線授權。',
                          });
                        }}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                      >
                        解除授權
                      </button>
                    )}
                  </div>
                </div>

                {/* Folder ID Setting Form */}
                <div className="space-y-6 pt-2">
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">1</span>
                      <span>設定指定 Google Drive 資料夾 ID</span>
                    </h4>

                    <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-slate-700">
                        目標資料夾 ID (Folder ID) <span className="text-slate-400 font-normal">(非完整網址)</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={driveFolderId}
                          onChange={(e) => setDriveFolderIdState(e.target.value)}
                          placeholder="請貼入資料夾 ID，例如：1A2b3C4d5E6f7G8h9I0j"
                          className="flex-1 min-w-[240px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setTargetDriveFolderId(driveFolderId);
                            setStatusMessage({
                              type: 'success',
                              text: driveFolderId
                                ? `已成功設定目標 Google Drive 資料夾 ID：[${driveFolderId.trim()}]`
                                : '已清除 Google Drive 資料夾 ID 設定。',
                            });
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1 cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          <span>儲存資料夾 ID</span>
                        </button>

                        <a
                          href={driveFolderId.trim() ? `https://drive.google.com/drive/folders/${driveFolderId.trim()}` : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            if (!driveFolderId.trim()) {
                              e.preventDefault();
                              alert('請先輸入有效的 Google Drive 資料夾 ID！');
                            }
                          }}
                          className={`px-4 py-2 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5 ${
                            driveFolderId.trim()
                              ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          }`}
                          title="開啟指定 Google Drive 雲端資料夾"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>開啟指定 Google Drive 資料夾</span>
                        </a>
                      </div>

                      <div className="p-3 bg-white/80 rounded-lg text-xs text-slate-600 space-y-1.5 border border-amber-100">
                        <p className="font-bold text-amber-900">💡 如何取得 Google Drive 資料夾 ID？</p>
                        <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-slate-600">
                          <li>前往您的 Google Drive，開啟大會專用的資料夾。</li>
                          <li>查看瀏覽器上方網址列，網址格式為：<code className="bg-slate-100 px-1 py-0.5 rounded text-amber-800 font-mono">https://drive.google.com/drive/folders/【資料夾ID】</code></li>
                          <li>複製 <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-800 font-mono">folders/</code> 後方那一長串英數字字串，貼到上方輸入框點擊「儲存資料夾 ID」即可！</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">2</span>
                      <span>Google Apps Script 雲端自動橋接網址 (推薦免費/永久免重新認證)</span>
                    </h4>

                    <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-slate-700">
                        GAS Web App URL <span className="text-emerald-700 font-normal">(設定後將自動優先使用，100% 免費且管理員無需保持登入)</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={gasWebAppUrl}
                          onChange={(e) => setGasWebAppUrlState(e.target.value)}
                          placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                          className="flex-1 px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setGasWebAppUrl(gasWebAppUrl);
                            setStatusMessage({
                              type: 'success',
                              text: gasWebAppUrl
                                ? `已成功儲存 Google Apps Script Web App URL：[${gasWebAppUrl.trim()}]`
                                : '已清除 GAS Web App URL，將恢復切換至 OAuth 授權模式。',
                            });
                          }}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1 cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          <span>儲存 GAS 網址</span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-200/80">
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          💡 <strong>優勢：</strong>只須貼入 GAS 網址，系統在上傳檔案時便可自動透過 Google 官方免費腳本存入上方指定的 Google Drive 資料夾，徹底解決管理員 Token 一小時過期問題！
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowGasCode(!showGasCode)}
                          className="text-xs text-emerald-800 font-bold hover:underline flex items-center space-x-1 whitespace-nowrap ml-2 cursor-pointer"
                        >
                          <span>{showGasCode ? '收合 GAS 腳本' : '📋 檢視 GAS 腳本 (Code.gs)'}</span>
                        </button>
                      </div>

                      {showGasCode && (
                        <div className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono leading-relaxed space-y-2 border border-slate-800 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-emerald-400 font-bold">Google Apps Script 腳本 (支援同 ID / 檔名自動覆蓋)</span>
                            <button
                              type="button"
                              onClick={() => {
                                const code = `function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    result: 'success',
    status: 'online',
    message: 'Google Apps Script 雲端同步腳本運作正常！'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var contents = e && e.postData ? e.postData.contents : "";
    if (!contents) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        message: '請求內文 (postData) 為空'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = {};
    try {
      data = JSON.parse(contents);
    } catch (pErr) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        message: '解析 POST JSON 失敗: ' + pErr.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. 處理刪除檔案請求
    if (data.action === 'delete' || (data.fileId && !data.base64Data)) {
      if (data.fileId) {
        try {
          var targetFile = DriveApp.getFileById(data.fileId);
          targetFile.setTrashed(true);
          return ContentService.createTextOutput(JSON.stringify({
            result: 'success',
            message: '檔案已移至 Google Drive 垃圾桶'
          })).setMimeType(ContentService.MimeType.JSON);
        } catch (delErr) {
          return ContentService.createTextOutput(JSON.stringify({
            result: 'error',
            message: 'Google Drive 刪除失敗: ' + delErr.toString()
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // 2. 處理檔案上傳 (支援相同檔案 ID 或檔名覆蓋，避免重複檔案)
    if (data.folderId && data.base64Data) {
      var folder = DriveApp.getFolderById(data.folderId);
      var fileName = data.fileName || "uploaded_file";
      var mimeType = data.mimeType || 'application/octet-stream';
      var decodedBytes = Utilities.base64Decode(data.base64Data);
      var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
      var targetFile = null;

      // 優先方式 A：使用指定 Existing fileId 覆蓋內容 (維持相同連結)
      if (data.fileId) {
        try {
          var existing = DriveApp.getFileById(data.fileId);
          if (existing && !existing.isTrashed()) {
            targetFile = existing;
            targetFile.setContent(blob);
            targetFile.setName(fileName);
          }
        } catch (fErr) {}
      }

      // 次要方式 B：搜尋同名檔案進行內容覆蓋並清理舊檔
      if (!targetFile) {
        var files = folder.getFilesByName(fileName);
        if (files.hasNext()) {
          targetFile = files.next();
          targetFile.setContent(blob);
          targetFile.setName(fileName);
          while (files.hasNext()) { files.next().setTrashed(true); }
        }
      }

      // 方式 C：建立新檔案
      if (!targetFile) {
        targetFile = folder.createFile(blob);
      }

      // 設定公開檢視權限
      try {
        targetFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (sharingErr) {}

      var fileId = targetFile.getId();
      var fileUrl = targetFile.getUrl();

      return ContentService.createTextOutput(JSON.stringify({
        result: 'success',
        id: fileId,
        url: fileUrl,
        webViewLink: fileUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: '無效的請求參數 (缺乏 folderId 或 base64Data)'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
                                navigator.clipboard.writeText(code);
                                alert('已複製 GAS Code.gs 腳本至剪貼簿！');
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-sans font-bold cursor-pointer"
                            >
                              複製完整腳本
                            </button>
                          </div>
                          <pre className="overflow-x-auto p-1 text-slate-300 text-[10px]">
{`function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    result: 'success',
    status: 'online',
    message: 'Google Apps Script 雲端同步腳本運作正常！'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var contents = e && e.postData ? e.postData.contents : "";
    if (!contents) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        message: '請求內文 (postData) 為空'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = {};
    try {
      data = JSON.parse(contents);
    } catch (pErr) {
      return ContentService.createTextOutput(JSON.stringify({
        result: 'error',
        message: '解析 POST JSON 失敗: ' + pErr.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. 處理刪除檔案請求
    if (data.action === 'delete' || (data.fileId && !data.base64Data)) {
      if (data.fileId) {
        try {
          var targetFile = DriveApp.getFileById(data.fileId);
          targetFile.setTrashed(true);
          return ContentService.createTextOutput(JSON.stringify({
            result: 'success',
            message: '檔案已移至 Google Drive 垃圾桶'
          })).setMimeType(ContentService.MimeType.JSON);
        } catch (delErr) {
          return ContentService.createTextOutput(JSON.stringify({
            result: 'error',
            message: 'Google Drive 刪除失敗: ' + delErr.toString()
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // 2. 處理檔案上傳 (支援相同檔案 ID 或檔名覆蓋，避免重複檔案)
    if (data.folderId && data.base64Data) {
      var folder = DriveApp.getFolderById(data.folderId);
      var fileName = data.fileName || "uploaded_file";
      var mimeType = data.mimeType || 'application/octet-stream';
      var decodedBytes = Utilities.base64Decode(data.base64Data);
      var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
      var targetFile = null;

      // 優先方式 A：使用指定 Existing fileId 覆蓋內容 (維持相同連結)
      if (data.fileId) {
        try {
          var existing = DriveApp.getFileById(data.fileId);
          if (existing && !existing.isTrashed()) {
            targetFile = existing;
            targetFile.setContent(blob);
            targetFile.setName(fileName);
          }
        } catch (fErr) {}
      }

      // 次要方式 B：搜尋同名檔案進行內容覆蓋並清理舊檔
      if (!targetFile) {
        var files = folder.getFilesByName(fileName);
        if (files.hasNext()) {
          targetFile = files.next();
          targetFile.setContent(blob);
          targetFile.setName(fileName);
          while (files.hasNext()) { files.next().setTrashed(true); }
        }
      }

      // 方式 C：建立新檔案
      if (!targetFile) {
        targetFile = folder.createFile(blob);
      }

      // 設定公開檢視權限
      try {
        targetFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (sharingErr) {}

      var fileId = targetFile.getId();
      var fileUrl = targetFile.getUrl();

      return ContentService.createTextOutput(JSON.stringify({
        result: 'success',
        id: fileId,
        url: fileUrl,
        webViewLink: fileUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: '無效的請求參數 (缺乏 folderId 或 base64Data)'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center">3</span>
                      <span>Google OAuth Client ID 設定 (選填/自訂)</span>
                    </h4>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <label className="block text-xs font-bold text-slate-700">
                        目前使用的 Client ID： <span className="font-mono text-amber-800 bg-amber-100/60 px-2 py-0.5 rounded ml-1">{getEffectiveDriveClientId()}</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={customClientId}
                          onChange={(e) => setCustomClientIdState(e.target.value)}
                          placeholder="可留空使用系統自動配置，或自訂 Google OAuth Client ID"
                          className="flex-1 px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCustomDriveClientId(customClientId);
                            setStatusMessage({
                              type: 'success',
                              text: customClientId
                                ? `已儲存自訂 Client ID：${customClientId.trim()}`
                                : '已恢復使用系統預設 OAuth Client ID。',
                            });
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1 cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          <span>儲存 Client ID</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        * 提示：系統已包含預設的 Client ID (<code className="font-mono">{getEffectiveDriveClientId()}</code>)。若您在自己的 Google Cloud Console 建立了「Web application」OAuth 2.0 Client ID，可以在此填入並儲存。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <Info className="w-4 h-4 text-amber-600" />
                    <span>自動同步規則說明：</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed">
                    <li>依您指示，上傳的檔案會<strong>直接存放在該資料夾同一層</strong>，不會額外依學校建立子資料夾。</li>
                    <li>檔名會自動依大會規範命名，例如：<code className="bg-slate-200/80 px-1 rounded font-mono">01_報名表.xlsx</code>, <code className="bg-slate-200/80 px-1 rounded font-mono">01_學校核章掃描檔.pdf</code>。</li>
                    <li>檔案上傳同時亦維持全功能同步至雲端 Firebase 數據庫與歷史履歷備查。</li>
                  </ul>
                </div>
              </div>
            )}

            {/* SUB-TAB 5: DYNAMIC APP CONFIGS */}
            {adminSubTab === 'configs' && <AppConfigManager />}
          </div>
        )}


        {/* 3. SCENARIO C: REGULAR SCHOOL USER VIEW */}
        {showSchoolView && (
          <div className="space-y-6">
            {/* School Profile Info Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-emerald-700">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-black text-2xl text-emerald-200">
                    {userRecord.school_id}
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                      學校代表已驗證綁定
                    </span>
                    <h2 className="text-2xl font-black mt-1 tracking-tight">{userRecord.school_name}</h2>
                    <p className="text-xs text-emerald-100/90 mt-1">
                      代表人員：<span className="font-bold underline">{userRecord.user_name}</span> ({userRecord.user_phone}) | Google Email: {userRecord.user_email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelfEditName(userRecord.user_name);
                      setSelfEditPhone(userRecord.user_phone);
                      setSelfEditNotes(userRecord.notes || '');
                      setSelfPhoneError(null);
                      setIsEditingSelf(true);
                    }}
                    className="px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-bold rounded-xl backdrop-blur-md border border-white/20 transition-all flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4 text-emerald-200" />
                    <span>編輯代表資料</span>
                  </button>

                  <div className="text-right border-l border-white/20 pl-4">
                    <div className="text-xs text-emerald-200/80">目前已繳交檔案進度</div>
                    <div className="text-3xl font-black text-emerald-200 mt-0.5">
                      {getSchoolFiles(userRecord.school_id).length} / 4 <span className="text-xs font-normal">項</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text Note Notice */}
              <div className="mt-4 pt-3 border-t border-white/10 text-xs text-emerald-100/90">
                <span>若需變更登記 Email 或刪除帳號，請聯繫臺中二中社團組。</span>
              </div>
            </div>

            {/* Downloads Section for Templates */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Download className="w-5 h-5 text-emerald-600" />
                  <span>一、 報名表與表格範本下載 (大會指定版本)</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templateItems.map((item, idx) => {
                  const itemUrl = item.url || '';
                  const itemTitle = item.title || '';
                  const downloadUrl = deriveDownloadUrl(itemUrl);
                  const isSpreadsheet = itemUrl.includes('spreadsheet') || itemTitle.toLowerCase().includes('excel');
                  const themeColor = isSpreadsheet ? 'emerald' : idx % 2 === 0 ? 'emerald' : 'blue';

                  return (
                    <div
                      key={item.id}
                      className={`p-4 ${
                        themeColor === 'emerald'
                          ? 'bg-emerald-50/60 hover:bg-emerald-50 border-emerald-200'
                          : 'bg-blue-50/60 hover:bg-blue-50 border-blue-200'
                      } border rounded-xl flex flex-col justify-between space-y-3 transition-all`}
                    >
                      <div className="flex items-start space-x-3">
                        <div
                          className={`w-10 h-10 rounded-lg ${
                            themeColor === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600'
                          } text-white flex items-center justify-center flex-shrink-0`}
                        >
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{itemTitle}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                        </div>
                      </div>

                      <div
                        className={`flex items-center space-x-2 pt-1 border-t ${
                          themeColor === 'emerald' ? 'border-emerald-200/60' : 'border-blue-200/60'
                        }`}
                      >
                        <a
                          href={downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex-1 px-3 py-2 ${
                            themeColor === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                          } text-white text-xs font-bold rounded-lg shadow-sm text-center flex items-center justify-center space-x-1 transition-all`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>下載範本檔案</span>
                        </a>
                        {itemUrl && (
                          <a
                            href={itemUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`px-3 py-2 bg-white hover:bg-slate-50 border ${
                              themeColor === 'emerald' ? 'border-emerald-300 text-emerald-800' : 'border-blue-300 text-blue-800'
                            } text-xs font-semibold rounded-lg text-center transition-all flex items-center space-x-1`}
                            title="在 Google 雲端硬碟線上檢視"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>線上預覽</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* File Upload Section */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
                  <Upload className="w-5 h-5 text-emerald-600" />
                  <span>二、 上傳四項指定報名檔案</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  請選擇下方欲上傳的檔案。單檔限制 <span className="font-bold text-slate-700">2MB</span>，系統將在儲存時自動依格式進行重新命名備份。
                </p>
              </div>

              {/* 4 File Slots */}
              <div className="space-y-4">
                {fileSlots.map((slot) => {
                  const slotFile = getSchoolSlotFile(userRecord.school_id, slot.key);
                  const isUploaded = slotFile && !slotFile.isDead;
                  const isRejected = slotFile && slotFile.isDead;
                  const isSelectedPending = selectedFiles[slot.key] !== null;

                  return (
                    <div
                      key={slot.key}
                      className={`p-5 rounded-2xl border transition-all ${
                        isUploaded
                          ? 'bg-emerald-50/40 border-emerald-300'
                          : isRejected
                          ? 'bg-rose-50/80 border-rose-300 shadow-sm'
                          : isSelectedPending
                          ? 'bg-blue-50/40 border-blue-300'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-slate-900">{slot.label}</span>
                            {isUploaded && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ✅ 已上傳存檔
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                ❌ 已退件 (請重新選擇正確檔案上傳)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{slot.description}</p>

                          {isRejected && (
                            <div className="mt-2.5 text-xs text-rose-800 bg-rose-100/90 border border-rose-200 rounded-xl p-3 space-y-1">
                              <div className="font-bold flex items-center space-x-1">
                                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                                <span>退件通知：您先前上傳的檔案「<strong>{slotFile.name}</strong>」已被大會管理員退件註銷！</span>
                              </div>
                              <p className="text-[11px] text-rose-700 font-medium">
                                註銷時間：{slotFile.time}。請點擊右側「重新選擇電腦檔案」選取修正後的檔案，並點選下方「確認上傳」按鈕重新提交。
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Right Action side */}
                        <div className="flex items-center space-x-3 flex-shrink-0">
                          {isUploaded ? (
                            <div className="flex items-center space-x-2">
                              <div className="text-right mr-1">
                                <div className="text-xs font-bold text-slate-800 font-mono">{slotFile.name}</div>
                                <div className="text-[11px] text-slate-400">{slotFile.time}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => downloadUploadedFile(slotFile)}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
                                title="從系統資料庫備份直接下載檔案至電腦"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>下載</span>
                              </button>
                              {slotFile.driveUrl && (
                                <a
                                  href={slotFile.driveUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1"
                                  title="在 Google Drive 雲端資料夾線上開啟檢視"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>☁️ 雲端連結</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(slot.key, slotFile.name)}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all flex items-center space-x-1"
                                title="刪除此檔案並開放重新選擇上傳"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>刪除檔案</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <label className="cursor-pointer px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center space-x-1.5">
                                <Upload className="w-4 h-4 text-emerald-600" />
                                <span>{selectedFiles[slot.key] ? '更換選擇' : isRejected ? '重新選擇檔案' : '選擇電腦檔案'}</span>
                                <input
                                  type="file"
                                  accept={slot.accept}
                                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                  onChange={(e) => handleFileChange(slot.key, e.target.files && e.target.files.length > 0 ? e.target.files[0] : null)}
                                  className="hidden"
                                />
                              </label>

                              {selectedFiles[slot.key] && (
                                <div className="flex items-center space-x-1 bg-blue-100 border border-blue-200 text-blue-800 px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
                                  <span>{selectedFiles[slot.key]!.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleFileChange(slot.key, null)}
                                    className="ml-1 text-blue-600 hover:text-blue-900 font-black p-0.5"
                                    title="清除取消選擇"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Confirm Upload Button */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-500 font-medium">
                  {Object.values(selectedFiles).filter(f => f !== null).length > 0 ? (
                    <span className="text-blue-700 font-bold bg-blue-50 px-3 py-1 rounded-lg border border-blue-200 inline-flex items-center space-x-1">
                      <span>已選取 {Object.values(selectedFiles).filter(f => f !== null).length} 個項目準備上傳</span>
                    </span>
                  ) : (
                    <span>您可以選擇 1 ~ 4 個檔名對應之檔案進行一次性或分次上傳。</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={isUploading || Object.values(selectedFiles).filter(f => f !== null).length === 0}
                  className={`w-full sm:w-auto px-8 py-3.5 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 ${
                    isUploading || Object.values(selectedFiles).filter(f => f !== null).length === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 hover:shadow-emerald-600/30'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>檔案處理與編碼上傳中...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span>
                        {Object.values(selectedFiles).filter(f => f !== null).length > 0
                          ? `確認上傳已選取的 ${Object.values(selectedFiles).filter(f => f !== null).length} 份檔案`
                          : '請點選上方「選擇電腦檔案」'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: SCHOOL USER EDIT SELF PROFILE */}
      {isEditingSelf && userRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 relative">
              <button
                type="button"
                onClick={() => setIsEditingSelf(false)}
                className="absolute top-4 right-4 text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
                  <Edit3 className="w-6 h-6 text-emerald-200" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">編輯代表人員資料</h3>
                  <p className="text-xs text-emerald-100">{userRecord.school_name} (學校代碼: {userRecord.school_id})</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveSelfProfile} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  帶隊教師 / 學校代表姓名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={selfEditName}
                  onChange={(e) => setSelfEditName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="請輸入代表人員姓名"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  聯絡電話 / 手機號碼 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={selfEditPhone}
                  onChange={(e) => {
                    setSelfEditPhone(e.target.value.replace(/[^0-9\-#\s\+\(\)]/g, ''));
                    setSelfPhoneError(null);
                  }}
                  maxLength={30}
                  className={`w-full px-3.5 py-2 text-sm border rounded-xl outline-none transition-all duration-200 ${
                    selfPhoneError
                      ? 'border-rose-500 bg-rose-50/70 text-rose-950 ring-2 ring-rose-200 font-bold placeholder:text-rose-300'
                      : 'border-slate-300 focus:ring-2 focus:ring-emerald-500'
                  }`}
                  placeholder="例如：0912-345678"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  ⚠️ <span className="font-semibold text-slate-600">格式說明：</span>電話只可輸入半形數字、<code>-</code>、<code>+</code>、<code>#</code> (分機) 及括號。手機如 <code>09xxxxxxxx</code>，市話請帶區碼 (如 <code>04-xxxxxxx</code>)。
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>綁定 Google 電子郵件 (Email)</span>
                  <span className="text-[11px] text-slate-400 font-normal flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-slate-400 inline" />
                    <span>與 Google 登入綁定 (無法自行編輯)</span>
                  </span>
                </label>
                <input
                  type="email"
                  readOnly
                  value={userRecord.user_email}
                  className="w-full px-3.5 py-2 text-sm bg-slate-100 border border-slate-200 text-slate-500 rounded-xl cursor-not-allowed font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">學校註冊備註事項 (選填)</label>
                <textarea
                  rows={2}
                  value={selfEditNotes}
                  onChange={(e) => setSelfEditNotes(e.target.value)}
                  placeholder="如有特殊說明事項可填寫於此..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800">
                <span>若需變更登記 Email 或刪除帳號，請聯繫臺中二中社團組。</span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col space-y-3">
                {selfPhoneError && (
                  <div className="relative animate-bounce">
                    <div className="bg-rose-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 border border-rose-600">
                      <AlertTriangle className="w-4 h-4 animate-pulse flex-shrink-0" />
                      <span>{selfPhoneError}</span>
                    </div>
                    {/* Tooltip arrow pointing down */}
                    <div className="absolute left-6 bottom-[-6px] w-3 h-3 bg-rose-500 rotate-45 border-r border-b border-rose-600"></div>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingSelf(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center space-x-1"
                  >
                    <Save className="w-4 h-4" />
                    <span>儲存代表資料修改</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN EDIT SCHOOL REPRESENTATIVE USER */}
      {adminEditingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-6 relative">
              <button
                type="button"
                onClick={() => setAdminEditingUser(null)}
                className="absolute top-4 right-4 text-amber-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
                  <Edit3 className="w-6 h-6 text-amber-100" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">大會管理員：編輯學校代表帳號</h3>
                  <p className="text-xs text-amber-100 font-mono">{adminEditingUser.user_email}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleAdminSaveUserSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  指派 / 綁定學校 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={adminEditSchoolId}
                  onChange={(e) => setAdminEditSchoolId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  {SCHOOLS.map((s) => (
                    <option key={s.school_id} value={s.school_id}>
                      [{s.school_id}] {s.school_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  帶隊教師 / 代表姓名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adminEditName}
                  onChange={(e) => setAdminEditName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  聯絡電話 / 手機 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adminEditPhone}
                  onChange={(e) => setAdminEditPhone(e.target.value.replace(/[^0-9\-#\s\+\(\)]/g, ''))}
                  maxLength={30}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  ⚠️ <span className="font-semibold text-slate-600">格式說明：</span>電話只可輸入半形數字、<code>-</code>、<code>+</code>、<code>#</code> (分機) 及括號。手機如 <code>09xxxxxxxx</code>，市話請帶區碼 (如 <code>04-xxxxxxx</code>)。
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">備註說明 (選填)</label>
                <textarea
                  rows={2}
                  value={adminEditNotes}
                  onChange={(e) => setAdminEditNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAdminEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center space-x-1"
                >
                  <Save className="w-4 h-4" />
                  <span>儲存修改並記錄履歷</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN CONFIRM DELETE REPRESENTATIVE USER */}
      {deletingUserItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <UserX className="w-7 h-7 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">確定刪除學校代表帳號？</h3>
                <p className="text-xs text-slate-500">{deletingUserItem.school_name} (代碼: {deletingUserItem.school_id})</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2 text-xs text-slate-700">
              <p>您即將刪除以下代表人員綁定資料：</p>
              <ul className="list-disc list-inside space-y-1 font-medium text-rose-900">
                <li>代表人員：<strong>{deletingUserItem.user_name}</strong></li>
                <li>聯絡電話：<span className="font-mono">{deletingUserItem.user_phone}</span></li>
                <li>Google Email：<span className="font-mono">{deletingUserItem.user_email}</span></li>
              </ul>
              <p className="text-[11px] text-rose-700 font-normal pt-1 border-t border-rose-200/60">
                ⚠️ 注意：刪除後將會解除該校帳號綁定，該代表人員需要重新進行註冊。所有操作皆會寫入 Audit Logs。
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingUserItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center space-x-1"
              >
                <Trash2 className="w-4 h-4" />
                <span>確認刪除帳號</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN CONFIRM DELETE SCHOOL FILE */}
      {adminDeletingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 className="w-7 h-7 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">確定徹底刪除該檔案？</h3>
                <p className="text-xs text-slate-500">{adminDeletingFile.school_name} (代碼: {adminDeletingFile.school_id})</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2 text-xs text-slate-700">
              <p>您即將徹底刪除以下學校上傳的檔案紀錄：</p>
              <ul className="list-disc list-inside space-y-1 font-medium text-rose-900">
                <li>檔名：<strong className="font-mono">{adminDeletingFile.file.name}</strong></li>
                <li>上傳時間：<span>{adminDeletingFile.file.time}</span></li>
                <li>目前狀態：
                  <span className={adminDeletingFile.file.isDead ? 'text-rose-700 font-bold ml-1' : 'text-emerald-700 font-bold ml-1'}>
                    {adminDeletingFile.file.isDead ? '已退件' : '正常上傳'}
                  </span>
                </li>
              </ul>
              <p className="text-[11px] text-rose-700 font-normal pt-1 border-t border-rose-200/60">
                ⚠️ 警告：徹底刪除後，該檔案將從系統與資料庫完全移除且無法復原。若您僅需要求學校重新上傳，建議使用「退件」功能即可。
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAdminDeletingFile(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmAdminDeleteFile}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>確認徹底刪除檔案</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SYSTEM RESET CONFIRMATION */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 border border-rose-100 animate-in zoom-in-95 duration-200 relative">
            <div className="flex items-center space-x-3.5 text-rose-600">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">最高權限警告：系統歸零重置</h3>
                <p className="text-xs text-rose-600 font-bold">請確認是否執行全系統數據清除作業</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2.5 leading-relaxed">
              <p className="font-bold text-slate-800">
                執行重置後，系統將自動進行以下作業：
              </p>
              <ul className="space-y-1 text-slate-600 pl-1">
                <li className="flex items-start space-x-1.5">
                  <span className="text-rose-500 font-black">✕</span>
                  <span><strong>清空所有學校代表帳號</strong>：所有已註冊之學校代表帳號解除綁定，恢復為未註冊。</span>
                </li>
                <li className="flex items-start space-x-1.5">
                  <span className="text-rose-500 font-black">✕</span>
                  <span><strong>清空所有上傳檔案記錄</strong>：資料庫中所有學校的表件繳交進度重設為 0/4。</span>
                </li>
                <li className="flex items-start space-x-1.5">
                  <span className="text-emerald-600 font-black">✓</span>
                  <span className="text-emerald-800 font-bold">絕對保留歷史 Audit Log：操作日誌永久留存，並會記錄本次重置人與時間。</span>
                </li>
                <li className="flex items-start space-x-1.5">
                  <span className="text-emerald-600 font-black">✓</span>
                  <span><strong>保留管理員與系統設定</strong>：大會管理員名單、Google Drive 設定與範本下載設定均不受影響。</span>
                </li>
              </ul>
            </div>

            <p className="text-xs text-slate-500">
              * 備註：若 Google Drive 雲端資料夾內已有測試檔案，重置後請手動至 Google Drive 清理舊檔。
            </p>

            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetConfirmModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleExecuteReset}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {isResetting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isResetting ? '正在重置中...' : '確認執行歸零重置'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN LOCKING OVERLAY FOR UPLOADS & IMPORTANT OPERATIONS */}
      {(isUploading || isBatchSyncing || syncingFileKey !== null || isConnectingDrive) && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md p-6 text-white text-center select-none animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-slate-900/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl flex flex-col items-center space-y-6 relative overflow-hidden">
            {/* Background glowing aura */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Animated Loading Icon */}
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
                <RefreshCw className="w-10 h-10 text-white animate-spin" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 p-1.5 rounded-full shadow">
                <Lock className="w-4 h-4" />
              </div>
            </div>

            {/* Status Title */}
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white tracking-wide">
                {isUploading
                  ? '⚡ 正在進行檔案傳輸與安全存檔中'
                  : isBatchSyncing
                  ? '☁️ 正在批次補傳檔案至 Google Drive'
                  : syncingFileKey !== null
                  ? '☁️ 正在補傳同步檔案至 Google Drive'
                  : '🔌 正在進行 Google Drive 連線驗證'}
              </h3>
              
              {/* Batch progress if applicable */}
              {isBatchSyncing && batchSyncProgress && (
                <div className="pt-1">
                  <div className="inline-block px-3 py-1 bg-blue-500/20 border border-blue-400/40 rounded-full text-blue-300 font-mono text-sm font-bold">
                    進度：{batchSyncProgress.current} / {batchSyncProgress.total} 份檔案
                  </div>
                </div>
              )}
            </div>

            {/* Warning Message Box */}
            <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200/90 space-y-2 text-left leading-relaxed">
              <div className="flex items-center space-x-2 font-bold text-amber-400 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>系統安全與數據傳輸提醒</span>
              </div>
              <p>
                為了確保資料完整傳送至大會 Firestore 資料庫與 Google 雲端硬碟，<strong>請勿關閉視窗、重新整理網頁或切換離開頁面</strong>。
              </p>
              <p className="text-[11px] text-amber-300/80 pt-1 border-t border-amber-500/20">
                🔒 傳輸完成後，系統將自動關閉此提示畫面並顯示作業結果報告。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
