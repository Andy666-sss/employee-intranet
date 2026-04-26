import { useState } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PendingPage from './pages/PendingPage'
import MessageBoard from './pages/MessageBoard'
import SchedulePage from './pages/SchedulePage'
import AdminApprovalPage from './pages/AdminApprovalPage'

// 分頁設定（管理員審核只有 Level 3 看得到）
function getTabs(level) {
  const tabs = [
    { id: 'schedule', label: '班表' },
    { id: 'messages', label: '心情留言板' },
  ]
  if (level >= 3) tabs.push({ id: 'admin', label: '帳號審核' })
  return tabs
}

function App() {
  const [page, setPage]           = useState('login')   // 'login' | 'register'
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('schedule')

  function handleLogin(userData) {
    setCurrentUser(userData)
    setPage('app')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setCurrentUser(null)
    setPage('login')
  }

  // ── 登入頁 ──
  if (page === 'login') {
    return (
      <LoginPage
        onLogin={handleLogin}
        onRegister={() => setPage('register')}
      />
    )
  }

  // ── 申請帳號頁 ──
  if (page === 'register') {
    return <RegisterPage onBackToLogin={() => setPage('login')} />
  }

  // ── 帳號審核中 ──
  if (currentUser?.status === 'pending' || currentUser?.status === 'none') {
    return <PendingPage onLogout={handleLogout} />
  }

  // ── 主系統 ──
  const tabs = getTabs(currentUser?.level ?? 1)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 頂部導覽列 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-sm">員工內網</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:inline">{currentUser?.name}</span>
            <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2.5 py-1 rounded-full">
              Lv{currentUser?.level}・{currentUser?.levelLabel}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600 transition cursor-pointer"
            >
              登出
            </button>
          </div>
        </div>

        {/* 分頁標籤 */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 border-t border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition cursor-pointer',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="w-full">
        {activeTab === 'schedule' && <SchedulePage currentUser={currentUser} />}
        {activeTab === 'messages' && <MessageBoard currentUser={currentUser} />}
        {activeTab === 'admin'    && <AdminApprovalPage />}
      </main>
    </div>
  )
}

export default App
