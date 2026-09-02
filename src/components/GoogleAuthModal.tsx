import React, { useState } from 'react';
import { UserCheck, ShieldCheck, School, ArrowRight, X, Mail, LogOut, Lock, ExternalLink, AlertCircle } from 'lucide-react';
import { loginWithGooglePopup, logoutGoogleAuth } from '../lib/firebase';

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmail: string;
  onSelectEmail: (email: string) => void;
}

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  isOpen,
  onClose,
  currentEmail,
  onSelectEmail,
}) => {
  const [authError, setAuthError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleGooglePopupLogin = async () => {
    setIsVerifying(true);
    setAuthError('');

    try {
      const googleEmail = await loginWithGooglePopup();
      setIsVerifying(false);
      onSelectEmail(googleEmail);
      onClose();
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      setIsVerifying(false);
      
      const msg = err?.message || String(err);
      const code = err?.code || '';
      if (msg.includes('popup-closed-by-user') || code === 'auth/popup-closed-by-user') {
        setAuthError('已取消登入視窗。');
      } else if (msg.includes('popup-blocked') || code === 'auth/popup-blocked') {
        setAuthError('popup-blocked');
      } else {
        setAuthError(`Google 授權驗證失敗：${msg}`);
      }
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setIsVerifying(true);
    setAuthError('');
    try {
      // Sign out current cached session
      await logoutGoogleAuth();
    } catch (e) {
      console.warn('Sign out before switch warning:', e);
    }
    // Now trigger popup with prompt: select_account
    try {
      const googleEmail = await loginWithGooglePopup();
      setIsVerifying(false);
      onSelectEmail(googleEmail);
      onClose();
    } catch (err: any) {
      console.error('Google Switch Account Error:', err);
      setIsVerifying(false);
      const msg = err?.message || String(err);
      const code = err?.code || '';
      if (msg.includes('popup-closed-by-user') || code === 'auth/popup-closed-by-user') {
        setAuthError('已取消切換帳號視窗。');
      } else if (msg.includes('popup-blocked') || code === 'auth/popup-blocked') {
        setAuthError('popup-blocked');
      } else {
        setAuthError(`Google 授權驗證失敗：${msg}`);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutGoogleAuth();
    } catch (e) {
      console.error('Logout error', e);
    }
    onSelectEmail('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 text-white p-6 relative flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-emerald-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Lock className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Google 身分安全驗證</h3>
              <p className="text-xs text-emerald-200">真實 Google 帳號 OAuth 認證機制</p>
            </div>
          </div>
          <p className="text-xs text-emerald-100/90 leading-relaxed mt-2">
            請點擊下方按鈕進行 Google 官方彈出式帳號驗證。系統將確保唯有已認證之 Google 帳號方可進行權限比對與操作。
          </p>
        </div>

        <div className="p-6 space-y-5 flex-1">
          {/* Current Auth Status Card */}
          <div className={`p-4 border rounded-xl flex items-center justify-between ${
            currentEmail 
              ? 'bg-emerald-50/90 border-emerald-200' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                目前驗證狀態
              </div>
              <div className={`text-sm font-bold break-all ${currentEmail ? 'text-emerald-900 font-mono' : 'text-slate-500'}`}>
                {currentEmail || '尚未驗證 Google 帳號 (未登入)'}
              </div>
            </div>

            {currentEmail ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 shadow-sm flex-shrink-0 ml-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>登出</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold rounded-full flex-shrink-0 ml-2">
                未驗證
              </span>
            )}
          </div>

          {/* Primary Actions */}
          {currentEmail ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSwitchGoogleAccount}
                disabled={isVerifying}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-3 cursor-pointer group disabled:opacity-50"
              >
                {/* Google Logo with white badge */}
                <div className="bg-white p-1 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                </div>
                <span className="text-sm font-bold">
                  {isVerifying ? '開啟 Google 帳號切換中...' : '切換為其他 Google 帳號 (選擇/登入新帳號)'}
                </span>
                <ExternalLink className="w-4 h-4 text-emerald-200" />
              </button>

              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{authError}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGooglePopupLogin}
                disabled={isVerifying}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-emerald-500 text-slate-800 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center space-x-3 cursor-pointer group disabled:opacity-50"
              >
                {/* Google Logo */}
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                  {isVerifying ? '連線開啟 Google 授權視窗中...' : '使用 Google 帳號授權登入'}
                </span>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </button>

              {authError === 'popup-blocked' ? (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 leading-relaxed space-y-2 shadow-sm animate-in fade-in">
                  <div className="flex items-center space-x-2 text-amber-800 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>您的瀏覽器封鎖了 Google 授權彈出視窗</span>
                  </div>
                  <p className="text-[11px] text-amber-800/90">
                    因為瀏覽器安全設定，登入視窗被自動攔截。請依下方方法解除封鎖：
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] font-medium text-amber-900 bg-white/70 p-2.5 rounded-lg border border-amber-200/80">
                    <li>檢查瀏覽器網址列右側是否有<strong className="text-amber-900">「已封鎖彈出式視窗」</strong>圖示，並選擇<strong className="text-emerald-700">「總是允許」</strong>。</li>
                    <li>若您使用 LINE、Facebook 內建瀏覽器，請點擊右上角選單並選擇<strong className="text-emerald-700">「以 Chrome / Safari 開啟」</strong>。</li>
                  </ol>
                  <p className="text-[10px] text-amber-700 font-bold">
                    完成後請再次點擊上方「使用 Google 帳號授權登入」按鈕即可。
                  </p>
                </div>
              ) : authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{authError}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed space-y-1">
            <p className="font-bold text-slate-700">📌 Google 身分安全驗證說明：</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600">
              <li>本系統嚴格串接 Google OAuth 2.0 官方登入與權限驗證機制。</li>
              <li>登入後系統將自動比對帳號身分：管理員自動開啟後台，學校代表開啟專屬報名區，未註冊者導向報名註冊。</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-center flex-shrink-0">
          <p className="text-[11px] text-slate-400">
            © 臺中市第41屆行義蘭姐童軍專科考驗暨聯團露營 | Google OAuth 安全認證機制
          </p>
        </div>
      </div>
    </div>
  );
};



