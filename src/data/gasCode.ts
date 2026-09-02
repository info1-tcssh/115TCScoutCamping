export const FIXED_CODE_GS = `// ⚙️ OAuth 認證設定（請至 Google Cloud Console 複製 Client ID 與 Client Secret 填入）
const OAUTH_CLIENT_ID = '969089738237-e57nbmep29jc6gvq9es5f8sgbphsjp64.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = 'YOUR_GOOGLE_CLIENT_SECRET';
/**
 * 動態取得當前運行的 Web App 網址（避免全域變數導致 URL 不一致）
 */
function getRedirectUri() {
  try {
    var url = ScriptApp.getService().getUrl();
    if (url) {
      return url.split('?')[0]; // 移除可能帶有的網址參數
    }
  } catch (e) {
    Logger.log("getRedirectUri error: " + e.toString());
  }
  return "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";
}

function doGet(e) {
  var email = "";

  // 1. 優先嘗試從 GAS Session 直接抓取（原生身份驗證模式，最穩定）
  try {
    email = Session.getActiveUser().getEmail();
  } catch (err) {
    email = "";
  }

  // 2. 若 Session 抓不到，嘗試從快取中讀取先前已驗證過的 Email (解決重新整理頁面跳轉問題)
  var userCache = CacheService.getUserCache();
  if (!email && userCache) {
    var cachedEmail = userCache.get("LOGGED_IN_EMAIL");
    if (cachedEmail) {
      email = cachedEmail;
    }
  }

  // 3. 若無 Session 與快取，但帶有 OAuth authorization code，進行 Token 交換
  if (!email && e && e.parameter && e.parameter.code) {
    var authEmail = getEmailFromOAuthCode(e.parameter.code);
    if (authEmail) {
      email = authEmail;
      if (userCache) {
        userCache.put("LOGGED_IN_EMAIL", email, 1800); // 快取 30 分鐘
      }
    }
  }

  // 成功取得 Email：渲染主系統 Index.html
  if (email && email.trim() !== "") {
    var template = HtmlService.createTemplateFromFile('Index');
    template.webAppUrl = getRedirectUri();
    template.userEmail = email.trim();
    return template.evaluate()
      .setTitle('第41屆行義蘭姐報名系統')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 4. 若仍無法取得 Email：顯示 Google OAuth 登入驗證頁面
  var redirectUri = getRedirectUri();
  var authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
    "client_id=" + encodeURIComponent(OAUTH_CLIENT_ID) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20openid%20profile" +
    "&prompt=select_account";

  var htmlContent = \`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif; text-align: center; padding: 40px 20px; background: #f5f7fa; color: #333; }
          .card { background: white; padding: 35px 25px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); display: inline-block; max-width: 480px; width: 100%; box-sizing: border-box; }
          .icon { font-size: 48px; margin-bottom: 10px; }
          h2 { color: #003366; margin-top: 10px; font-size: 20px; }
          p { color: #666; font-size: 14px; line-height: 1.6; text-align: left; background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #003366; }
          .btn { background-color: #1a73e8; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-top: 20px; font-size: 16px; transition: 0.2s; border: none; cursor: pointer; }
          .btn:hover { background-color: #1557b0; }
          .note { font-size: 12px; color: #888; margin-top: 18px; line-height: 1.5; text-align: left; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🔐</div>
          <h2>第41屆行義蘭姐報名系統</h2>
          <p>請點擊下方按鈕進行 Google 帳號驗證登入，系統將會讀取您的 Google 電子郵件帳號作為身分識別。</p>
          <a href="\${authUrl}" class="btn">🔑 使用 Google 帳號驗證登入</a>
          
          <div class="note">
            💡 <strong>系統提示：</strong><br>
            若點擊後提示「未通過 Google 驗證」，請確認您的 Google 帳號已加入 GCP 測試人員名單，或請系統管理者將 GAS 發布設定調整為「以存取應用程式的使用者身分執行」。
          </div>
        </div>
      </body>
    </html>
  \`;

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle('身分驗證 - 第41屆行義蘭姐報名系統');
}

// 處理外部系統以 Web API (POST) 上傳與刪除檔案至 Google Drive
function doPost(e) {
  try {
    var contents = e && e.postData ? e.postData.contents : "";
    var data = contents ? JSON.parse(contents) : {};

    // 處理檔案刪除請求
    if (data.action === 'delete' || (data.fileId && !data.base64Data)) {
      if (data.fileId) {
        try {
          var targetFile = DriveApp.getFileById(data.fileId);
          targetFile.setTrashed(true); // 移至 Google Drive 垃圾桶
          return ContentService.createTextOutput(JSON.stringify({
            result: 'success',
            message: '檔案已成功從 Google Drive 移至垃圾桶'
          })).setMimeType(ContentService.MimeType.JSON);
        } catch (delErr) {
          return ContentService.createTextOutput(JSON.stringify({
            result: 'error',
            message: 'Google Drive 刪除失敗: ' + delErr.toString()
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // 處理檔案上傳請求
    if (data.folderId && data.base64Data) {
      if (typeof data.base64Data !== 'string' || data.base64Data.length < 8 || data.base64Data === 'null') {
        throw new Error('接收到的 Base64 檔案資料無效或因 GAS 傳輸大小限制遭到截斷。請將檔案縮小至 2.5MB 以下，或使用 Google Drive OAuth 直連模式上傳。');
      }
      var folder = DriveApp.getFolderById(data.folderId);
      var decodedBytes = Utilities.base64Decode(data.base64Data);
      if (!decodedBytes || decodedBytes.length < 4) {
        throw new Error('解碼後的檔案內容為空或大小異常（小於 4 位元組），拒絕建立損毀檔案。');
      }
      var mime = data.mimeType || getSafeMimeType(data.fileName || "uploaded_file");
      var cleanBlob = Utilities.newBlob(decodedBytes).setContentType(mime).setName(data.fileName || "uploaded_file");

      var newFile = folder.createFile(cleanBlob);
      try {
        newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (sharingErr) {
        Logger.log("Sharing error: " + sharingErr.toString());
      }

      var fileId = newFile.getId();
      var fileUrl = newFile.getUrl();

      return ContentService.createTextOutput(JSON.stringify({
        result: 'success',
        id: fileId,
        url: fileUrl,
        webViewLink: fileUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: '無效的請求參數'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 用 OAuth Code 向 Google 伺服器交換 Token 並取得使用者 Email
function getEmailFromOAuthCode(code) {
  try {
    var redirectUri = getRedirectUri();
    var tokenResponse = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
      method: "post",
      payload: {
        code: code,
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      },
      muteHttpExceptions: true
    });
    
    var tokenJson = JSON.parse(tokenResponse.getContentText());
    if (tokenJson.access_token) {
      var userResponse = UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: "Bearer " + tokenJson.access_token },
        muteHttpExceptions: true
      });
      var userJson = JSON.parse(userResponse.getContentText());
      if (userJson && userJson.email) {
        return userJson.email;
      }
    } else {
      Logger.log("OAuth Token Exchange failed: " + tokenResponse.getContentText());
    }
  } catch (err) {
    Logger.log("OAuth Exchange Exception: " + err.toString());
  }
  return null;
}

// 取得試算表工作表的 Helper 函式
function getSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;
  
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().indexOf(sheetName) !== -1) {
      return sheets[i];
    }
  }
  return null;
}

// 通用 Log 寫入函式
function writeLog(actionType, detail, userId, email, schoolName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("log");
    if (!sheet) {
      sheet = ss.insertSheet("log");
      sheet.appendRow(["時間", "使用者ID", "Email", "學校名稱", "動作類型", "紀錄內容"]);
      sheet.getRange("1:1").setFontWeight("bold").setBackground("#e0e0e0");
    }
    var nowStr = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      nowStr,
      userId || "-",
      email || "-",
      schoolName || "-",
      actionType || "-",
      detail || "-"
    ]);
  } catch (e) {
    Logger.log("Write log failed: " + e.toString());
  }
}

// 1. 初始化系統：檢查登入狀態、角色與學校清單（支援帶入認證後 Email）
function initSystem(passedEmail) {
  var email = passedEmail || "";
  if (!email) {
    try {
      email = Session.getActiveUser().getEmail();
    } catch (e) {
      email = "";
    }
  }
  if (email) email = email.trim();
  
  var schoolSheet = getSheet("school");
  var schools = [];
  if (schoolSheet) {
    var schoolData = schoolSheet.getDataRange().getValues();
    for (var i = 1; i < schoolData.length; i++) {
      if (schoolData[i][0] !== "" && schoolData[i][0] !== undefined) {
        schools.push({
          school_id: String(schoolData[i][0]).trim(),
          school_name: String(schoolData[i][1]).trim()
        });
      }
    }
  }
  
  var userSheet = getSheet("user");
  var matchedRecords = [];
  var roles = [];
  
  if (userSheet && email) {
    var userData = userSheet.getDataRange().getValues();
    for (var j = 1; j < userData.length; j++) {
      var rowEmail = String(userData[j][4]).trim();
      if (rowEmail.toLowerCase() === email.toLowerCase()) {
        var uType = String(userData[j][5]).trim().toLowerCase();
        var rec = {
          user_id: String(userData[j][0]).trim(),
          user_name: String(userData[j][1]).trim(),
          school_id: String(userData[j][2]).trim(),
          user_phone: String(userData[j][3]).trim(),
          user_email: rowEmail,
          user_type: uType,
          notes: userData[j][6] ? String(userData[j][6]).trim() : ""
        };
        
        var matchedSchool = schools.find(function(s) { return s.school_id === rec.school_id; });
        rec.school_name = matchedSchool ? matchedSchool.school_name : ("學校編號 " + rec.school_id);
        
        matchedRecords.push(rec);
        if (roles.indexOf(uType) === -1) {
          roles.push(uType);
        }
      }
    }
  }

  // 管理者權限雙重比對
  var adminSheet = getSheet("admin") || getSheet("管理者");
  if (adminSheet && email) {
    var adminData = adminSheet.getDataRange().getValues();
    for (var a = 0; a < adminData.length; a++) {
      if (!adminData[a]) continue;
      var aEmail = String(adminData[a][0] || adminData[a][1] || adminData[a][2] || "").trim().toLowerCase();
      if (aEmail && aEmail === email.toLowerCase()) {
        if (roles.indexOf("admin") === -1) {
          roles.push("admin");
        }
        break;
      }
    }
  }

  var isRegistered = matchedRecords.length > 0 || roles.indexOf("admin") !== -1;
  
  if (email) {
    var rec = matchedRecords[0];
    writeLog("LOGIN", "開啟系統 (角色: " + (roles.join(",") || "未註冊") + ")", rec ? rec.user_id : "-", email, rec ? rec.school_name : "-");
  }
  
  return {
    email: email,
    isLoggedIn: !!email,
    isRegistered: isRegistered,
    roles: roles,
    userRecords: matchedRecords,
    schools: schools
  };
}

// 2. 處理使用者註冊
function registerUser(formData) {
  var email = (formData && formData.user_email) ? formData.user_email : Session.getActiveUser().getEmail();
  if (!email || email.trim() === "") {
    return { success: false, message: "無法驗證 Google 帳號，請關閉後重新開啟連結或登入！" };
  }
  email = email.trim();
  
  var schoolId = String(formData.school_id).trim();
  var userName = String(formData.user_name).trim();
  var userPhone = String(formData.user_phone).trim();
  var notes = formData.notes ? String(formData.notes).trim() : "";
  
  if (!schoolId || !userName || !userPhone) {
    return { success: false, message: "請完整填寫必填欄位 (學校、姓名、電話)！" };
  }
  
  var userSheet = getSheet("user");
  if (!userSheet) {
    return { success: false, message: "資料庫異常：找不到 user 工作表！" };
  }
  
  var userData = userSheet.getDataRange().getValues();
  
  if (schoolId !== "55") {
    for (var i = 1; i < userData.length; i++) {
      var existingSchoolId = String(userData[i][2]).trim();
      var existingType = String(userData[i][5]).trim().toLowerCase();
      if (existingSchoolId === schoolId && existingType === "user") {
        var existingName = String(userData[i][1]).trim();
        return { 
          success: false, 
          message: "該學校已有代表人員（" + existingName + "）完成註冊！每個學校僅限註冊一組帳號（臺中二中除外）。" 
        };
      }
    }
  }
  
  var maxIdNum = 0;
  for (var k = 1; k < userData.length; k++) {
    var uid = String(userData[k][0]).trim();
    if (uid.indexOf("user") === 0) {
      var num = parseInt(uid.replace("user", ""), 10);
      if (!isNaN(num) && num > maxIdNum) {
        maxIdNum = num;
      }
    }
  }
  var newUserId = "user" + (maxIdNum + 1);
  
  userSheet.appendRow([newUserId, userName, schoolId, userPhone, email, "user", notes]);
  
  var schoolSheet = getSheet("school");
  var schoolName = "學校編號 " + schoolId;
  if (schoolSheet) {
    var sData = schoolSheet.getDataRange().getValues();
    for (var s = 1; s < sData.length; s++) {
      if (String(sData[s][0]).trim() === schoolId) {
        schoolName = String(sData[s][1]).trim();
        break;
      }
    }
  }
  
  writeLog("REGISTER", "完成代表人員註冊：" + userName + " (電話: " + userPhone + ")", newUserId, email, schoolName);

  return {
    success: true,
    message: "註冊成功！",
    user: {
      user_id: newUserId,
      user_name: userName,
      school_id: schoolId,
      user_phone: userPhone,
      user_email: email,
      user_type: "user",
      notes: notes
    }
  };
}

// 3. 取得使用者已上傳的檔案清單
function getUserUploadedFiles(userId) {
  try {
    var uploadSheet = getSheet("file_upload");
    if (!uploadSheet) return {};

    var data = uploadSheet.getDataRange().getValues();
    var filesMap = {};

    for (var i = 1; i < data.length; i++) {
      if (!data[i] || !data[i][0]) continue;
      
      var rUserId = String(data[i][0]).trim();
      if (rUserId === String(userId).trim()) {
        var fileName = String(data[i][1]).trim();
        var fileUrl = String(data[i][2]).trim();
        var slotKey = String(data[i][4] || "").trim();

        if (!slotKey || slotKey === "已上傳") {
          if (fileName.indexOf("報名表") !== -1 && fileName.indexOf("掃描") === -1) slotKey = "file1";
          else if (fileName.indexOf("核章") !== -1 || fileName.indexOf("掃描") !== -1) slotKey = "file2";
          else if (fileName.indexOf("SAFE") !== -1 || fileName.indexOf("證書") !== -1) slotKey = "file3";
          else if (fileName.indexOf("收據") !== -1 || fileName.indexOf("繳費") !== -1) slotKey = "file4";
        }

        var isAlive = true;
        try {
          var match = fileUrl.match(/[-\\w]{25,}/);
          if (match && match[0]) {
            var driveFile = DriveApp.getFileById(match[0]);
            if (driveFile.isTrashed()) isAlive = false;
          }
        } catch (e) {
          isAlive = true;
        }

        if (slotKey) {
          filesMap[slotKey] = {
            name: fileName,
            url: fileUrl,
            time: String(data[i][3] || ""),
            isDead: !isAlive
          };
        }
      }
    }
    return filesMap;
  } catch (e) {
    Logger.log("getUserUploadedFiles 錯誤: " + e.toString());
    return {};
  }
}

// MIME 類型判斷
function getSafeMimeType(fileName) {
  if (!fileName) return 'application/octet-stream';
  var ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'ods': return 'application/vnd.oasis.opendocument.spreadsheet';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'odt': return 'application/vnd.oasis.opendocument.text';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

// 4. 上傳檔案處理
function processFormWithAuthPayload(payload) {
  try {
    var folderId = '1sPiGTnJcn2P0onObYvXXhkOeZRWQAF0l'; 
    var folder = DriveApp.getFolderById(folderId);
    
    var schoolId = String(payload.schoolId).trim();
    var userId = String(payload.userId).trim();
    var email = (payload && payload.userEmail) ? payload.userEmail : Session.getActiveUser().getEmail();
    
    var schoolSheet = getSheet("school");
    var schoolName = "學校編號 " + schoolId;
    if (schoolSheet) {
      var sData = schoolSheet.getDataRange().getValues();
      for (var s = 1; s < sData.length; s++) {
        if (String(sData[s][0]).trim() === schoolId) {
          schoolName = String(sData[s][1]).trim();
          break;
        }
      }
    }

    var uploadedFiles = [];
    var fileFields = [
      { field: 'file1', name: '報名表' },
      { field: 'file2', name: '學校核章之報名掃描檔' },
      { field: 'file3', name: '領隊之SAFE FROM HARM證書' },
      { field: 'file4', name: '繳費收據開立表(繳費收據影本)' }
    ];
    
    var uploadSheet = getSheet("file_upload");
    var nowStr = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");
    
    for (var i = 0; i < fileFields.length; i++) {
      var item = fileFields[i];
      if (payload.files && payload.files[item.field] && payload.files[item.field].data) {
        var fileObj = payload.files[item.field];
        var originalName = fileObj.name;
        var newName = schoolId + "_" + originalName;
        
        var decodedBytes = Utilities.base64Decode(fileObj.data);
        var safeMime = getSafeMimeType(newName);
        var cleanBlob = Utilities.newBlob(decodedBytes).setContentType(safeMime).setName(newName);
        
        var newFile = folder.createFile(cleanBlob);
        newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileUrl = newFile.getUrl();
        
        uploadedFiles.push({
          slotKey: item.field,
          type: item.name,
          name: newName,
          url: fileUrl
        });
        
        if (uploadSheet) {
          uploadSheet.appendRow([userId, newName, fileUrl, nowStr, item.field]);
        }
        
        writeLog("UPLOAD", "上傳檔案 [" + item.name + "]：" + newName, userId, email, schoolName);
      }
    }
    
    var updatedFilesMap = getUserUploadedFiles(userId);

    return {
      success: true,
      message: "檔案上傳成功！",
      files: uploadedFiles,
      updatedFiles: updatedFilesMap
    };
    
  } catch (e) {
    return {
      success: false,
      message: "上傳失敗：" + e.toString()
    };
  }
}

// 5. 刪除指定的上傳檔案
function deleteUserFile(userId, slotKey, userEmail) {
  try {
    var email = userEmail || Session.getActiveUser().getEmail();
    var uploadSheet = getSheet("file_upload");
    if (!uploadSheet) return { success: false, message: "找不到 file_upload 資料表！" };
    
    var data = uploadSheet.getDataRange().getValues();
    var targetRow = -1;
    var targetFileUrl = "";
    var targetFileName = "";
    
    for (var i = data.length - 1; i >= 1; i--) {
      var rUserId = String(data[i][0]).trim();
      var rFileName = String(data[i][1]).trim();
      var rSlot = String(data[i][4] || "").trim();
      
      var isMatch = false;
      if (rUserId === String(userId).trim()) {
        if (rSlot === slotKey) {
          isMatch = true;
        } else {
          if (slotKey === "file1" && rFileName.indexOf("報名表") !== -1 && rFileName.indexOf("掃描") === -1) isMatch = true;
          if (slotKey === "file2" && (rFileName.indexOf("核章") !== -1 || rFileName.indexOf("掃描") !== -1)) isMatch = true;
          if (slotKey === "file3" && (rFileName.indexOf("SAFE") !== -1 || rFileName.indexOf("證書") !== -1)) isMatch = true;
          if (slotKey === "file4" && (rFileName.indexOf("收據") !== -1 || rFileName.indexOf("繳費") !== -1)) isMatch = true;
        }
      }
      
      if (isMatch) {
        targetRow = i + 1;
        targetFileName = rFileName;
        targetFileUrl = String(data[i][2]).trim();
        break;
      }
    }
    
    if (targetRow === -1) {
      return { success: false, message: "資料庫中找不到該檔案紀錄。" };
    }
    
    var userSheet = getSheet("user");
    var schoolName = "-";
    if (userSheet) {
      var uData = userSheet.getDataRange().getValues();
      for (var u = 1; u < uData.length; u++) {
        if (String(uData[u][0]).trim() === String(userId).trim()) {
          var sId = String(uData[u][2]).trim();
          var schoolSheet = getSheet("school");
          if (schoolSheet) {
            var sData = schoolSheet.getDataRange().getValues();
            for (var s = 1; s < sData.length; s++) {
              if (String(sData[s][0]).trim() === sId) {
                schoolName = String(sData[s][1]).trim();
                break;
              }
            }
          }
          break;
        }
      }
    }

    try {
      var match = targetFileUrl.match(/[-\\w]{25,}/);
      if (match && match[0]) {
        DriveApp.getFileById(match[0]).setTrashed(true);
      }
    } catch (driveErr) {
      Logger.log("Drive 刪除失敗，繼續清除紀錄: " + driveErr.toString());
    }
    
    uploadSheet.deleteRow(targetRow);
    writeLog("DELETE", "刪除檔案 [" + slotKey + "]：" + targetFileName, userId, email, schoolName);

    var updatedFilesMap = getUserUploadedFiles(userId);

    return { 
      success: true, 
      message: "檔案刪除成功！您現在可以重新上傳檔案。",
      updatedFiles: updatedFilesMap
    };
    
  } catch (e) {
    return { success: false, message: "刪除失敗：" + e.toString() };
  }
}

// 6. 管理員控制台資料抓取
function getAdminDashboardData() {
  try {
    var schoolSheet = getSheet("school");
    var userSheet = getSheet("user");
    var uploadSheet = getSheet("file_upload");
    
    var schools = (schoolSheet && schoolSheet.getLastRow() > 0) ? schoolSheet.getDataRange().getValues() : [];
    var users = (userSheet && userSheet.getLastRow() > 0) ? userSheet.getDataRange().getValues() : [];
    var uploads = (uploadSheet && uploadSheet.getLastRow() > 0) ? uploadSheet.getDataRange().getValues() : [];
    
    var userToSchoolMap = {};
    var schoolUsersMap = {};
    
    for (var u = 1; u < users.length; u++) {
      if (!users[u]) continue;
      var uId = String(users[u][0] || "").trim();
      var sId = String(users[u][2] || "").trim();
      if (uId && sId) {
        userToSchoolMap[uId] = sId;
        if (!schoolUsersMap[sId]) schoolUsersMap[sId] = [];
        schoolUsersMap[sId].push(users[u]);
      }
    }
    
    var list = [];
    for (var i = 1; i < schools.length; i++) {
      if (!schools[i] || !schools[i][0]) continue;
      var sId = String(schools[i][0]).trim();
      var sName = String(schools[i][1]).trim();
      
      var schoolUserList = schoolUsersMap[sId] || [];
      var registeredUser = schoolUserList.find(function(u) { 
        return String(u[5] || "").trim().toLowerCase() === "user"; 
      }) || schoolUserList[0];
      
      var userFiles = uploads.filter(function(up) {
        if (!up || !up[0]) return false;
        var fileUserId = String(up[0]).trim();
        var fileSchoolId = userToSchoolMap[fileUserId];
        var fileName = String(up[1] || "").trim();
        
        return (fileSchoolId === sId) || (fileName.indexOf(sId + "_") === 0);
      });
      
      var latestSlotMap = {};
      userFiles.forEach(function(f) {
        if (!f) return;
        var fName = String(f[1] || "").trim();
        var fUrl = String(f[2] || "").trim();
        var slotKey = String(f[4] || "").trim();
        
        if (!slotKey || slotKey === "已上傳") {
          if (fName.indexOf("報名表") !== -1 && fName.indexOf("掃描") === -1) slotKey = "file1";
          else if (fName.indexOf("核章") !== -1 || fName.indexOf("掃描") !== -1) slotKey = "file2";
          else if (fName.indexOf("SAFE") !== -1 || fName.indexOf("證書") !== -1) slotKey = "file3";
          else if (fName.indexOf("收據") !== -1 || fName.indexOf("繳費") !== -1) slotKey = "file4";
        }
        
        if (slotKey) {
          var isDriveFileAlive = true;
          try {
            var match = fUrl.match(/[-\\w]{25,}/);
            if (match && match[0]) {
              var driveFile = DriveApp.getFileById(match[0]);
              if (driveFile.isTrashed()) {
                isDriveFileAlive = false;
              }
            }
          } catch (driveErr) {
            isDriveFileAlive = true;
          }

          var rawDate = f[3];
          var timeStr = "";
          if (rawDate) {
            timeStr = (rawDate instanceof Date) 
              ? Utilities.formatDate(rawDate, "GMT+8", "yyyy-MM-dd HH:mm:ss") 
              : String(rawDate);
          }

          if (isDriveFileAlive) {
            latestSlotMap[slotKey] = {
              name: fName,
              url: fUrl,
              time: timeStr
            };
          }
        }
      });
      
      var displayFiles = Object.keys(latestSlotMap).map(function(k) { return latestSlotMap[k]; });
      
      list.push({
        school_id: String(sId),
        school_name: String(sName),
        registered: !!registeredUser,
        user_name: registeredUser ? String(registeredUser[1] || "-") : "-",
        user_phone: registeredUser ? String(registeredUser[3] || "-") : "-",
        user_email: registeredUser ? String(registeredUser[4] || "-") : "-",
        upload_count: displayFiles.length,
        files: displayFiles
      });
    }
    
    return list;
  } catch (e) {
    Logger.log("getAdminDashboardData 錯誤: " + e.toString());
    return [];
  }
}

// 7. 取得管理員 Log 列表
function getAdminLogs() {
  var sheet = getSheet("log");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var logs = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var rawDate = data[i][0];
    var timeStr = (rawDate instanceof Date) 
      ? Utilities.formatDate(rawDate, "GMT+8", "yyyy-MM-dd HH:mm:ss") 
      : String(rawDate);
      
    logs.push({
      time: timeStr,
      userId: String(data[i][1] || ""),
      email: String(data[i][2] || ""),
      schoolName: String(data[i][3] || ""),
      actionType: String(data[i][4] || ""),
      detail: String(data[i][5] || "")
    });
  }
  return logs;
}
`;

