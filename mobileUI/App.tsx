import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Square } from './pages/Dashboard';
import { ImageGeneration, VideoGeneration } from './pages/Creation';
import { AdminDashboard } from './pages/Admin';
import { UserRole } from './types';
import { Input, Button, Surface } from './components/ui/Theme';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { Settings as SettingsPage } from './pages/Settings';
import { History as HistoryPage } from './pages/History';

// --- Auth Components ---

const Login: React.FC<{ onLogin: (role: UserRole) => void }> = ({ onLogin }) => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative z-20 bg-[hsl(var(--background))]">
      <Surface className="w-full max-w-md p-8 space-y-8">
        <div className="text-center space-y-2">
           <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          <h1 className="text-2xl font-bold text-white">欢迎回来</h1>
          <p className="text-white/40 text-sm">登录 SanHub 账号以继续</p>
        </div>
        
        <div className="space-y-4">
          <Input placeholder="邮箱地址" type="email" />
          <Input placeholder="密码" type="password" />
        </div>

        <div className="space-y-3 pt-2">
           <Button onClick={() => onLogin(UserRole.USER)} className="w-full bg-white text-black hover:bg-gray-200">
            登录 (用户)
           </Button>
           <Button onClick={() => onLogin(UserRole.ADMIN)} variant="outline" className="w-full">
            登录 (管理员 Demo)
           </Button>
        </div>
        
        <div className="text-center text-xs text-white/30">
           没有账号? <Link to="/register" className="text-sky-400 hover:underline">立即注册</Link>
        </div>
      </Surface>
    </div>
  );
};

const Register: React.FC = () => {
  return (
     <div className="min-h-screen flex items-center justify-center px-4 relative z-20 bg-[hsl(var(--background))]">
      <Surface className="w-full max-w-md p-8 space-y-6">
        <div className="absolute top-4 left-4">
           <Link to="/login" className="text-white/40 hover:text-white"><ArrowLeft className="w-5 h-5"/></Link>
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">创建账号</h1>
          <p className="text-white/40 text-sm">加入 SanHub 创意社区</p>
        </div>
        
        <div className="space-y-4">
          <Input placeholder="用户名" type="text" />
          <Input placeholder="邮箱地址" type="email" />
          <Input placeholder="密码" type="password" />
        </div>

        <Button className="w-full mt-4">注册</Button>
        
        <div className="text-center text-xs text-white/30">
           注册即代表同意 <a href="#" className="text-sky-400">服务条款</a>
        </div>
      </Surface>
    </div>
  )
}

// --- Main App ---

const App: React.FC = () => {
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const handleLogin = (role: UserRole) => {
    setUserRole(role);
  };

  const handleLogout = () => {
    setUserRole(null);
  };

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={
            userRole ? <Navigate to="/square" /> : <Login onLogin={handleLogin} />
        } />
        <Route path="/register" element={<Register />} />
        
        {/* Protected Routes */}
        <Route path="/*" element={
          userRole ? (
            <Layout role={userRole} onLogout={handleLogout}>
              <Routes>
                {/* User Routes - Strictly matching request */}
                <Route path="/square" element={<Square />} />
                <Route path="/image" element={<ImageGeneration />} />
                <Route path="/video" element={<VideoGeneration />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                
                {/* Admin Routes - Strictly matching request */}
                {userRole === UserRole.ADMIN && (
                   <Route path="/admin/*" element={<AdminDashboard />} />
                )}
                
                {/* Fallback */}
                <Route path="*" element={<Navigate to={userRole === UserRole.ADMIN ? "/admin" : "/square"} />} />
              </Routes>
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        } />
      </Routes>
    </Router>
  );
};

export default App;
