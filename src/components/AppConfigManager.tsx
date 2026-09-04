import React, { useState, useEffect } from 'react';
import {
  Download, Upload, Plus, Trash2, Save, RotateCcw, FileText, CheckCircle, AlertCircle,
  ExternalLink, HelpCircle, Calendar, Clock, Lock, Unlock, ShieldAlert, Phone, ShieldCheck
} from 'lucide-react';
import { TemplateItemConfig, UploadSlotConfig, RegistrationPeriodConfig } from '../types';
import {
  getTemplateItems, saveTemplateItems, DEFAULT_TEMPLATE_ITEMS,
  getUploadSlots, saveUploadSlots, DEFAULT_UPLOAD_SLOTS,
  getRegistrationPeriod, saveRegistrationPeriod, DEFAULT_REGISTRATION_PERIOD,
  checkRegistrationPeriodStatus, formatDisplayDateTime, parseTaiwanDateTime,
  deriveDownloadUrl, subscribeDataChanges
} from '../services/storageService';

interface AppConfigManagerProps {
  currentAdminEmail?: string;
}

export const AppConfigManager: React.FC<AppConfigManagerProps> = ({ currentAdminEmail }) => {
  const [period, setPeriod] = useState<RegistrationPeriodConfig>(getRegistrationPeriod());
  const [templates, setTemplates] = useState<TemplateItemConfig[]>(getTemplateItems());
  const [slots, setSlots] = useState<UploadSlotConfig[]>(getUploadSlots());
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'period' | 'templates' | 'slots'>('period');

  useEffect(() => {
    setPeriod(getRegistrationPeriod());
    setTemplates(getTemplateItems());
    setSlots(getUploadSlots());
    const unsub = subscribeDataChanges(() => {
      setPeriod(getRegistrationPeriod());
      setTemplates(getTemplateItems());
      setSlots(getUploadSlots());
    });
    return () => unsub();
  }, []);

  const [isSavingPeriod, setIsSavingPeriod] = useState(false);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [isSavingSlots, setIsSavingSlots] = useState(false);

  // Auto clear message after 6 seconds
  useEffect(() => {
    if (msg) {
      const timer = setTimeout(() => {
        setMsg(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [msg]);

  // Current period status evaluation
  const periodStatus = checkRegistrationPeriodStatus(period);

  // --- Registration Period Handler ---
  const handlePeriodChange = (field: keyof RegistrationPeriodConfig, value: any) => {
    setPeriod(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSavePeriod = async () => {
    setMsg(null);
    if (period.enabled) {
      if (period.startDate && period.endDate) {
        const start = parseTaiwanDateTime(period.startDate);
        const end = parseTaiwanDateTime(period.endDate);
        if (start !== null && end !== null && start > end) {
          setMsg({ type: 'error', text: '「報名開放開始時間」不能晚於「報名截止時間」，請檢查設定！' });
          return;
        }
      }
    }

    setIsSavingPeriod(true);
    try {
      const res = await saveRegistrationPeriod(period, currentAdminEmail);
      if (res.success) {
        setMsg({ type: 'success', text: res.message });
      } else {
        setMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: '儲存時發生錯誤：' + (err as Error).message });
    } finally {
      setIsSavingPeriod(false);
    }
  };

  const handleResetPeriod = () => {
    if (window.confirm('確定要將報名期程設定還原為預設值嗎？（將關閉時間限制並還原預設提示文案）')) {
      setPeriod(DEFAULT_REGISTRATION_PERIOD);
    }
  };

  // --- Templates Handler ---
  const handleTemplateChange = (index: number, field: keyof TemplateItemConfig, value: string) => {
    const updated = [...templates];
    updated[index] = { ...updated[index], [field]: value };
    // Auto derive downloadUrl if URL changes
    if (field === 'url') {
      updated[index].downloadUrl = deriveDownloadUrl(value, updated[index].fileType);
    }
    setTemplates(updated);
  };

  const handleAddTemplate = () => {
    const newId = `tpl_${Date.now()}`;
    setTemplates([
      ...templates,
      {
        id: newId,
        title: '新範本檔案',
        description: '請輸入說明文字...',
        url: '',
        downloadUrl: '',
        fileType: 'pdf',
      },
    ]);
  };

  const handleRemoveTemplate = (index: number) => {
    if (templates.length <= 1) {
      alert('至少需要保留一個範本下載項目！');
      return;
    }
    setTemplates(templates.filter((_, i) => i !== index));
  };

  const handleResetTemplates = () => {
    if (window.confirm('確定要還原為系統預設的「Excel 報名表」與「Word 繳費證明」範本檔嗎？')) {
      setTemplates(DEFAULT_TEMPLATE_ITEMS);
    }
  };

  const handleSaveTemplates = async () => {
    setMsg(null);
    // Validate
    for (const tpl of templates) {
      if (!tpl.title.trim()) {
        setMsg({ type: 'error', text: '範本檔顯示名稱不能為空！' });
        return;
      }
    }
    setIsSavingTemplates(true);
    try {
      const res = await saveTemplateItems(templates);
      if (res.success) {
        setMsg({ type: 'success', text: res.message });
      } else {
        setMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: '儲存時發生錯誤：' + (err as Error).message });
    } finally {
      setIsSavingTemplates(false);
    }
  };

  // --- Slots Handler ---
  const handleSlotChange = (index: number, field: keyof UploadSlotConfig, value: string) => {
    const updated = [...slots];
    if (field === 'accept') {
      // derive exts array from accept string (e.g., ".pdf,.docx" -> ["pdf", "docx"])
      const exts = value
        .split(',')
        .map(e => e.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean);
      updated[index] = { ...updated[index], accept: value, exts };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSlots(updated);
  };

  const handleAddSlot = () => {
    const newKey = `slot_${Date.now().toString(36)}`;
    setSlots([
      ...slots,
      {
        key: newKey,
        label: `${slots.length + 1}. 新增表件項目`,
        accept: '.pdf,.png,.jpg,.jpeg',
        targetName: '新增表件',
        exts: ['pdf', 'png', 'jpg', 'jpeg'],
        description: '請輸入此表件的上傳說明與規格要求...',
      },
    ]);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) {
      alert('至少需要保留一個上傳表件項目！');
      return;
    }
    if (window.confirm(`確定要刪除「${slots[index].label}」上傳項目嗎？`)) {
      setSlots(slots.filter((_, i) => i !== index));
    }
  };

  const handleResetSlots = () => {
    if (window.confirm('確定要還原為系統預設的 4 個上傳表件（報名表、核章掃描檔、研習證書、收據影本）嗎？')) {
      setSlots(DEFAULT_UPLOAD_SLOTS);
    }
  };

  const handleSaveSlots = async () => {
    setMsg(null);
    for (const s of slots) {
      if (!s.label.trim() || !s.targetName.trim()) {
        setMsg({ type: 'error', text: '上傳表件的項目名稱與目標檔名不能為空！' });
        return;
      }
    }
    setIsSavingSlots(true);
    try {
      const res = await saveUploadSlots(slots);
      if (res.success) {
        setMsg({ type: 'success', text: res.message });
      } else {
        setMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: '儲存時發生錯誤：' + (err as Error).message });
    } finally {
      setIsSavingSlots(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Header */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl p-6 shadow-lg border border-emerald-700/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold flex items-center space-x-2">
              <FileText className="w-6 h-6 text-emerald-300" />
              <span>報名範本檔與上傳表件動態設定</span>
            </h3>
            <p className="text-xs text-emerald-100/90 mt-1">
              管理者可在自由增修或調整「下載範本檔」與「學校上傳表件」的名稱、說明、格式限制與雲端連結。設定完成後將即時同步給全體學校代表！
            </p>
          </div>

          <div className="flex bg-emerald-950/60 p-1 rounded-xl border border-emerald-700/80 self-start sm:self-auto flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('period')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'period'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>報名期程與時間限制</span>
              {period.enabled ? (
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  periodStatus.status === 'OPEN'
                    ? 'bg-emerald-200 text-emerald-900'
                    : periodStatus.status === 'NOT_STARTED'
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-rose-200 text-rose-900'
                }`}>
                  {periodStatus.status === 'OPEN' ? '開放中' : periodStatus.status === 'NOT_STARTED' ? '未開始' : '已截止'}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-700 text-slate-300">
                  自由開放
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'templates'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>1. 下載範本檔 ({templates.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('slots')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'slots'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>2. 上傳表件項目 ({slots.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {msg && (
        <div className="fixed top-6 right-6 z-50 max-w-md animate-in slide-in-from-top-5 duration-300">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-center justify-between space-x-3 text-sm font-bold backdrop-blur-md ${
              msg.type === 'success'
                ? 'bg-emerald-900/95 border-emerald-500 text-white'
                : 'bg-rose-900/95 border-rose-500 text-white'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {msg.type === 'success' ? (
                <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0 animate-bounce" />
              ) : (
                <AlertCircle className="w-6 h-6 text-rose-400 flex-shrink-0" />
              )}
              <span>{msg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setMsg(null)}
              className="text-xs opacity-70 hover:opacity-100 ml-2 px-2 py-1 bg-white/10 rounded-lg cursor-pointer"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Alert Messages (Inline) */}
      {msg && (
        <div
          className={`p-4 rounded-xl border flex items-center space-x-3 text-sm font-medium animate-in fade-in ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* TAB 0: REGISTRATION PERIOD & LOCKOUT SETTINGS */}
      {activeTab === 'period' && (
        <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200 space-y-6">
          
          {/* Header & Description */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h4 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                <span>報名系統開放期間與中央鎖定限制設定</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                設定學校代表可看到報名系統的起訖時間。未達時間前中央顯示「報名尚未開始」；超過時間則顯示「報名已截止」。管理者將自動擁有免受限制權限。
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetPeriod}
              className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all flex items-center space-x-1 cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>還原預設值</span>
            </button>
          </div>

          {/* Current Real-time Status Card */}
          <div className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
            !period.enabled
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : periodStatus.status === 'OPEN'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : periodStatus.status === 'NOT_STARTED'
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-rose-50/80 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-start space-x-3.5">
              <div className={`p-2.5 rounded-xl text-white shadow-sm flex-shrink-0 ${
                !period.enabled
                  ? 'bg-slate-600'
                  : periodStatus.status === 'OPEN'
                  ? 'bg-emerald-600'
                  : periodStatus.status === 'NOT_STARTED'
                  ? 'bg-amber-600'
                  : 'bg-rose-600'
              }`}>
                {!period.enabled ? (
                  <Unlock className="w-6 h-6" />
                ) : periodStatus.status === 'OPEN' ? (
                  <CheckCircle className="w-6 h-6" />
                ) : periodStatus.status === 'NOT_STARTED' ? (
                  <Clock className="w-6 h-6" />
                ) : (
                  <Lock className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                    目前系統狀態評估：
                  </span>
                  <span className="text-sm font-black px-2 py-0.5 rounded-full bg-white/70 shadow-sm border border-black/5">
                    {!period.enabled
                      ? '全時段自由開放 (未啟用限制)'
                      : periodStatus.status === 'OPEN'
                      ? '🟢 報名系統開放中 (正常運作)'
                      : periodStatus.status === 'NOT_STARTED'
                      ? '🟡 報名尚未開始 (已全域鎖定)'
                      : '🔴 報名已截止收件 (已全域鎖定)'}
                  </span>
                </div>
                <p className="text-xs mt-1.5 opacity-90 leading-relaxed">
                  {!period.enabled
                    ? '所有持有連結的學校代表均可進入系統瀏覽與上傳表件（適用於系統初測或演練）。'
                    : periodStatus.status === 'OPEN'
                    ? `學校代表可正常進入。開放開始時間：${periodStatus.startDateFormatted || '即刻'}，截止收件時間：${periodStatus.endDateFormatted || '無截止時間'}。`
                    : periodStatus.status === 'NOT_STARTED'
                    ? `預計開放時間為：【${periodStatus.startDateFormatted || '尚未指定'}】，學校代表進入時畫面中央將顯示「報名尚未開始」。`
                    : `已於【${periodStatus.endDateFormatted || '未知時間'}】截止收件，學校代表進入時畫面中央將顯示「報名已截止」。`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs font-semibold px-3 py-1.5 bg-white/60 rounded-xl border border-black/5 self-start md:self-center">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>大會管理員享有不受限制存取權限</span>
            </div>
          </div>

          {/* Form Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            {/* Master Toggle */}
            <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-sm font-bold text-slate-800 flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={period.enabled}
                    onChange={(e) => handlePeriodChange('enabled', e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>啟用「報名起訖時間限制」與中央鎖定機制</span>
                </label>
                <p className="text-xs text-slate-500 ml-6 mt-0.5">
                  勾選後，系統將強制根據下方設定的起訖時間判定是否開放前台；若取消勾選，則為無時間限制的全天候開放。
                </p>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  period.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {period.enabled ? '限制模式已啟動' : '限制模式已關閉'}
                </span>
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>報名開放開始時間 (Start Time)</span>
                </label>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('startDate', '')}
                  className="text-[11px] text-slate-500 hover:text-rose-600 underline cursor-pointer"
                >
                  清空無限制
                </button>
              </div>
              <input
                type="datetime-local"
                value={period.startDate || ''}
                onChange={(e) => handlePeriodChange('startDate', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>{period.startDate ? formatDisplayDateTime(period.startDate) : '（未設定開始限制，立即開放）'}</span>
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const str = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      handlePeriodChange('startDate', str);
                    }}
                    className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 cursor-pointer"
                  >
                    設為現在
                  </button>
                </div>
              </div>
            </div>

            {/* End Date */}
            <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-rose-600" />
                  <span>報名截止收件時間 (End Time)</span>
                </label>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('endDate', '')}
                  className="text-[11px] text-slate-500 hover:text-rose-600 underline cursor-pointer"
                >
                  清空無限制
                </button>
              </div>
              <input
                type="datetime-local"
                value={period.endDate || ''}
                onChange={(e) => handlePeriodChange('endDate', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>{period.endDate ? formatDisplayDateTime(period.endDate) : '（未設定截止限制，不限期收件）'}</span>
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => {
                      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                      future.setHours(17, 0, 0, 0);
                      const str = new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      handlePeriodChange('endDate', str);
                    }}
                    className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 cursor-pointer"
                  >
                    7天後 17:00
                  </button>
                </div>
              </div>
            </div>

            {/* Before Start Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                <span>「報名尚未開始」畫面中央補充說明文字：</span>
              </label>
              <textarea
                rows={2}
                value={period.beforeStartMessage || ''}
                onChange={(e) => handlePeriodChange('beforeStartMessage', e.target.value)}
                placeholder="例如：報名作業尚未開始，請於開放時間內再次前往系統報名。"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[11px] text-slate-400">當學校代表在開始時間之前進入時顯示。</p>
            </div>

            {/* After End Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                <span>「報名已截止」畫面中央補充說明文字：</span>
              </label>
              <textarea
                rows={2}
                value={period.afterEndMessage || ''}
                onChange={(e) => handlePeriodChange('afterEndMessage', e.target.value)}
                placeholder="例如：第41屆行義蘭姐童軍專科考驗暨聯團露營報名已截止收件，若有補件或異動需求，請洽大會主辦單位。"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[11px] text-slate-400">當學校代表在截止時間之後進入時顯示。</p>
            </div>

            {/* Contact Info */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>大會主辦單位聯絡資訊（顯示於未開始 / 已截止中央畫面的底部）：</span>
              </label>
              <textarea
                rows={2}
                value={period.contactInfo || ''}
                onChange={(e) => handlePeriodChange('contactInfo', e.target.value)}
                placeholder="主辦學校：臺中市立臺中第二高級中等學校 學務處社團活動組&#10;電話：04-22021521 分機 1340、1341 | 信箱：club@cloud.tcssh.tc.edu.tw"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
              />
            </div>

          </div>

          {/* Save Action Banner */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>儲存變更將即時同步至雲端資料庫，並自動記錄至管理員「操作日誌 (Audit Log)」。</span>
            </div>

            <button
              type="button"
              disabled={isSavingPeriod}
              onClick={handleSavePeriod}
              className={`px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer ${
                isSavingPeriod ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              <Save className={`w-4 h-4 ${isSavingPeriod ? 'animate-spin' : ''}`} />
              <span>{isSavingPeriod ? '同步儲存中...' : '儲存並同步「報名起訖時間」設定'}</span>
            </button>
          </div>

        </div>
      )}

      {/* TAB 1: TEMPLATES SETTINGS */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h4 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Download className="w-5 h-5 text-emerald-600" />
                <span>設定學校代表頁面的「報名表與範本檔下載」清單</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                貼入 Google Sheets / Docs 或 Google Drive 分享連結，系統會自動轉換為點擊後直接下載 Excel / Word 檔的預設網址！
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetTemplates}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
                title="恢復為預設的 Excel 與 Word 範本檔"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>還原預設</span>
              </button>
              <button
                type="button"
                onClick={handleAddTemplate}
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>新增範本檔</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {templates.map((tpl, idx) => {
              const derivedLink = deriveDownloadUrl(tpl.url, tpl.fileType);
              return (
                <div
                  key={tpl.id}
                  className="p-5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl space-y-4 transition-all"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <span className="text-xs font-bold text-slate-800 bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg">
                      範本檔 #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTemplate(idx)}
                      className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-rose-200 font-bold transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>刪除此範本</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        顯示名稱 (Title) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={tpl.title}
                        onChange={(e) => handleTemplateChange(idx, 'title', e.target.value)}
                        placeholder="例如：報名表 (Excel 範本)"
                        className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        副檔名類型 (Format)
                      </label>
                      <select
                        value={tpl.fileType || 'xlsx'}
                        onChange={(e) => handleTemplateChange(idx, 'fileType', e.target.value)}
                        className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-slate-700"
                      >
                        <option value="xlsx">Excel 試算表 (.xlsx)</option>
                        <option value="docx">Word 文件 (.docx)</option>
                        <option value="pdf">PDF 文件 (.pdf)</option>
                        <option value="other">其他 / 一般雲端檔案</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        說明提示文字 (Description)
                      </label>
                      <input
                        type="text"
                        value={tpl.description}
                        onChange={(e) => handleTemplateChange(idx, 'description', e.target.value)}
                        placeholder="例如：點擊下方按鈕自動下載 .xlsx 試算表檔並於電腦編輯填寫"
                        className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Google 文件/雲端連結 (Google Drive / Docs / Sheets Sharing URL)
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={tpl.url}
                          onChange={(e) => handleTemplateChange(idx, 'url', e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/1YlbAMCysWygLlzVeCeNxyYogkrGV85X6/edit?usp=sharing"
                          className="flex-1 px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-slate-700"
                        />
                        {tpl.url && (
                          <a
                            href={tpl.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1 whitespace-nowrap"
                            title="測試連結"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>測試開啓</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Automatic Export Download Link Info */}
                  <div className="p-3 bg-emerald-50/70 rounded-xl text-[11px] text-emerald-900 border border-emerald-200/80 flex items-start space-x-2">
                    <HelpCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">自動計算之直接下載網址：</span>
                      <code className="block mt-0.5 text-slate-800 font-mono break-all bg-white px-2 py-1 rounded border border-emerald-200">
                        {derivedLink || '尚未輸入 Google 連結'}
                      </code>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inline alert next to save button */}
          {msg && (
            <div
              className={`p-3 rounded-xl border flex items-center space-x-2 text-xs font-bold animate-in fade-in ${
                msg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              {msg.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500 font-medium">
              點擊儲存後，將同步更新全體學校代表可看見之下載範本檔案
            </div>
            <button
              type="button"
              disabled={isSavingTemplates}
              onClick={handleSaveTemplates}
              className={`px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer ${
                isSavingTemplates ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              <Save className={`w-4 h-4 ${isSavingTemplates ? 'animate-spin' : ''}`} />
              <span>{isSavingTemplates ? '儲存中...' : '儲存並發布「下載範本檔」設定'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: UPLOAD SLOTS SETTINGS */}
      {activeTab === 'slots' && (
        <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h4 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <span>設定學校代表「上傳檔案表件」項目與格式限制</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                管理者可設定各項目名稱、說明、允許選擇的檔案副檔名（以逗號分隔，如 <code className="font-mono bg-slate-100 px-1 rounded">.pdf,.xlsx,.png</code>）及系統重命名關鍵字。
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetSlots}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
                title="恢復為預設的 4 個表件項目"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>還原預設</span>
              </button>
              <button
                type="button"
                onClick={handleAddSlot}
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>新增表件項目</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {slots.map((slot, idx) => (
              <div
                key={slot.key}
                className="p-5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl space-y-4 transition-all"
              >
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold bg-indigo-100 text-indigo-900 px-2.5 py-1 rounded-lg">
                      表件項目 #{idx + 1}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      key: {slot.key}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(idx)}
                    className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-rose-200 font-bold transition-all flex items-center space-x-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>刪除此項目</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      顯示項目標題 (Label) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={slot.label}
                      onChange={(e) => handleSlotChange(idx, 'label', e.target.value)}
                      placeholder="例如：1. 報名表 (Excel / PDF)"
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      檔案檔名重命名標籤 (Target Name) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={slot.targetName}
                      onChange={(e) => handleSlotChange(idx, 'targetName', e.target.value)}
                      placeholder="例如：報名表"
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      實際存檔時將自動重命名為：<span className="font-mono text-slate-700 bg-slate-100 px-1 rounded">[編號]_[學校名]_{slot.targetName || '目標'}.[副檔名]</span>
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      檔案格式副檔名限制 (Accept Extensions)
                    </label>
                    <input
                      type="text"
                      value={slot.accept}
                      onChange={(e) => handleSlotChange(idx, 'accept', e.target.value)}
                      placeholder="以逗號分隔，例如：.pdf,.xls,.xlsx,.csv,.ods"
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-slate-800"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      允許選擇之副檔名清單：{slot.exts.map(e => <span key={e} className="mr-1 inline-block px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-mono text-[10px]">.{e}</span>)}
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      上傳注意事項說明 (Description)
                    </label>
                    <textarea
                      rows={2}
                      value={slot.description}
                      onChange={(e) => handleSlotChange(idx, 'description', e.target.value)}
                      placeholder="請輸入給學校代表看的上傳說明與規定..."
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Inline alert next to save button */}
          {msg && (
            <div
              className={`p-3 rounded-xl border flex items-center space-x-2 text-xs font-bold animate-in fade-in ${
                msg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              {msg.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500 font-medium">
              點擊儲存後，將同步更新學校代表上傳表件欄位與格式規範
            </div>
            <button
              type="button"
              disabled={isSavingSlots}
              onClick={handleSaveSlots}
              className={`px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer ${
                isSavingSlots ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              <Save className={`w-4 h-4 ${isSavingSlots ? 'animate-spin' : ''}`} />
              <span>{isSavingSlots ? '儲存中...' : '儲存並發布「上傳表件項目」設定'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
