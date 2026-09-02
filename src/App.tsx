import React, { useState, useEffect } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { AppSimulator } from './components/AppSimulator';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { getCurrentAuthSession, setCurrentAuthSession, isAdmin } from './services/storageService';

export default function App() {
  // Google Auth Email State (default: empty for security, requires user sign in)
  const [userEmail, setUserEmail] = useState<string>('');
  
  // View mode for Admins ('admin' or 'user')
  const [authMode, setAuthMode] = useState<'admin' | 'user'>('user');

  // Google Auth Modal visibility
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Load current session from localStorage on mount
  useEffect(() => {
    const session = getCurrentAuthSession();
    if (session.email) {
      setUserEmail(session.email);
      setAuthMode(isAdmin(session.email) ? 'admin' : 'user');
    }
  }, []);

  // Sync auth mode if email changes
  const handleSelectEmail = (newEmail: string) => {
    const cleanEmail = newEmail.toLowerCase().trim();
    setUserEmail(cleanEmail);
    const newMode = isAdmin(cleanEmail) ? 'admin' : 'user';
    setAuthMode(newMode);
    setCurrentAuthSession({ email: cleanEmail, mode: newMode });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <HeaderNav
        userEmail={userEmail}
        authMode={authMode}
        setAuthMode={(m) => {
          setAuthMode(m);
          setCurrentAuthSession({ email: userEmail, mode: m });
        }}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      <main className="flex-1">
        <AppSimulator
          userEmail={userEmail}
          authMode={authMode}
          setAuthMode={(m) => {
            setAuthMode(m);
            setCurrentAuthSession({ email: userEmail, mode: m });
          }}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
        />
      </main>

      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentEmail={userEmail}
        onSelectEmail={handleSelectEmail}
      />

      <footer className="bg-slate-900 text-slate-400 text-xs py-6 border-t border-slate-800 text-center">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-medium text-slate-300">
            臺中市第41屆行義蘭姐童軍專科考驗暨聯團露營報名與檔案繳交系統
          </p>
          <p className="text-slate-500">
            主辦單位：臺中市立臺中第二高級中等學校學務處社團組 | 電話：04-22021521#1340、1341
          </p>
        </div>
      </footer>
    </div>
  );
}
