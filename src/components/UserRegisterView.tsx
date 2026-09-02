import React, { useState, useEffect, useRef } from 'react';
import { UserCheck, School, Phone, User, FileText, ShieldAlert, CheckCircle, AlertCircle, Search, ChevronDown, X } from 'lucide-react';
import { SCHOOLS } from '../data/schools';
import { isSchoolRegistered, registerUser } from '../services/storageService';
import { validatePhoneFormat, sanitizeInput } from '../lib/security';

interface UserRegisterViewProps {
  userEmail: string;
  onSuccessRegister: () => void;
  onSwitchAccount: () => void;
}

export const UserRegisterView: React.FC<UserRegisterViewProps> = ({
  userEmail,
  onSuccessRegister,
  onSwitchAccount,
}) => {
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const emailParts = userEmail.split('@');
  const domain = emailParts.length > 1 ? emailParts[1].toLowerCase() : '';
  const isEduEmail = domain.includes('.edu');

  const selectedSchool = SCHOOLS.find(s => s.school_id === selectedSchoolId);

  const handleInputChange = (val: string) => {
    setSearchQuery(val);
    setIsOpen(true);
    if (!val) {
      setSelectedSchoolId('');
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (selectedSchool) {
      setSearchQuery(selectedSchool.school_name);
    } else {
      setSearchQuery('');
    }
  };

  const filteredSchools = SCHOOLS.filter(school => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      school.school_name.toLowerCase().includes(query) ||
      school.school_id.includes(query)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isEduEmail) {
      setErrorMsg('非教育雲端帳號，系統已限制註冊。請切換至具有 .edu 網域的學校教育帳號再試！');
      return;
    }

    if (!selectedSchoolId) {
      setErrorMsg('請先選擇您代表的學校！');
      return;
    }

    // Clean and Sanitize Inputs for security (XSS protection)
    const sanitizedName = sanitizeInput(userName);
    const sanitizedPhone = sanitizeInput(userPhone);
    const sanitizedNotes = sanitizeInput(notes);

    if (!sanitizedName) {
      setErrorMsg('請填寫代表姓名或職稱！且不得包含 HTML 標籤。');
      return;
    }
    if (!sanitizedPhone) {
      setErrorMsg('請填寫聯絡電話！');
      return;
    }

    // Phone Format Validation (Taiwan landline/mobile)
    if (!validatePhoneFormat(sanitizedPhone)) {
      setErrorMsg('聯絡電話格式不正確！必須是有效的台灣手機 (如：0912-345678) 或市話 (如：04-22021521)，可含分機，且長度合理。');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await registerUser({
        email: userEmail,
        user_name: sanitizedName,
        school_id: selectedSchoolId,
        user_phone: sanitizedPhone,
        notes: sanitizedNotes,
      });

      if (!res.success) {
        setErrorMsg(res.message);
      } else {
        onSuccessRegister();
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMsg('註冊失敗：' + (err?.message || '未知錯誤，請稍後再試！'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Banner */}
        {isEduEmail ? (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white p-6 sm:p-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
                  <UserCheck className="w-7 h-7 text-emerald-200" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/30 text-emerald-100 border border-emerald-300/30">
                    教育帳號驗證通過 (.edu)
                  </span>
                  <h2 className="text-2xl font-black mt-1 tracking-tight">學校代表帳號註冊</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={onSwitchAccount}
                className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg border border-white/20 transition-all cursor-pointer"
              >
                切換 Google 帳號
              </button>
            </div>
            <p className="text-emerald-50 text-xs sm:text-sm mt-3 opacity-90 leading-relaxed">
              歡迎使用！您的 Google 教育帳號 (<span className="font-bold underline underline-offset-2">{userEmail}</span>) 已完成身分驗證。請填寫下方代表學校的基本資訊以開通報名權限。
            </p>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-6 sm:p-8 border-b border-rose-900/40">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 backdrop-blur-md flex items-center justify-center border border-rose-400/30 shadow-inner">
                  <ShieldAlert className="w-7 h-7 text-rose-300" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/30 text-rose-200 border border-rose-400/30">
                    非學校教育帳號 (未具註冊資格)
                  </span>
                  <h2 className="text-2xl font-black mt-1 tracking-tight text-white">學校代表身分限制</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={onSwitchAccount}
                className="text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-lg border border-rose-400/30 transition-all shadow cursor-pointer flex items-center space-x-1"
              >
                <span>切換學校教育帳號</span>
              </button>
            </div>
            <p className="text-rose-100 text-xs sm:text-sm mt-3 opacity-90 leading-relaxed">
              您的 Google 帳號 (<span className="font-bold underline underline-offset-2 text-white">{userEmail}</span>) 已驗證成功，但因非屬學校教育機構網域 (<span className="font-bold text-rose-200">.edu</span>)，無法註冊為學校代表。請切換為學校公務或教育雲端信箱。
            </p>
          </div>
        )}

        {/* Notice Card for Valid Education Emails */}
        {isEduEmail && (
          <div className="p-6 bg-amber-50/70 border-b border-amber-200/60 flex items-start space-x-3 text-amber-900 text-xs leading-relaxed">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">註冊限制與注意事項：</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-800">
                <li>一間學校原則上只允許一組 Google 帳號進行註冊代表（臺中二中承辦單位除外）。</li>
                <li>註冊完成後，系統將自動綁定您的 Google 帳號與學校代表權限，以便於此專區上傳並管理報名文件。</li>
              </ul>
            </div>
          </div>
        )}

        {/* Form Body or Error Restriction */}
        {!isEduEmail ? (
          <div className="p-8 sm:p-10 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center border border-rose-100 mx-auto animate-bounce">
              <ShieldAlert className="w-8 h-8 text-rose-500" />
            </div>
            
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-black text-slate-800">學校代表身分限制 (限用教育雲端帳號)</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                大會系統為確保各校資料真實性與資安防護，本系統僅開放使用含有 <span className="font-bold text-slate-700">.edu</span> 組織網域的教育機構帳號進行代表註冊。
              </p>
            </div>

            <div className="p-5 bg-rose-50/70 border border-rose-200/60 rounded-2xl max-w-lg mx-auto text-left space-y-3">
              <div className="flex items-start space-x-2 text-rose-900 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">您的目前帳號：</p>
                  <p className="font-mono bg-white px-2 py-0.5 rounded border border-rose-100 text-rose-700 mt-1 break-all">{userEmail}</p>
                </div>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                💡 <span className="font-bold">允許的教育帳號類型包括：</span>
                <br />
                • 教育部教育雲端帳號 (<code className="bg-rose-100/50 px-1.5 py-0.5 rounded font-bold text-rose-700 font-mono">@mail.edu.tw</code>)
                <br />
                • 臺中市教育局 Google 帳號 (<code className="bg-rose-100/50 px-1.5 py-0.5 rounded font-bold text-rose-700 font-mono">@tc.edu.tw</code>)
                <br />
                • 各高國中之學校教育機構帳號 (如 <code className="bg-rose-100/50 px-1.5 py-0.5 rounded font-bold text-rose-700 font-mono">@*.edu.tw</code> 或 <code className="bg-rose-100/50 px-1.5 py-0.5 rounded font-bold text-rose-700 font-mono">@*.edu</code>)
              </p>
            </div>

            <div className="pt-4 max-w-sm mx-auto">
              <button
                type="button"
                onClick={onSwitchAccount}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/10 hover:shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>切換 Google 學校教育帳號再試</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {errorMsg && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-3 text-rose-700 text-sm font-medium animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

          {/* School Selection */}
          <div className="relative" ref={dropdownRef}>
            <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-2">
              <School className="w-4 h-4 text-emerald-600" />
              <span>代表學校名稱 (全區 55 所高國中) <span className="text-rose-500">*</span></span>
            </label>
            
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="輸入關鍵字搜尋，例如：二中、西苑、衛道..."
                value={isOpen ? searchQuery : (selectedSchool ? selectedSchool.school_name : '')}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={handleInputFocus}
                className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all cursor-text placeholder:text-slate-400"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 space-x-1.5">
                {(selectedSchoolId || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSchoolId('');
                      setSearchQuery('');
                      setErrorMsg('');
                    }}
                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-full transition-all cursor-pointer"
                    title="清除選擇"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(!isOpen)}
                  className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-full transition-all cursor-pointer"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Dropdown Options */}
            {isOpen && (
              <div className="absolute left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl z-30 divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150 scrollbar-thin">
                {filteredSchools.length > 0 ? (
                  filteredSchools.map((school) => {
                    const status = isSchoolRegistered(school.school_id);
                    const isDisabled = status.registered && school.school_id !== '55';
                    const isSelected = school.school_id === selectedSchoolId;

                    return (
                      <button
                        key={school.school_id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          setSelectedSchoolId(school.school_id);
                          setSearchQuery(school.school_name);
                          setIsOpen(false);
                          setErrorMsg('');
                        }}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between text-sm transition-all ${
                          isDisabled
                            ? 'bg-slate-50/70 text-slate-400 cursor-not-allowed opacity-80'
                            : isSelected
                            ? 'bg-emerald-50/80 text-emerald-950 font-bold'
                            : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                            isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {school.school_id}
                          </span>
                          <span>{school.school_name}</span>
                        </div>

                        {isDisabled ? (
                          <span className="text-xs font-bold text-rose-500 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center space-x-1 flex-shrink-0">
                            <span>已有註冊</span>
                          </span>
                        ) : isSelected ? (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center space-x-1 flex-shrink-0">
                            <span>已選擇</span>
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-slate-400 text-xs font-medium">
                    🔍 查無符合的學校名稱
                  </div>
                )}
              </div>
            )}
            
            <p className="text-[11px] text-slate-500 mt-1.5">
              若選單中顯示為「已有註冊」，表示該校已有代表完成註冊。如有資料異動或任何帳號問題，請聯繫二中社團組管理員。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* User Name */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-2">
                <User className="w-4 h-4 text-emerald-600" />
                <span>代表姓名 / 職稱 <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={40}
                placeholder="例如：王小明 老師 / 童軍團長"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* User Phone */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>聯絡電話 / 手機 <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                value={userPhone}
                onChange={(e) => {
                  // Restrict to digits and basic symbols (-, #, +, space, parens)
                  const sanitized = e.target.value.replace(/[^0-9\-#\s\+\(\)]/g, '');
                  setUserPhone(sanitized);
                }}
                maxLength={30}
                placeholder="例如：0912-345678 或 04-22021521#123"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                ⚠️ <span className="font-semibold text-slate-600">格式說明：</span>電話只可輸入半形數字、<code>-</code>、<code>+</code>、<code>#</code> (分機) 及括號。手機如 <code>09xxxxxxxx</code>，市話請帶區碼 (如 <code>04-xxxxxxx</code>)。
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>備註資訊 (選填)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="例如：童軍團帶隊組、車號、飲食特殊需求等"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{isSubmitting ? '處理中...' : '確認提交註冊並開通系統'}</span>
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
