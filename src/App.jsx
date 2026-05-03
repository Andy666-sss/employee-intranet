import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PendingPage from './pages/PendingPage'
import MessageBoard from './pages/MessageBoard'
import SchedulePage from './pages/SchedulePage'
import AdminApprovalPage from './pages/AdminApprovalPage'
import KnowledgeBasePage from './pages/KnowledgeBasePage'
import ProfilePage from './pages/ProfilePage'

const LEVEL_LABELS = { 1: '牛馬', 2: '社畜', 3: '管理員' }

// ── 設計系統色彩 ─────────────────────────────────────────────────
const C = {
  navy800: '#1B3A5C',
  navy700: '#1E4D7B',
  navy600: '#2563A8',
  navy100: '#E0EAF5',
  pageBg: '#F5F3EE',
}

function getTabs(level) {
  const tabs = [
    { id: 'schedule',  label: '班表',      icon: 'calendar' },
    { id: 'messages',  label: '心情留言板', icon: 'message' },
    { id: 'knowledge', label: '業務資料庫', icon: 'database' },
  ]
  if (level >= 3) tabs.push({ id: 'admin', label: '帳號審核', icon: 'shield' })
  tabs.push({ id: 'profile', label: '個人設定', icon: 'user' })
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
    return { user, level, levelLabel: LEVEL_LABELS[level] ?? '未知', name: employee.name, status: 'approved' }
  }

  const { data: reg } = await supabase
    .from('pending_registrations')
    .select('status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!reg && profile?.level >= 3) {
    return {
      user, level: profile.level,
      levelLabel: LEVEL_LABELS[profile.level] ?? '管理員',
      name: profile.name || user.email.split('@')[0],
      status: 'approved',
    }
  }

  return {
    user, level: profile?.level ?? 1,
    levelLabel: LEVEL_LABELS[profile?.level ?? 1] ?? '未知',
    name: profile?.name || user.email.split('@')[0],
    status: reg?.status ?? 'none',
  }
}

// ── 導覽圖示 SVG ─────────────────────────────────────────────────
function NavIcon({ name, active }) {
  const color = active ? '#fff' : '#93B8D8'
  const s = { width: 20, height: 20, flexShrink: 0 }
  if (name === 'calendar') return (
    <svg style={s} fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
  if (name === 'message') return (
    <svg style={s} fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.862 9.862 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
  if (name === 'database') return (
    <svg style={s} fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3M4 7v5c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12v5c0 1.657 3.582 3 8 3s8-1.343 8-3v-5" />
    </svg>
  )
  if (name === 'shield') return (
    <svg style={s} fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
  if (name === 'user') return (
    <svg style={s} fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
  return null
}

// ── Logo ────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 16px' }}>
      <img
        src="/logo.jfif"
        alt="保安警察第一總隊員工內網"
        style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }}
      />
      <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.4, letterSpacing: 0.3 }}>
        保安警察第一總隊<br />
        <span style={{ color: '#93B8D8', fontWeight: 400 }}>員工內網系統</span>
      </div>
    </div>
  )
}

function App() {
  const [page, setPage]               = useState('loading')
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab]     = useState('schedule')

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
      <div style={{ minHeight: '100vh', background: C.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: 14 }}>載入中...</p>
      </div>
    )
  }

  // ── 登入頁 ──
  if (page === 'login') {
    return <LoginPage onLogin={handleLogin} onRegister={() => setPage('register')} />
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
  const initials = (currentUser?.name?.[0] || '我').toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.pageBg }}>

      {/* ── 左側欄 ── */}
      <aside style={{
        width: 200,
        minWidth: 200,
        background: C.navy800,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 30,
      }}>
        {/* Logo */}
        <Logo />

        {/* 分隔線 */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 16px 12px' }} />

        {/* 導覽項目 */}
        <nav style={{ flex: 1, padding: '0 10px', overflowY: 'auto' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: 2,
                  background: isActive ? 'rgba(255,255,255,0.13)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <NavIcon name={tab.icon} active={isActive} />
                <span style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#fff' : '#93B8D8',
                  letterSpacing: 0.3,
                }}>
                  {tab.label}
                </span>
                {isActive && (
                  <div style={{
                    width: 3, height: 20, borderRadius: 2,
                    background: '#fff',
                    marginLeft: 'auto',
                    opacity: 0.7,
                  }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* ── 底部使用者資訊 ── */}
        <div style={{ padding: '12px 14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: C.navy600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser?.name}
              </div>
              <div style={{ color: '#93B8D8', fontSize: 10, marginTop: 1 }}>
                Lv{currentUser?.level}・{currentUser?.levelLabel}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '7px 0', borderRadius: 8,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#93B8D8', fontSize: 12, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.13)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          >
            登出
          </button>
        </div>
      </aside>

      {/* ── 主內容區 ── */}
      <main style={{ marginLeft: 200, flex: 1, minWidth: 0 }}>
        {activeTab === 'schedule'  && <SchedulePage currentUser={currentUser} />}
        {activeTab === 'messages'  && <MessageBoard currentUser={currentUser} />}
        {activeTab === 'knowledge' && <KnowledgeBasePage currentUser={currentUser} />}
        {activeTab === 'admin'     && <AdminApprovalPage />}
        {activeTab === 'profile'   && <ProfilePage currentUser={currentUser} onUserUpdate={setCurrentUser} />}
      </main>
    </div>
  )
}

export default App
