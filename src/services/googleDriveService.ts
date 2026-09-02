// Google Drive API Integration Service

import firebaseConfig from '../../firebase-applet-config.json';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const config = firebaseConfig as any;
const SYSTEM_CLIENT_ID = config.oAuthClientId || '695622919666-34jbvkdkekldlasd8gncoqugume098i7.apps.googleusercontent.com';

const DRIVE_TOKEN_KEY = 'scout_app_drive_access_token';
const DRIVE_FOLDER_KEY = 'scout_app_drive_folder_id';
const DRIVE_CLIENT_ID_KEY = 'scout_app_drive_client_id';
const DRIVE_GAS_URL_KEY = 'scout_app_drive_gas_url';

declare global {
  interface Window {
    google?: any;
  }
}

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
  url?: string;
}

export function getGasWebAppUrl(): string {
  return localStorage.getItem(DRIVE_GAS_URL_KEY) || '';
}

export async function ensureDriveSettingsLoaded(): Promise<{ gasWebAppUrl: string; folderId: string }> {
  let gasUrl = getGasWebAppUrl();
  let folderId = getTargetDriveFolderId();

  if ((!gasUrl || !folderId) && db) {
    try {
      const docSnap = await getDoc(doc(db, 'systemSettings', 'googleDrive'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.folderId) {
          folderId = data.folderId;
          localStorage.setItem(DRIVE_FOLDER_KEY, folderId);
        }
        if (data.gasWebAppUrl) {
          gasUrl = data.gasWebAppUrl;
          localStorage.setItem(DRIVE_GAS_URL_KEY, gasUrl);
        }
        if (data.customClientId) {
          localStorage.setItem(DRIVE_CLIENT_ID_KEY, data.customClientId);
        }
      }
    } catch (e) {
      console.warn('ensureDriveSettingsLoaded Firestore fallback warning:', e);
    }
  }

  return { gasWebAppUrl: gasUrl, folderId };
}

export function setGasWebAppUrl(url: string): void {
  const trimmed = url.trim();
  localStorage.setItem(DRIVE_GAS_URL_KEY, trimmed);
  if (db) {
    setDoc(doc(db, 'systemSettings', 'googleDrive'), { gasWebAppUrl: trimmed }, { merge: true }).catch(console.error);
  }
}

export function getDriveAccessToken(): string | null {
  return sessionStorage.getItem(DRIVE_TOKEN_KEY);
}

export function setDriveAccessToken(token: string): void {
  sessionStorage.setItem(DRIVE_TOKEN_KEY, token);
  if (db) {
    setDoc(doc(db, 'systemSettings', 'googleDrive'), { driveAccessToken: token }, { merge: true }).catch(console.error);
  }
}

export function clearDriveAccessToken(): void {
  sessionStorage.removeItem(DRIVE_TOKEN_KEY);
  if (db) {
    setDoc(doc(db, 'systemSettings', 'googleDrive'), { driveAccessToken: '' }, { merge: true }).catch(console.error);
  }
}

export function getTargetDriveFolderId(): string {
  return localStorage.getItem(DRIVE_FOLDER_KEY) || '';
}

export function setTargetDriveFolderId(folderId: string): void {
  const trimmed = folderId.trim();
  localStorage.setItem(DRIVE_FOLDER_KEY, trimmed);
  if (db) {
    setDoc(doc(db, 'systemSettings', 'googleDrive'), { folderId: trimmed }, { merge: true }).catch(console.error);
  }
}

export function getCustomDriveClientId(): string {
  return localStorage.getItem(DRIVE_CLIENT_ID_KEY) || '';
}

export function setCustomDriveClientId(clientId: string): void {
  const trimmed = clientId.trim();
  localStorage.setItem(DRIVE_CLIENT_ID_KEY, trimmed);
  if (db) {
    setDoc(doc(db, 'systemSettings', 'googleDrive'), { customClientId: trimmed }, { merge: true }).catch(console.error);
  }
}

