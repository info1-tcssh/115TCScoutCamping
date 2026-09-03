import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserPlus, Trash2, Mail, User, Clock, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { AdminAccount } from '../types';
import { SCHOOLS } from '../data/schools';
import { addAdmin, getAdmins, removeAdmin, subscribeDataChanges } from '../services/storageService';

interface AdminManagerProps {
  currentAdminEmail: string;
}

export const AdminManager: React.FC<AdminManagerProps> = ({ currentAdminEmail }) => {
  const [admins, setAdmins] = useState<AdminAccount[]>(getAdmins());
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setAdmins(getAdmins());
    const unsub = subscribeDataChanges(() => {
      setAdmins(getAdmins());
    });
    return () => unsub();
  }, []);

  const refreshAdmins = () => {
    setAdmins(getAdmins());
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    const cleanEmail = newEmail.trim().toLowerCase();
    const cleanName = newName.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMsg({ type: 'error', text: '請輸入有效的 Google Email 信箱！' });
      return;
    }

    const res = await addAdmin(cleanEmail, cleanName || '管理員', currentAdminEmail);
    if (!res.success) {
      setMsg({ type: 'error', text: res.message });
    } else {
      setMsg({ type: 'success', text: res.message });
      setNewEmail('');
      setNewName('');
      refreshAdmins();
    }
  };

  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(null);

  const handleDeleteClick = (targetEmail: string) => {
    if (targetEmail.toLowerCase() === 'info1@cloud.tcssh.tc.edu.tw') {
      setMsg({ type: 'error', text: '預設系統總管理員帳號 (info1@cloud.tcssh.tc.edu.tw) 受系統保護，無法刪除！' });
      return;
    }
    setConfirmDeleteEmail(targetEmail);
  };

  const handleExecuteDelete = async () => {
    if (!confirmDeleteEmail) return;
    const targetEmail = confirmDeleteEmail;
    setConfirmDeleteEmail(null);

    const res = await removeAdmin(targetEmail, currentAdminEmail);
    if (!res.success) {
      setMsg({ type: 'error', text: res.message });
    } else {
      setMsg({ type: 'success', text: res.message });
      refreshAdmins();
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-800 to-indigo-900 text-white rounded-2xl p-6 shadow-lg border border-slate-700">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
            <ShieldCheck className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <h3 className="text-xl font-bold">管理員團隊管理介面</h3>
            <p className="text-xs text-indigo-200">受授權之管理員可在此新增或刪除其他管理員帳號權限</p>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed mt-2">
          預設總管理員：<span className="font-bold text-amber-300 underline">info1@cloud.tcssh.tc.edu.tw</span>。在此名單內的 Google Email 皆可直接登入管理員後台、審查全區 {SCHOOLS.length} 所學校檔案及操作 Audit Logs。
        </p>
      </div>

      {/* Alert Messages */}
      {msg && (
        <div
          className={`p-4 rounded-xl border flex items-center space-x-3 text-sm font-medium ${
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

      {/* Add Admin Form */}
      <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200">
        <h4 className="text-base font-bold text-slate-800 flex items-center space-x-2 mb-4">
          <UserPlus className="w-5 h-5 text-indigo-600" />
          <span>新增管理員帳號</span>
        </h4>

        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Google 電子郵件 (Email) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@school.edu.tw"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">管理員姓名 / 單位與職稱</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如：林秘書 (社團組)"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center space-x-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>授權新增管理員</span>
            </button>
          </div>
        </form>
      </div>

      {/* Admin List Table */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-800 flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <span>目前授權管理員清單 ({admins.length} 人)</span>
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Google 電子郵件</th>
                <th className="px-6 py-3">管理員姓名/職稱</th>
                <th className="px-6 py-3">新增時間</th>
                <th className="px-6 py-3">授權來源</th>
                <th className="px-6 py-3 text-right">操作管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {admins.map((admin) => {
                const isProtected = admin.email.toLowerCase() === 'info1@cloud.tcssh.tc.edu.tw';
                return (
                  <tr key={admin.email} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800 break-all">
                      <div className="flex items-center space-x-2">
                        <span>{admin.email}</span>
                        {isProtected && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300/60">
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>預設主總管理員</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-medium">{admin.name}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">{admin.addedAt}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{admin.addedBy}</td>
                    <td className="px-6 py-4 text-right">
                      {isProtected ? (
                        <span className="text-xs text-slate-400 font-semibold italic">受系統保護</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(admin.email)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>移除權限</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {confirmDeleteEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">確認移除管理員權限？</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              您即將移除帳號 <strong className="text-slate-900 font-mono">{confirmDeleteEmail}</strong> 的總管理員存取權限。移除後該帳號將無法登入管理員後台。
            </p>
            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteEmail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
              >
                確認移除權限
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
