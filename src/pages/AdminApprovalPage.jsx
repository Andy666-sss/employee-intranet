import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminApprovalPage() {
  const [pending, setPending]   = useState([])
  const [users, setUsers]       = useState([])
  const [loadingPending, setLoadingPending] = useState(true)
  const [loadingUsers, setLoadingUsers]     = useState(true)
  const [actionId, setActionId] = useState(null)

  // 重設密碼 modal 狀態
  const [resetTarget, setResetTarget] = useState(null)   // { user_id, name }
  const [newPassword, setNewPassword] = useState('')
  const [resetMsg, setResetMsg]       = useState('')

  // 解除鎖定
  const [unlockingId, setUnlockingId] = useState(null)

  useEffect(() => {
    fetchPending()
    fetchUsers()
  }, [])

  // ── 待審核申請 ──────────────────────────────────────────
  async function fetchPending() {
    setLoadingPending(true)
    const { data } = await supabase
      .from('pending_registrations')
      .select('id, auth_user_id, phone_last3, status, created_at, self_name')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setPending(data || [])
    setLoadingPending(false)
  }

  async function approve(reg) {
    setActionId(reg.id)
    const { error } = await supabase
      .from('pending_registrations')
      .update({ status: 'approved' })
      .eq('id', reg.id)
    if (error) { alert('核准失敗：' + error.message); setActionId(null); return }

    // 把申請時填的姓名寫入 profiles
    if (reg.self_name) {
      await supabase.from('profiles')
        .update({ name: reg.self_name })
        .eq('id', reg.auth_user_id)
    }

    if (reg.employee_id) {
      await supabase.from('employees')
        .update({ user_id: reg.auth_user_id })
        .eq('id', reg.employee_id)
    }
    await fetchPending()
    await fetchUsers()
    setActionId(null)
  }

  async function reject(reg) {
    if (!window.confirm(`確定要拒絕 ${reg.self_name} 的申請嗎？`)) return
    setActionId(reg.id)
    await supabase.from('pending_registrations')
      .update({ status: 'rejected' }).eq('id', reg.id)
    await fetchPending()
    setActionId(null)
  }

  // ── 已核准使用者 ────────────────────────────────────────
  async function fetchUsers() {
    setLoadingUsers(true)
    // 從 profiles 取得已有帳號的使用者（level + name + 鎖定狀態）
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, level, name, is_locked')
      .order('level', { ascending: false })
    setUsers(profiles || [])
    setLoadingUsers(false)
  }

  // ── 解除帳號鎖定 ────────────────────────────────────────
  async function handleUnlockAccount(userId, userName) {
    if (!window.confirm(`確定要解除 ${userName} 的帳號鎖定嗎？`)) return
    setUnlockingId(userId)
    const { error } = await supabase.rpc('unlock_account', { target_user_id: userId })
    if (error) {
      alert('解除鎖定失敗：' + error.message)
    } else {
      await fetchUsers()
    }
    setUnlockingId(null)
  }

  // ── 重設密碼 ────────────────────────────────────────────
  async function handleResetPassword(e) {
    e.preventDefault()
    if (newPassword.length < 6) { setResetMsg('密碼至少 6 個字元。'); return }
    setResetMsg('')

    const { error } = await supabase.rpc('admin_reset_password', {
      target_user_id: resetTarget.user_id,
      new_password: newPassword,
    })

    if (error) {
      setResetMsg('重設失敗：' + error.message)
    } else {
      setResetMsg('✓ 密碼已重設成功！')
      setNewPassword('')
      setTimeout(() => { setResetTarget(null); setResetMsg('') }, 1500)
    }
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString('zh-TW', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const LEVEL_LABELS = { 1: '牛馬', 2: '社畜', 3: '管理員' }

  return (
    <div style={{ background: '#F5F3EE', minHeight: '100vh' }}>
    <div className="px-4 py-6 space-y-8" style={{ maxWidth: 720 }}>
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#2C2C2C' }}>帳號審核</h2>
        <p className="text-sm mt-0.5" style={{ color: '#6B6B6B' }}>管理待審核申請與帳號設定</p>
      </div>

      {/* ── 待審核申請 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">待審核申請</h2>
          <button onClick={fetchPending} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition">重新整理</button>
        </div>

        {loadingPending ? (
          <p className="text-center text-gray-400 text-sm py-6">載入中...</p>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">目前沒有待審核的申請</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((reg) => (
              <li key={reg.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">{reg.self_name || '—'}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>手機末三碼：<span className="font-mono font-bold text-gray-800 tracking-widest">{reg.phone_last3}</span></span>
                      <span className="text-gray-300">|</span>
                      <span>{formatTime(reg.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approve(reg)}
                      disabled={actionId === reg.id}
                      className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-medium rounded-lg cursor-pointer disabled:cursor-wait transition"
                    >
                      {actionId === reg.id ? '處理中...' : '✓ 核准'}
                    </button>
                    <button
                      onClick={() => reject(reg)}
                      disabled={actionId === reg.id}
                      className="px-4 py-1.5 bg-white hover:bg-red-50 text-red-600 text-xs font-medium rounded-lg border border-red-200 cursor-pointer transition"
                    >
                      ✕ 拒絕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 帳號管理 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">帳號管理</h2>
          <button onClick={fetchUsers} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition">重新整理</button>
        </div>

        {loadingUsers ? (
          <p className="text-center text-gray-400 text-sm py-6">載入中...</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className={`bg-white rounded-xl border px-4 py-3 flex items-center justify-between ${u.is_locked ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{u.name || '未設定姓名'}</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Lv{u.level}・{LEVEL_LABELS[u.level] ?? '未知'}
                  </span>
                  {u.is_locked && (
                    <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                      🔒 已鎖定
                    </span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {u.is_locked && (
                    <button
                      onClick={() => handleUnlockAccount(u.id, u.name || '未設定姓名')}
                      disabled={unlockingId === u.id}
                      className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 cursor-pointer transition px-3 py-1 rounded-lg"
                    >
                      {unlockingId === u.id ? '處理中...' : '解除鎖定'}
                    </button>
                  )}
                  <button
                    onClick={() => { setResetTarget({ user_id: u.id, name: u.name }); setNewPassword(''); setResetMsg('') }}
                    className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer transition border border-gray-200 hover:border-blue-300 px-3 py-1 rounded-lg"
                  >
                    重設密碼
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 重設密碼 Modal ── */}
      {resetTarget && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setResetTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">重設密碼</h3>
              <p className="text-sm text-gray-500 mb-5">為 <span className="font-medium text-gray-700">{resetTarget.name}</span> 設定新密碼</p>
              <form onSubmit={handleResetPassword}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="輸入新密碼（至少 6 字元）"
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                />
                {resetMsg && (
                  <p className={`text-xs mb-3 ${resetMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                    {resetMsg}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg cursor-pointer transition"
                  >
                    確認重設
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(null)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg cursor-pointer transition"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  )
}