export function getEffectiveDriveClientId(): string {
  const custom = getCustomDriveClientId();
  if (custom) return custom;
  return SYSTEM_CLIENT_ID;
}

/**
 * Prompt user to authorize Google Drive access token using Google Identity Services (GIS)
 */
export function requestDriveAuth(overrideClientId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK (gsi) 尚未載入完成，請稍後再試。'));
      return;
    }

    const effectiveClientId = overrideClientId || getEffectiveDriveClientId();

    if (!effectiveClientId) {
      reject(new Error('未找到有效的 Google OAuth Client ID，請在設定頁面輸入 Client ID。'));
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(`Google Drive 授權失敗 (${response.error})：請確認 Client ID 或帳號權限。`));
            return;
          }
          if (response.access_token) {
            setDriveAccessToken(response.access_token);
            resolve(response.access_token);
          } else {
            reject(new Error('未取得存取權限 Token'));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(err);
    }
  });
}

export function parseErrorDetails(err: any): string {
  if (!err) return '未知錯誤';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.toString();
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.target && err.target instanceof FileReader) {
    const error = err.target.error;
    return `瀏覽器讀取檔案失敗：${error ? error.message : '檔案可能已被移走或存取權限不足'}`;
  }
  if (typeof err === 'object' && err.type) {
    return `瀏覽器網路事件異常 (${err.type})`;
  }
  try {
    const str = JSON.stringify(err);
    if (str && str !== '{}') return str;
  } catch (_) {}
  return String(err);
}