export const FIXED_INDEX_HTML = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: "PingFang TC", "Microsoft JhengHei", sans-serif; padding: 20px; max-width: 950px; margin: auto; line-height: 1.6; background-color: #f4f6f9; }
    .card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); margin-bottom: 25px; }
    h2, h3 { color: #003366; margin-top: 0; }
    
    /* 頂部導覽列 */
    .nav-bar { display: flex; justify-content: space-between; align-items: center; background-color: #003366; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; }
    .nav-bar .user-info { font-size: 0.95em; }
    .btn-switch { background-color: #ff9800; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    .btn-switch:hover { background-color: #e68a00; }

    /* 表單樣式 */
    label { display: block; margin-top: 15px; font-weight: bold; color: #444; }
    input[type="text"], input[type="file"], select, textarea { width: 100%; padding: 10px; margin-top: 6px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px; font-size: 15px; }
    input[readonly] { background-color: #e9ecef; color: #6c757d; cursor: not-allowed; }
    
    /* 按鈕樣式 */
    .btn { display: inline-block; padding: 10px 18px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px; margin-bottom: 10px; border: none; cursor: pointer; }
    .btn:hover { background-color: #218838; }
    .btn-submit { width: 100%; background-color: #0056b3; border: none; color: white; padding: 12px; font-size: 16px; border-radius: 5px; cursor: pointer; margin-top: 20px; font-weight: bold; }
    .btn-submit:hover { background-color: #00418d; }

    /* 獨立檔案卡片 */
    .file-slot-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-top: 15px; background: #fafafa; }
    .file-slot-card.uploaded { border-left: 5px solid #28a745; background: #f4fbf7; }
    .file-slot-card.unuploaded { border-left: 5px solid #ffc107; }
    
    .btn-danger { background-color: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; font-weight: bold; }
    .btn-danger:hover { background-color: #bb2d3b; }

    /* 模式選擇卡片 */
    .mode-box { display: flex; gap: 20px; margin-top: 20px; }
    .mode-card { flex: 1; border: 2px solid #0056b3; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; background: #f8f9fa; transition: 0.2s; }
    .mode-card:hover { background: #e9f5ff; transform: translateY(-3px); }

    /* 動畫與訊息框 */
    .loading-container { text-align: center; padding: 30px; }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #0056b3; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 15px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .error-box { background-color: #f8d7da; color: #842029; padding: 15px; border-radius: 5px; margin-top: 15px; line-height: 1.8; }
    .success-box { background-color: #d1e7dd; color: #0f5132; padding: 15px; border-radius: 5px; margin-top: 15px; }

    /* 表格樣式 */
    table { width: 100%; min-width: 850px; table-layout: fixed; border-collapse: collapse; margin-top: 15px; font-size: 0.9em; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    td { word-wrap: break-word; word-break: break-all; }
    tr:nth-child(even) { background-color: #f2f2f2; }

    th {
      background-color: #003366;
      color: white;
      cursor: pointer !important;
      user-select: none;
      position: relative;
      padding-right: 24px !important;
      transition: background-color 0.15s ease;
    }
    th:hover {
      background-color: #004b93 !important;
    }
    th::after {
      content: ' ⇅';
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.45;
      font-size: 0.75em;
      pointer-events: none;
    }
    th.sort-asc::after {
      content: ' ▲' !important;
      opacity: 1 !important;
      color: #60a5fa;
    }
    th.sort-desc::after {
      content: ' ▼' !important;
      opacity: 1 !important;
      color: #60a5fa;
    }

    /* Admin Tab 頁籤 */
    .tab-container { display: flex; border-bottom: 2px solid #003366; margin-bottom: 20px; }
    .tab-btn { padding: 10px 20px; cursor: pointer; font-weight: bold; background: #e9ecef; border: none; margin-right: 5px; border-radius: 5px 5px 0 0; }
    .tab-btn.active { background: #003366; color: white; }

    /* Log 篩選列 */
    .filter-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px; align-items: center; background: #eef2f5; padding: 12px; border-radius: 6px; }
    .filter-bar input, .filter-bar select { width: auto; margin-top: 0; padding: 8px 12px; }

    .badge-log { padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85em; }
    .badge-log-UPLOAD { background: #d1e7dd; color: #0f5132; }
    .badge-log-DELETE { background: #f8d7da; color: #842029; }
    .badge-log-REGISTER { background: #cff4fc; color: #055160; }
    .badge-log-LOGIN { background: #e2e3e5; color: #41464b; }

    /* 全螢幕遮罩 */
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }

    .spinner-card {
      background-color: #ffffff;
      padding: 30px 40px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
    }

    .spinner-icon {
      width: 48px;
      height: 48px;
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-text {
      font-size: 16px;
      font-weight: bold;
      color: #333333;
    }
  </style>
</head>
<body>

  <h2 style="text-align: center;">臺中市第41屆行義蘭姐童軍專科考驗暨聯團露營<br>報名系統</h2>

  <!-- 1. 載入中畫面 -->
  <div id="view-loading" class="card loading-container">
    <div class="spinner"></div>
    <p>正在透過 Google 帳號驗證您的身份，請稍候...</p>
  </div>

  <!-- 2. 頂部身分與切換列 -->
  <div id="nav-bar" class="nav-bar" style="display: none;">
    <div class="user-info">
      登入帳號：<strong id="nav-email"></strong><br>
      當前模式：<span id="nav-mode-badge" style="background: #ffc107; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold;"></span>
    </div>
    <button id="btn-switch-mode" class="btn-switch" style="display: none;" onclick="toggleRoleMode()">🔄 切換模式</button>
  </div>

  <!-- 3. 未完成註冊表單 -->
  <div id="view-register" class="card" style="display: none;">
    <h3>📝 使用者基本資料註冊</h3>
    <p style="color: #666; font-size: 0.95em;">您是首次使用此系統，請先完成代表人員資訊註冊：</p>
    
    <form id="regForm" onsubmit="handleRegisterSubmit(event, this)">
      <label>Google 驗證帳號 (不可修改)</label>
      <input type="text" id="reg-email" readonly>

      <label>學校名稱 <span style="color:red;">*</span></label>
      <select name="school_id" id="reg-school" required>
        <option value="">-- 請選擇您的學校 --</option>
      </select>

      <label>代表人員姓名 <span style="color:red;">*</span></label>
      <input type="text" name="user_name" placeholder="請輸入姓名" required>

      <label>聯絡電話 / 分機 <span style="color:red;">*</span></label>
      <input type="text" name="user_phone" placeholder="例如：04-22021521#1340" required>

      <label>備註 (選填)</label>
      <textarea name="notes" rows="2" placeholder="若有特殊事項請在此說明"></textarea>

      <button type="submit" id="reg-btn" class="btn-submit">完成註冊並進入報名系統</button>
    </form>
    <div id="reg-status"></div>
  </div>

  <!-- 4. 模式選擇畫面 -->
  <div id="view-mode-select" class="card" style="display: none;">
    <h3>🔀 請選擇您本次要進入的模式</h3>
    <p>偵測到您的帳號擁有管理員與一般使用者權限，請選擇模式：</p>
    <div class="mode-box">
      <div class="mode-card" onclick="switchMode('user')">
        <h3 style="color: #28a745;">🏫 一般學校使用者模式</h3>
        <p>進行檔案下載與報名資料上傳</p>
      </div>
      <div class="mode-card" onclick="switchMode('admin')">
        <h3 style="color: #0056b3;">🛠️ 主辦方管理員控制台</h3>
        <p>查看全區各校報名與上傳狀況總表</p>
      </div>
    </div>
  </div>

  <!-- 5. 一般使用者介面 -->
  <div id="view-user-main" style="display: none;">
    <div class="card">
      <h3>📥 1. 範本檔案下載</h3>
      <p>請先下載並填寫以下兩份範本檔案：</p>
      <a href="https://docs.google.com/spreadsheets/d/1YlbAMCysWygLlzVeCeNxyYogkrGV85X6/export?format=xlsx" class="btn">⬇️ 下載：報名表 (Excel)</a>
      <a href="https://docs.google.com/document/d/1yHr_YhXKiiJEmy704b5tQhR_KPCRnFbG/export?format=docx" class="btn">⬇️ 下載：繳費收據開立表 (Word)</a>
    </div>

    <div class="card">
      <h3>📤 2. 報名資料上傳與管理</h3>
      <p><strong>服務學校：</strong><span id="user-school-name" style="color: #0056b3; font-weight: bold;"></span></p>

      <input type="hidden" id="user-school-id">
      <input type="hidden" id="user-id">

      <div id="file-slots-container">
        <p>載入檔案狀態中...</p>
      </div>

      <button type="button" id="uploadBtn" class="btn-submit" style="display: none;" onclick="handleUploadSubmit()">確認上傳選擇的檔案</button>

      <div id="upload-status"></div>
    </div>
  </div>

  <!-- 6. 管理員介面 -->
  <div id="view-admin-main" class="card" style="display: none;">
    <div class="tab-container">
      <button class="tab-btn active" id="tab-btn-dashboard" onclick="switchAdminTab('dashboard')">🏫 各校報名狀況總表</button>
      <button class="tab-btn" id="tab-btn-logs" onclick="switchAdminTab('logs')">📜 系統操作日誌 (Logs)</button>
    </div>

    <!-- 頁籤 1: 報名總表 -->
    <div id="admin-tab-dashboard">
      <h3>🛠️ 全區學校報名狀況控制台</h3>
      <button class="btn" style="background-color: #17a2b8;" onclick="loadAdminData()">🔄 重新整理資料</button>
      <div id="admin-table-container" style="overflow-x: auto; margin-top: 15px; width: 100%;">
        <p>載入全區資料中...</p>
      </div>
    </div>

    <!-- 頁籤 2: 日誌列表 -->
    <div id="admin-tab-logs" style="display: none;">
      <h3>📜 系統操作日誌紀錄 (Audit Logs)</h3>
      
      <div class="filter-bar">
        <input type="text" id="log-search-input" placeholder="🔍 搜尋學校/Email/檔名/關鍵字..." oninput="filterAndRenderLogs()" style="flex: 1; min-width: 200px;">
        
        <select id="log-action-select" onchange="filterAndRenderLogs()">
          <option value="">所有動作類型</option>
          <option value="UPLOAD">UPLOAD (上傳)</option>
          <option value="DELETE">DELETE (刪除)</option>
          <option value="REGISTER">REGISTER (註冊)</option>
          <option value="LOGIN">LOGIN (登入)</option>
        </select>

        <select id="log-sort-select" onchange="filterAndRenderLogs()">
          <option value="desc">時間：由新到舊 (最新在前)</option>
          <option value="asc">時間：由舊到新</option>
        </select>

        <button class="btn" style="background-color: #17a2b8; margin: 0;" onclick="loadAdminLogs()">🔄 重新載入</button>
      </div>

      <div id="admin-logs-container" style="overflow-x: auto; width: 100%;">
        <p>載入日誌中...</p>
      </div>
    </div>
  </div>

  <!-- 全螢幕 Loading 遮罩 -->
  <div id="loading-overlay" class="loading-overlay" style="display: none;">
    <div class="spinner-card">
      <div class="spinner-icon"></div>
      <div id="loading-overlay-text" class="loading-text">處理中，請稍候...</div>
    </div>
  </div>

  <script>
    let appState = {
      email: '',
      isLoggedIn: false,
      isRegistered: false,
      roles: [],
      schools: [],
      userRecords: [],
      currentRecord: null,
      currentMode: '',
      userFiles: {},
      adminLogsRaw: []
    };

    // 接收來自 Code.gs 的驗證 Email
    var verifiedEmail = "<?= userEmail ?>";

    window.onload = function() {
      // 將 verifiedEmail 傳給後端 initSystem
      google.script.run
        .withSuccessHandler(onInitSuccess)
        .withFailureHandler(onInitError)
        .initSystem(verifiedEmail);
    };

    function onInitSuccess(res) {
      document.getElementById('view-loading').style.display = 'none';
      appState.email = res.email || verifiedEmail;
      appState.isLoggedIn = res.isLoggedIn;
      appState.isRegistered = res.isRegistered;
      appState.roles = res.roles || [];
      appState.schools = res.schools || [];
      appState.userRecords = res.userRecords || [];

      if (!appState.email) {
        alert("無法取得您的 Google 帳號身分，請重新存取此網址。");
        return;
      }

      document.getElementById('nav-bar').style.display = 'flex';
      document.getElementById('nav-email').innerText = appState.email;

      if (!res.isRegistered) {
        showRegisterView(res.schools);
      } else {
        if (appState.roles.includes('admin') && appState.roles.includes('user')) {
          document.getElementById('btn-switch-mode').style.display = 'inline-block';
          showModeSelectView();
        } else if (appState.roles.includes('admin')) {
          switchMode('admin');
        } else {
          appState.currentRecord = appState.userRecords.find(r => r.user_type === 'user') || appState.userRecords[0];
          switchMode('user');
        }
      }
    }

    function onInitError(err) {
      document.getElementById('view-loading').innerHTML = \`<div class="error-box"><strong>❌ 系統驗證失敗！</strong><br>\${err.message}</div>\`;
    }

    function showRegisterView(schools) {
      document.getElementById('reg-email').value = appState.email;
      let select = document.getElementById('reg-school');
      select.innerHTML = '<option value="">-- 請選擇您的學校 --</option>';
      schools.forEach(s => {
        select.innerHTML += \`<option value="\${s.school_id}">\${s.school_id}. \${s.school_name}</option>\`;
      });
      document.getElementById('view-register').style.display = 'block';
    }

    function handleRegisterSubmit(e, form) {
      if (e && e.preventDefault) e.preventDefault();
      document.getElementById('reg-btn').disabled = true;
      document.getElementById('reg-status').innerHTML = '<p style="color:blue;">註冊資料處理中...</p>';

      let formData = {
        school_id: form.school_id.value,
        user_name: form.user_name.value,
        user_phone: form.user_phone.value,
        user_email: appState.email, // 傳送前端已驗證的 Email
        notes: form.notes.value
      };

      google.script.run
        .withSuccessHandler(function(res) {
          document.getElementById('reg-btn').disabled = false;
          if (res.success) {
            let schoolSelect = document.getElementById('reg-school');
            let selectedText = schoolSelect.options[schoolSelect.selectedIndex].text;
            let newUser = res.user;
            newUser.school_name = selectedText.split('. ')[1] || selectedText;
            
            appState.isRegistered = true;
            if (!appState.roles.includes('user')) appState.roles.push('user');
            appState.userRecords.push(newUser);

            alert("🎉 註冊成功！系統將帶您進入報名與檔案上傳頁面。");
            switchMode('user');
          } else {
            document.getElementById('reg-status').innerHTML = \`<div class="error-box"><strong>❌ 註冊失敗：</strong>\${res.message}</div>\`;
          }
        })
        .withFailureHandler(function(err) {
          document.getElementById('reg-btn').disabled = false;
          document.getElementById('reg-status').innerHTML = \`<div class="error-box">系統錯誤：\${err.message}</div>\`;
        })
        .registerUser(formData);
    }

    function showModeSelectView() {
      hideAllViews();
      document.getElementById('view-mode-select').style.display = 'block';
    }

    function switchMode(mode) {
      appState.currentMode = mode;
      hideAllViews();

      if (mode === 'user') {
        document.getElementById('nav-mode-badge').innerText = '一般使用者';
        document.getElementById('nav-mode-badge').style.background = '#28a745';
        document.getElementById('nav-mode-badge').style.color = 'white';
        
        let rec = appState.userRecords.find(r => r.user_type === 'user') || appState.userRecords[0];
        if (rec) {
          document.getElementById('user-school-id').value = rec.school_id;
          document.getElementById('user-id').value = rec.user_id;
          document.getElementById('user-school-name').innerText = rec.school_name + " (學校編號: " + rec.school_id + ")";
          document.getElementById('view-user-main').style.display = 'block';
          loadUserFiles(rec.user_id);
        } else {
          alert("您尚未完成一般學校代表註冊，請先填寫基本資料。");
          showRegisterView(appState.schools);
        }
      } else if (mode === 'admin') {
        document.getElementById('nav-mode-badge').innerText = '管理員控制台';
        document.getElementById('nav-mode-badge').style.background = '#0056b3';
        document.getElementById('nav-mode-badge').style.color = 'white';
        
        document.getElementById('view-admin-main').style.display = 'block';
        loadAdminData();
      }
    }

    function toggleRoleMode() {
      if (appState.currentMode === 'user') switchMode('admin');
      else switchMode('user');
    }

    function hideAllViews() {
      document.getElementById('view-register').style.display = 'none';
      document.getElementById('view-mode-select').style.display = 'none';
      document.getElementById('view-user-main').style.display = 'none';
      document.getElementById('view-admin-main').style.display = 'none';
    }

    function loadUserFiles(userId) {
      document.getElementById('file-slots-container').innerHTML = '<p>讀取歷史上傳紀錄中...</p>';
      google.script.run
        .withSuccessHandler(function(filesMap) {
          appState.userFiles = filesMap || {};
          renderFileSlots();
        })
        .withFailureHandler(function(err) {
          document.getElementById('file-slots-container').innerHTML = \`<div class="error-box">❌ 讀取紀錄失敗：\${err.message}</div>\`;
        })
        .getUserUploadedFiles(userId);
    }

    function renderFileSlots() {
      const fileSlots = [
        { key: 'file1', label: '報名表 (Excel/ODS/Word/ODT)', accept: '.xls,.xlsx,.ods,.doc,.docx,.odt' },
        { key: 'file2', label: '學校核章之報名掃描檔 (PDF/圖片/Word/ODT)', accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.odt' },
        { key: 'file3', label: '領隊之 SAFE FROM HARM 證書 (PDF/圖片/Word/ODT)', accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.odt' },
        { key: 'file4', label: '繳費收據開立表影本 (PDF/圖片/Excel/ODS/Word/ODT)', accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.odt,.xls,.xlsx,.ods' }
      ];

      let container = document.getElementById('file-slots-container');
      let html = '';
      let needUploadInput = false;

      fileSlots.forEach(slot => {
        let uploadedFile = appState.userFiles[slot.key];

        html += \`<div class="file-slot-card">\`;
        html += \`<h4>\${slot.label}</h4>\`;

        if (uploadedFile && !uploadedFile.isDead) {
          html += \`
            <div class="file-info" style="color: green; margin-bottom: 8px;">
              ✅ 已上傳：<a href="\${uploadedFile.url}" target="_blank"><strong>\${uploadedFile.name}</strong></a>
            </div>
            <button type="button" class="btn-danger" onclick="confirmDeleteFile('\${slot.key}', '\${uploadedFile.name}')">🗑️ 刪除檔案</button>
          \`;
        } 
        else if (uploadedFile && uploadedFile.isDead) {
          needUploadInput = true;
          html += \`
            <div class="file-warning" style="color: #d9534f; background-color: #fdf7f7; padding: 6px; border-radius: 4px; margin-bottom: 8px;">
              ⚠️ 舊檔案（\${uploadedFile.name}）已被刪除，請重新選擇檔案上傳。
            </div>
            <input type="file" id="input-\${slot.key}" accept="\${slot.accept}">
          \`;
        } 
        else {
          needUploadInput = true;
          html += \`
            <div class="file-info" style="color: #666; margin-bottom: 8px;">尚未上傳檔案</div>
            <input type="file" id="input-\${slot.key}" accept="\${slot.accept}">
          \`;
        }

        html += \`</div>\`;
      });

      container.innerHTML = html;

      let uploadBtn = document.getElementById('uploadBtn');
      if (uploadBtn) {
        uploadBtn.style.display = needUploadInput ? 'block' : 'none';
      }
    }

    function confirmDeleteFile(slotKey, fileName) {
      if (!confirm(\`確定要刪除檔案「\${fileName}」嗎？刪除後不可復原。\`)) {
        return;
      }

      let userId = document.getElementById('user-id').value;
      showLoadingOverlay('正在刪除檔案，請稍候...');

      google.script.run
        .withSuccessHandler(function(res) {
          hideLoadingOverlay();
          if (res.success) {
            document.getElementById('upload-status').innerHTML = \`<div class="success-box"><strong>✅ \${res.message}</strong></div>\`;
            if (res.updatedFiles) {
              appState.userFiles = res.updatedFiles;
              renderFileSlots();
            } else {
              loadUserFiles(userId);
            }
          } else {
            alert("刪除失敗：" + res.message);
          }
        })
        .withFailureHandler(function(err) {
          hideLoadingOverlay();
          alert("刪除失敗：" + err.message);
        })
        .deleteUserFile(userId, slotKey, appState.email); // 傳送已驗證的 Email
    }

    async function handleUploadSubmit() {
      try {
        let schoolId = document.getElementById('user-school-id').value;
        let userId = document.getElementById('user-id').value;

        const slotRules = {
          file1: { label: '報名表', targetName: '報名表', exts: ['xls', 'xlsx', 'ods', 'doc', 'docx', 'odt'] },
          file2: { label: '學校核章之報名掃描檔', targetName: '學校核章掃描檔', exts: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'odt'] },
          file3: { label: '領隊之 SAFE FROM HARM 證書', targetName: '領隊證書', exts: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'odt'] },
          file4: { label: '繳費收據開立表影本', targetName: '繳費收據影本', exts: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods'] }
        };

        // 1. 檢查是否有選擇檔案，並驗證副檔名與檔案大小
        let pendingFiles = [];
        for (let field in slotRules) {
          let input = document.getElementById('input-' + field);
          if (input && input.files && input.files.length > 0) {
            let file = input.files[0];
            let fileExt = file.name.split('.').pop().toLowerCase();

            if (!slotRules[field].exts.includes(fileExt)) {
              alert(\`❌ 「\${slotRules[field].label}」檔案格式不符！\\n只允許上傳：\${slotRules[field].exts.join(', ')} 格式之檔案。\`);
              return;
            }

            if (file.size > 2 * 1024 * 1024) {
              alert(\`❌ 檔案「\${file.name}」過大（超過 2MB），請壓縮後再上傳！\`);
              return;
            }

            pendingFiles.push({
              field: field,
              file: file,
              targetName: \`\${slotRules[field].targetName}.\${fileExt}\`
            });
          }
        }

        if (pendingFiles.length === 0) {
          alert("請至少選擇一個欲上傳的檔案！");
          return;
        }

        let isConfirmed = confirm("【上傳提醒】\\n檔案上傳時，系統將會依規定自動進行重新命名。\\n\\n是否確認繼續上傳？");
        if (!isConfirmed) {
          return;
        }

        showLoadingOverlay('檔案處理與上傳中，請勿關閉視窗...');

        let payload = {
          schoolId: schoolId,
          userId: userId,
          userEmail: appState.email, // 關鍵修復：帶入前端已驗證的 Email
          files: {}
        };

        for (let item of pendingFiles) {
          let base64Data = await readFileAsBase64(item.file);
          payload.files[item.field] = {
            name: item.targetName,
            data: base64Data
          };
        }

        google.script.run
          .withSuccessHandler(function(res) {
            hideLoadingOverlay();
            if (res.success) {
              document.getElementById('upload-status').innerHTML = \`<div class="success-box"><strong>✅ \${res.message}</strong></div>\`;
              if (res.updatedFiles) {
                appState.userFiles = res.updatedFiles;
                renderFileSlots();
              } else {
                loadUserFiles(userId);
              }
            } else {
              renderUploadError(res.message);
            }
          })
          .withFailureHandler(function(err) {
            hideLoadingOverlay();
            renderUploadError(err.message);
          })
          .processFormWithAuthPayload(payload);

      } catch (err) {
        hideLoadingOverlay();
        renderUploadError("檔案讀取失敗：" + err.message);
      }
    }

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });
    }

    function renderUploadError(msg) {
      document.getElementById('upload-status').innerHTML = \`
        <div class="error-box">
          <strong>❌ 上傳失敗！</strong><br>原因：\${msg}<br>
          📞 社團組聯絡電話：04-22021521#1340、1341 | 信箱：club@cloud.tcssh.tc.edu.tw
        </div>\`;
    }

    /* ---- 管理員 Tab 與 日誌邏輯 ---- */
    function switchAdminTab(tabName) {
      document.getElementById('tab-btn-dashboard').classList.remove('active');
      document.getElementById('tab-btn-logs').classList.remove('active');
      document.getElementById('admin-tab-dashboard').style.display = 'none';
      document.getElementById('admin-tab-logs').style.display = 'none';

      if (tabName === 'dashboard') {
        document.getElementById('tab-btn-dashboard').classList.add('active');
        document.getElementById('admin-tab-dashboard').style.display = 'block';
        loadAdminData();
      } else if (tabName === 'logs') {
        document.getElementById('tab-btn-logs').classList.add('active');
        document.getElementById('admin-tab-logs').style.display = 'block';
        loadAdminLogs();
      }
    }

    function loadAdminData() {
      document.getElementById('admin-table-container').innerHTML = '<p>資料加載中...</p>';
      google.script.run
        .withSuccessHandler(function(data) {
          if (!data || !Array.isArray(data)) {
            document.getElementById('admin-table-container').innerHTML = '<div class="error-box">❌ 讀取資料失敗：後端回傳資料格式不正確。</div>';
            return;
          }

          if (data.length === 0) {
            document.getElementById('admin-table-container').innerHTML = '<p style="color:gray;">目前資料庫中無學校資料。</p>';
            return;
          }

          let html = \`
            <table>
              <thead>
                <tr>
                  <th style="width: 55px;">編號</th>
                  <th style="width: 20%;">學校名稱</th>
                  <th style="width: 80px;">註冊狀態</th>
                  <th style="width: 95px;">代表姓名</th>
                  <th style="width: 120px;">聯絡電話</th>
                  <th style="width: 80px;">上傳數</th>
                  <th style="width: 35%;">檔案清單</th>
                </tr>
              </thead>
              <tbody>\`;
          
          data.forEach(item => {
            let statusBadge = item.registered 
              ? \`<span style="color:green;font-weight:bold;">已註冊</span>\` 
              : \`<span style="color:gray;">未註冊</span>\`;
            
            let fileLinks = (item.files && item.files.length > 0)
              ? item.files.map(f => \`<a href="\${f.url}" target="_blank">📄 \${f.name}</a>\`).join('<br>')
              : '-';

            html += \`
              <tr>
                <td>\${item.school_id}</td>
                <td><strong>\${item.school_name}</strong></td>
                <td>\${statusBadge}</td>
                <td>\${item.user_name}</td>
                <td>\${item.user_phone}</td>
                <td>\${item.upload_count} / 4</td>
                <td>\${fileLinks}</td>
              </tr>\`;
          });

          html += '</tbody></table>';
          document.getElementById('admin-table-container').innerHTML = html;
        })
        .withFailureHandler(function(err) {
          document.getElementById('admin-table-container').innerHTML = \`<div class="error-box">❌ 載入失敗：\${err.message}</div>\`;
        })
        .getAdminDashboardData();
    }

    function loadAdminLogs() {
      document.getElementById('admin-logs-container').innerHTML = '<p>載入系統日誌中...</p>';
      google.script.run
        .withSuccessHandler(function(logs) {
          appState.adminLogsRaw = logs;
          filterAndRenderLogs();
        })
        .getAdminLogs();
    }

    function filterAndRenderLogs() {
      let keyword = document.getElementById('log-search-input').value.toLowerCase().trim();
      let actionFilter = document.getElementById('log-action-select').value;
      let sortOrder = document.getElementById('log-sort-select').value;

      let filtered = appState.adminLogsRaw.filter(item => {
        let matchKeyword = !keyword || 
          item.schoolName.toLowerCase().includes(keyword) ||
          item.email.toLowerCase().includes(keyword) ||
          item.detail.toLowerCase().includes(keyword) ||
          item.actionType.toLowerCase().includes(keyword);
        
        let matchAction = !actionFilter || item.actionType === actionFilter;

        return matchKeyword && matchAction;
      });

      filtered.sort((a, b) => {
        if (sortOrder === 'desc') {
          return new Date(b.time) - new Date(a.time);
        } else {
          return new Date(a.time) - new Date(b.time);
        }
      });

      if (filtered.length === 0) {
        document.getElementById('admin-logs-container').innerHTML = '<p style="color:gray; padding:20px; text-align:center;">無符合條件的 Log 紀錄。</p>';
        return;
      }

      let html = \`
        <table>
          <thead>
            <tr>
              <th style="width:160px;">時間</th>
              <th style="width:100px;">動作類型</th>
              <th style="width:150px;">學校名稱</th>
              <th style="width:180px;">操作者帳號</th>
              <th>詳細紀錄內容</th>
            </tr>
          </thead>
          <tbody>\`;

      filtered.forEach(log => {
        let badgeClass = 'badge-log-' + log.actionType;
        html += \`
          <tr>
            <td style="font-size:0.85em;">\${log.time}</td>
            <td><span class="badge-log \${badgeClass}">\${log.actionType}</span></td>
            <td><strong>\${log.schoolName}</strong></td>
            <td style="font-size:0.9em; word-break:break-all;">\${log.email}<br><span style="color:gray;">(\${log.userId})</span></td>
            <td>\${log.detail}</td>
          </tr>\`;
      });

      html += '</tbody></table>';
      document.getElementById('admin-logs-container').innerHTML = html;
    }

    function showLoadingOverlay(message) {
      let overlay = document.getElementById('loading-overlay');
      let overlayText = document.getElementById('loading-overlay-text');
      if (overlayText && message) {
        overlayText.innerText = message;
      }
      if (overlay) {
        overlay.style.display = 'flex';
      }
    }

    function hideLoadingOverlay() {
      let overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.style.display = 'none';
      }
    }

    // 全域點擊排序機制
    document.addEventListener('click', function (e) {
      let th = e.target.closest('th');
      if (!th) return;

      let table = th.closest('table');
      if (!table) return;
      
      let tbody = table.querySelector('tbody');
      if (!tbody || tbody.rows.length === 0) return;

      let index = Array.from(th.parentNode.children).indexOf(th);
      let isAscending = !th.classList.contains('sort-asc');

      table.querySelectorAll('th').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
      });
      
      th.classList.add(isAscending ? 'sort-asc' : 'sort-desc');

      let rows = Array.from(tbody.querySelectorAll('tr'));

      rows.sort((rowA, rowB) => {
        let cellA = rowA.children[index] ? rowA.children[index].innerText.trim() : '';
        let cellB = rowB.children[index] ? rowB.children[index].innerText.trim() : '';

        let cleanA = cellA.replace(/,/g, '');
        let cleanB = cellB.replace(/,/g, '');
        let numA = Number(cleanA);
        let numB = Number(cleanB);
        let isNum = !isNaN(numA) && !isNaN(numB) && cellA !== '' && cellB !== '' && !cellA.includes('-') && !cellA.includes('/');

        if (isNum) {
          return isAscending ? numA - numB : numB - numA;
        }

        let dateA = Date.parse(cellA.replace(' ', 'T'));
        let dateB = Date.parse(cellB.replace(' ', 'T'));
        let isDate = !isNaN(dateA) && !isNaN(dateB) && (cellA.includes('-') || cellA.includes('/'));

        if (isDate) {
          return isAscending ? dateA - dateB : dateB - dateA;
        }

        return isAscending 
          ? cellA.localeCompare(cellB, 'zh-Hant', { numeric: true, sensitivity: 'base' })
          : cellB.localeCompare(cellA, 'zh-Hant', { numeric: true, sensitivity: 'base' });
      });

      rows.forEach(row => tbody.appendChild(row));
    });
  </script>
</body>
</html>`;

export const CODE_FIX_SUMMARY = [
  {
    title: '1. 動態 `getRedirectUri()` 網址修復',
    problem: '原本頂層定義 `const REDIRECT_URI = ScriptApp.getService().getUrl();`，在 GAS 全域載入時可能抓到空字串或與 `/exec` / `/dev` 不匹配，導致 OAuth 交換 token 失敗。',
    solution: '封裝 `getRedirectUri()` 函式，每次需要 Redirect URI 時動態調用，並自動去除非必要的 URL 查詢參數。'
  },
  {
    title: '2. 解決 OAuth 驗證重覆跳轉與 `invalid_grant` 錯誤',
    problem: 'Google 的 OAuth 2.0 `authorization_code` 僅能使用一次。使用者重新整理頁面時，舊的 `code` 會導致 Token 交換失敗 (HTTP 400)，系統會誤判為未登入並再次跳轉至授權頁。',
    solution: '引入 `CacheService.getUserCache()`，成功驗證後快取 Email 30 分鐘，重新整理頁面能直接讀取快取，避免重複認證與跳轉。'
  },
  {
    title: '3. 前端呼叫缺少 `userEmail` 參數問題',
    problem: '在 GAS 以「以我的身分執行」模式運作時，前端呼叫 `processFormWithAuthPayload` 與 `deleteUserFile` 未傳送 `userEmail`，導致 `Session.getActiveUser().getEmail()` 傳回空字串，日誌與資料寫入丟失使用者 Email。',
    solution: '在前端 JS 中，將 `verifiedEmail` (當前驗證的 Email) 附帶在 `payload.userEmail` 以及 `deleteUserFile` 的參數中，確保後端寫入紀錄與檔案上傳時必定擁有正確的 Email。'
  },
  {
    title: '4. OAuth 權限 Scope 補齊',
    problem: 'OAuth 授權 Scope 原先寫為 `email%20profile`，部分 GCP 控制台專案會拒絕解析簡寫。',
    solution: '調整為完整 Scope URI：`https://www.googleapis.com/auth/userinfo.email openid profile`，並在請求 userInfo 時使用相容性最佳的 API 端點。'
  }
];
