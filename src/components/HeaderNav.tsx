import React from 'react';
import { ShieldCheck, School, RefreshCw, Repeat } from 'lucide-react';
import { isAdmin } from '../services/storageService';

interface HeaderNavProps {
  userEmail: string;
  authMode: 'admin' | 'user';
  setAuthMode: (mode: 'admin' | 'user') => void;
  onOpenAuthModal: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  userEmail,
  authMode,
  setAuthMode,
  onOpenAuthModal,
}) => {
  const isUserAdmin = isAdmin(userEmail);

  return (
    <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 gap-3">
          
          {/* Brand Title */}
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-600 p-2.5 rounded-xl text-white shadow-lg shadow-emerald-900/30">
              <School className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight text-white flex items-center gap-2">
                臺中市第41屆行義蘭姐童軍專科考驗暨聯團露營報名系統
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                主辦單位：臺中市立臺中第二高級中等學校社團組 | 全區 55 所學校線上報名與檔案繳交平台
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Subbar with user email & role toggle context */}
      <div className="bg-slate-950/90 border-t border-slate-800/80 py-2 px-4 text-xs text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              <ShieldCheck className={`w-3.5 h-3.5 ${userEmail ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="text-slate-400">Google 帳號狀態：</span>
              <span className={`font-mono font-bold break-all ${userEmail ? 'text-emerald-300' : 'text-amber-400'}`}>
                {userEmail || '尚未驗證登入'}
              </span>
            </div>

            {userEmail && (
              isUserAdmin ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  具管理員權限
                </span>
              ) : userEmail.includes('.edu') ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  學校教育帳號 (.edu)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  非教育組織帳號
                </span>
              )
            )}

            <button
              type="button"
              onClick={onOpenAuthModal}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                userEmail 
                  ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md animate-pulse'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              <span>{userEmail ? '切換/驗證 Google 帳號' : '點此驗證 / 登入 Google 帳號'}</span>
            </button>
          </div>

          {/* Admin Role Toggle Switch if User is Admin */}
          {isUserAdmin && (
            <div className="flex items-center space-x-2 bg-amber-950/50 border border-amber-800/60 px-3 py-1 rounded-lg">
              <span className="text-[11px] text-amber-200 font-medium">切換檢視模式：</span>
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'admin' ? 'user' : 'admin')}
                className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-amber-500 text-slate-950 font-black text-xs rounded shadow hover:bg-amber-400 transition-all"
              >
                <Repeat className="w-3 h-3" />
                <span>{authMode === 'admin' ? '已開啟管理員介面 (點擊切換為學校代表)' : '已開啟學校代表上傳 (點擊切換為管理員)'}</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
};