export function dataURLtoFile(dataurl: string, filename: string): File {
  try {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (e: any) {
    throw new Error(`Data URL 轉為檔案失敗: ${e?.message || e}`);
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('未選擇有效的檔案'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result as string;
        if (!result) {
          reject(new Error('檔案讀取內容為空'));
          return;
        }
        const commaIndex = result.indexOf(',');
        if (commaIndex === -1) {
          reject(new Error('檔案格式解析失敗 (未包含 Base64 標頭)'));
          return;
        }
        resolve(result.substring(commaIndex + 1));
      } catch (e: any) {
        reject(new Error(`檔案解碼 Base64 失敗：${e?.message || e}`));
      }
    };
    reader.onerror = () => {
      const error = reader.error;
      reject(new Error(`瀏覽器讀取檔案失敗：${error ? error.message : '檔案可能已被移走或存取權限不足'}`));
    };
    reader.onabort = () => {
      reject(new Error('瀏覽器讀取檔案被中斷，請重試'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Directly upload a file object to Google Drive (placed flat in target folder, no subfolders).
 * If existingFileId is provided, overwrites the existing file content in place (retaining the same file ID).
 */
export async function uploadFileToDrive(
  file: File,
  folderId?: string,
  customFileName?: string,
  existingFileId?: string
): Promise<DriveUploadResult> {
  const settings = await ensureDriveSettingsLoaded();
  const targetFolder = folderId || settings.folderId || getTargetDriveFolderId();
  if (!targetFolder) {
    throw new Error('大會管理員尚未設定指定 Google Drive 資料夾 ID');
  }

  const gasUrl = settings.gasWebAppUrl || getGasWebAppUrl();

  // Mode 1: If GAS Web App URL is configured, use Google Apps Script API (no OAuth Token expiration!)
  if (gasUrl) {
    const trimmedGasUrl = gasUrl.trim();
    if (trimmedGasUrl.includes('/edit') || (!trimmedGasUrl.endsWith('/exec') && !trimmedGasUrl.includes('/exec?'))) {
      throw new Error(`Google Apps Script 網址格式不正確（目前為：${trimmedGasUrl}）。請確認您複製的是「網路應用程式 (Web App) URL」，網址末端必須是 /exec，而非編輯器網址 (/edit)。`);
    }

    // GAS Web App has a strict POST payload size limit (~3MB). If file is larger and no OAuth token is present, warn the user.
    if (file.size > 2.5 * 1024 * 1024 && !getDriveAccessToken()) {
      throw new Error(
        `檔案大小超過 2.5MB (${(file.size / (1024 * 1024)).toFixed(1)}MB)。\n\n` +
        `【原因】：Google Apps Script (GAS) 網路應用程式有嚴格的 POST 傳輸大小限制（約 2MB-3MB），超過大小會導致資料被截斷成 4 位元組損毀檔案。\n\n` +
        `【解決方案】：請點擊系統設定中的「授權連線 Google Drive」按鈕進行一鍵 Google 登入授權（使用 OAuth Direct Upload 模式），即可支援無容量限制的大型 PDF / 影像檔案上傳！`
      );
    }

    try {
      const base64Data = await fileToBase64(file);
      const payload = {
        folderId: targetFolder,
        fileName: customFileName || file.name,
        fileId: existingFileId || undefined,
        base64Data,
        mimeType: file.type || 'application/octet-stream',
      };

      const payloadStr = JSON.stringify(payload);

      let res: Response;
      try {
        res = await fetch(trimmedGasUrl, {
          method: 'POST',
          credentials: 'omit', // 忽略瀏覽器的 Google 帳號 Cookie，避免學校組織帳號與 GAS 產生 CORS 重定向衝突
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: payloadStr,
        });
      } catch (firstFetchErr) {
        console.warn('First GAS fetch attempt failed, retrying in 1.2s...', firstFetchErr);
        await new Promise(r => setTimeout(r, 1200));
        res = await fetch(trimmedGasUrl, {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: payloadStr,
        });
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Google Apps Script 權限不足 (HTTP 401/403)。請確認 GAS 專案之「誰有權限存取 (Who has access)」已設為「所有人 (Anyone)」。');
        }
        if (res.status === 413) {
          throw new Error(`檔案容量過大 (${(file.size / (1024 * 1024)).toFixed(1)}MB)，超出 Google Apps Script POST 容量限制，請將檔案壓縮至 10MB 以下再上傳。`);
        }
      }

      const resText = await res.text();
      if (!resText || resText.trim() === '') {
        throw new Error('Google Apps Script 回傳空白回應，請確認 GAS doPost 腳本正確性。');
      }

      if (resText.includes('<!DOCTYPE') || resText.includes('<html') || resText.trim().startsWith('<')) {
        throw new Error(
          'Google Apps Script 回傳了 Google 登入/HTML 頁面 (非 JSON)。\n\n' +
          '【請排查以下原因】：\n' +
          '1.【部署未更新版本】：在 GAS 點擊「部署」>「管理部署作業」>「編輯」，【版本 (Version)】必須選擇「建立新版本 (New version)」，權限務必設為「所有人 (Anyone)」。\n' +
          '2.【學校/機構帳號限制】：若使用學校 Google 帳號 (@cloud.tcssh...) 部署，學校資安政策常封鎖外部存取。請改用個人一般 Gmail (@gmail.com) 帳號建立 GAS 專案並部署。\n' +
          '3.【網址格式】：網址不可以包含學校機構子網域，且必須以 /exec 結尾。'
        );
      }

      let resJson: any = null;
      try {
        resJson = JSON.parse(resText);
      } catch (pErr) {
        throw new Error(`Google Apps Script 回傳無效 JSON 格式：${resText.substring(0, 150)}`);
      }

      if (resJson && (resJson.result === 'success' || resJson.id)) {
        const fileUrl = resJson.webViewLink || resJson.url || `https://drive.google.com/file/d/${resJson.id}/view`;
        return {
          id: resJson.id,
          name: customFileName || file.name,
          webViewLink: fileUrl,
          url: fileUrl,
        };
      } else {
        throw new Error(resJson?.message || 'Google Apps Script 處理失敗，請確認腳本授權與資料夾權限。');
      }
    } catch (gasErr: any) {
      const parsedMsg = parseErrorDetails(gasErr);
      console.warn('GAS Upload error, checking OAuth fallback:', parsedMsg);

      if (!getDriveAccessToken()) {
        if (parsedMsg.includes('Failed to fetch') || gasErr?.name === 'TypeError') {
          throw new Error(
            'Google Apps Script 跨網域連線失敗 (Failed to fetch)。\n\n' +
            '【原因分析】：當瀏覽器開啟防火牆、跨網域防護或連線不穩定時，Google 伺服器回應被瀏覽器攔截。\n\n' +
            '【對策】：系統已自動將檔案備份儲存至大會資料庫，請毋需擔心報名權益！'
          );
        }
        throw new Error(`Google Apps Script 雲端上傳失敗：${parsedMsg}`);
      }
    }
  }

  // Mode 2: OAuth Access Token Upload
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error('大會管理員尚未授權連線 Google Drive 雲端硬碟');
  }

  const metadata: any = {
    name: customFileName || file.name,
    mimeType: file.type || 'application/octet-stream',
  };

  if (targetFolder && !existingFileId) {
    metadata.parents = [targetFolder];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const filePartHeader = `${delimiter}Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;

  const fileArrayBuffer = await file.arrayBuffer();

  const multipartBody = new Blob(
    [
      metadataPart,
      filePartHeader,
      fileArrayBuffer,
      closeDelimiter,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  // If existingFileId is present, attempt PATCH request to overwrite content on the same file ID
  if (existingFileId) {
    try {
      const patchResponse = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: multipartBody,
        }
      );

      if (patchResponse.ok) {
        const result = await patchResponse.json();
        const fileUrl = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
        return {
          id: result.id,
          name: result.name,
          webViewLink: fileUrl,
          url: fileUrl,
        };
      }
    } catch (patchErr) {
      console.warn('OAuth PATCH file overwrite failed, falling back to POST new file:', patchErr);
    }
  }

  // Fallback: POST request to create a new file
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: multipartBody,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      clearDriveAccessToken();
      throw new Error('Google Drive 連線授權已過期，管理員需重新開啟授權');
    }
    if (response.status === 404) {
      throw new Error('大會設定之 Google Drive 資料夾 ID 不存在或已被刪除');
    }
    if (response.status === 403) {
      throw new Error('Google Drive 資料夾權限不足或未開放存取權');
    }
    throw new Error(`Google Drive API 錯誤 (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Set file permission to 'anyone with link can view' so school representatives won't get "Need Access Permission" errors
  if (result.id && token) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      });
    } catch (pErr) {
      console.warn('Failed to set public permission on uploaded file:', pErr);
    }
  }

  const fileUrl = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
  return {
    id: result.id,
    name: result.name,
    webViewLink: fileUrl,
    url: fileUrl,
  };
}

/**
 * Delete a file from Google Drive using its file ID
 */
export async function deleteFileFromDrive(fileId: string): Promise<boolean> {
  if (!fileId) return false;
  const token = getDriveAccessToken();
  const gasUrl = getGasWebAppUrl();

  // 1. Try OAuth token if available
  if (token) {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok || res.status === 404) {
        return true;
      }
      if (res.status === 401) {
        clearDriveAccessToken();
      }
    } catch (err) {
      console.warn('OAuth delete from drive error:', err);
    }
  }

  // 2. Fallback to GAS Web App URL if configured
  if (gasUrl) {
    try {
      await fetch(gasUrl, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'delete',
          fileId,
        }),
      });
      return true;
    } catch (gErr) {
      console.warn('GAS delete from drive error:', gErr);
    }
  }

  return false;
}

/**
 * Check if a file exists in Google Drive
 */
export async function checkDriveFileExists(fileId: string): Promise<boolean> {
  const token = getDriveAccessToken();
  if (!token || !fileId) return true;

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 404) return false;
    if (res.ok) {
      const data = await res.json();
      return !data.trashed;
    }
    return true;
  } catch {
    return true;
  }
}

