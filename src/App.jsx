import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PendingPage from './pages/PendingPage'
import MessageBoard from './pages/MessageBoard'
import SchedulePage from './pages/SchedulePage'
import AdminApprovalPage from './pages/AdminApprovalPage'
import KnowledgeBasePage from './pages/KnowledgeBasePage'

const LEVEL_LABELS = { 1: '牛馬', 2: '社畜', 3: '管理員' }

function getTabs(level) {
  const tabs = [
    { id: 'schedule', label: '班表' },
    { id: 'messages', label: '心情留言板' },
  ]
  if (level >= 2) tabs.push({ id: 'knowledge', label: '業務資料庫' })
  if (level >= 3) tabs.push({ id: 'admin', label: '帳號審核' })
  return tabs
}

async function fetchUserData(user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('level, name')
    .eq('id', user.id)
    .single()

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, badge_number, title')
    .eq('user_id', user.id)
    .maybeSingle()

  if (employee) {
    const level = profile?.level ?? 1
    return {
      user,
      level,
      levelLabel: LEVEL_LABELS[level] ?? '未知',
      name: employee.name,
      status: 'approved',
    }
  }

  const { data: reg } = await supabase
    .from('pending_registrations')
    .select('status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!reg && profile?.level >= 3) {
    return {
      user,
      level: profile.level,
      levelLabel: LEVEL_LABELS[profile.level] ?? '管理員',
      name: profile.name || user.email.split('@')[0],
      status: 'approved',
    }
  }

  return {
    user,
    level: profile?.level ?? 1,
    levelLabel: LEVEL_LABELS[profile?.level ?? 1] ?? '未知',
    name: profile?.name || user.email.split('@')[0],
    status: reg?.status ?? 'none',
  }
}

function App() {
  const [page, setPage]           = useState('loading')
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('schedule')

  // 啟動時檢查是否已有登入 session
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const userData = await fetchUserData(session.user)
        setCurrentUser(userData)
        setPage('app')
      } else {
        setPage('login')
      }
    })
  }, [])

  async function handleLogin(userData) {
    setCurrentUser(userData)
    setPage('app')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setCurrentUser(null)
    setPage('login')
  }

  // ── 載入中 ──
  if (page === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">載入中...</p>
      </div>
    )
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
          <span className="font-semibold text-gray-900 text-sm">三大二中員工內網系統</span>
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
        {activeTab === 'schedule'   && <SchedulePage currentUser={currentUser} />}
        {activeTab === 'messages'   && <MessageBoard currentUser={currentUser} />}
        {activeTab === 'knowledge'  && <KnowledgeBasePage currentUser={currentUser} />}
        {activeTab === 'admin'      && <AdminApprovalPage />}
      </main>
    </div>
  )
}

export default App
