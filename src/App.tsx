
import React, { useState, useCallback, useEffect } from 'react';
import { Conversation, BotSettings, View, User, GlobalTelemetry, ConnectionStatus } from './types';
import Header from './components/Header';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsPanel from './components/SettingsPanel';
import ConnectionPanel from './components/ConnectionPanel';
import AdminDashboard from './components/Admin/AdminDashboard';
import AuditView from './components/Admin/AuditView';
import AuthModal from './components/AuthModal';

const BACKEND_URL = 'http://localhost:3001';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('saas_token'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('saas_role'));
  const [currentView, setCurrentView] = useState<View>(View.CHATS);
  const [auditTarget, setAuditTarget] = useState<User | null>(null);
  const [isBotGloballyActive, setIsBotGloballyActive] = useState(true);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'register' }>({ isOpen: false, mode: 'login' });

  useEffect(() => {
    if (userRole === 'super_admin') setCurrentView(View.ADMIN_GLOBAL);
  }, [userRole]);

  const handleAudit = (user: User) => {
      setAuditTarget(user);
      setCurrentView(View.AUDIT_MODE);
  };

  const handleLoginSuccess = (t: string, r: string) => {
      setToken(t);
      setUserRole(r);
      localStorage.setItem('saas_token', t);
      localStorage.setItem('saas_role', r);
      setAuthModal({ ...authModal, isOpen: false });
  };

  const renderContent = () => {
    if (!token) return <LandingPage onAuth={() => setAuthModal({ isOpen: true, mode: 'login' })} />;

    switch (currentView) {
      case View.ADMIN_GLOBAL:
        return userRole === 'super_admin' ? <AdminDashboard token={token} onAudit={handleAudit} /> : <AccessDenied />;
      case View.AUDIT_MODE:
        return userRole === 'super_admin' && auditTarget ? <AuditView user={auditTarget} onClose={() => setCurrentView(View.ADMIN_GLOBAL)} /> : <AccessDenied />;
      case View.CHATS:
        return <ConversationList conversations={[]} selectedConversationId={null} onSelectConversation={() => {}} backendError={null} />;
      case View.SETTINGS:
        return <SettingsPanel settings={{} as any} onUpdateSettings={() => {}} onOpenLegal={() => {}} />;
      default:
        return <div className="p-10 text-gray-500 uppercase font-black">Módulo en construcción</div>;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-brand-black text-white font-sans overflow-hidden">
      <AuthModal 
        isOpen={authModal.isOpen} 
        initialMode={authModal.mode} 
        onClose={() => setAuthModal({ ...authModal, isOpen: false })} 
        onSuccess={handleLoginSuccess} 
        onOpenLegal={(type) => console.log('Open legal:', type)} 
      />
      <Header 
        isLoggedIn={!!token} 
        userRole={userRole} 
        onLoginClick={() => setAuthModal({ isOpen: true, mode: 'login' })}
        onRegisterClick={() => setAuthModal({ isOpen: true, mode: 'register' })}
        onLogoutClick={() => { localStorage.clear(); window.location.reload(); }} 
        isBotGloballyActive={isBotGloballyActive}
        onToggleBot={() => setIsBotGloballyActive(!isBotGloballyActive)}
        currentView={currentView} 
        onNavigate={setCurrentView} 
        connectionStatus={ConnectionStatus.DISCONNECTED}
      />
      <main className="flex-1 overflow-hidden flex relative">
        {renderContent()}
      </main>
    </div>
  );
}

function AccessDenied() {
    return <div className="flex-1 flex items-center justify-center font-black text-red-500 uppercase tracking-widest">Acceso Denegado: Insuficientes Privilegios</div>;
}

function LandingPage({ onAuth }: any) {
    return <div className="flex-1 flex flex-col items-center justify-center bg-brand-black p-10 text-center space-y-8 animate-fade-in">
        <h1 className="text-6xl font-black text-white tracking-tighter">DOMINION <span className="text-brand-gold">OS</span></h1>
        <p className="text-gray-500 max-w-xl text-lg">Infraestructura comercial autónoma para escalado de agencias.</p>
        <button onClick={onAuth} className="px-10 py-4 bg-brand-gold text-black rounded-xl font-black uppercase tracking-widest hover:scale-105 transition-all">Iniciar Operaciones</button>
    </div>;
}
