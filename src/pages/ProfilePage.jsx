import { useState } from 'react'
import { supabase } from '../lib/supabase'

const C = {
  navy800: '#1B3A5C',
  navy600: '#2563A8',
  pageBg: '#F5F3EE',
  cardBg: '#FFFFFF',
  border: '#E5E2DC',
  text1: '#2C2C2C',
  text2: '#6B6B6B',
}

export default function ProfilePage({ currentUser, onUserUpdate }) {
  const [newPassword, setNewPassword]   = useState('')
  const [confirmPwd, setConfirmPwd]     = useState('')
  const [pwdMsg, setPwdMsg]             = useState('')
  const [pwdLoading, setPwdLoading]     = useState(false)

  const initials = (currentUser?.name?.[0] || '我').toUpperCase()
  const LEVEL_LABELS = { 1: '牛馬', 2: '社畜', 3: '管理員' }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPassword.length < 6) { setPwdMsg('密碼至少 6 個字元'); return }
    if (newPassword !== confirmPwd) { setPwdMsg('兩次輸入的密碼不一致'); return }
    setPwdLoading(true)
    setPwdMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPwdMsg('更新失敗：' + error.message)
    } else {
      setPwdMsg('✓ 密碼已成功更新！')
      setNewPassword('')
      setConfirmPwd('')
    }
    setPwdLoading(false)
  }

  const cardStyle = {
    background: C.cardBg,
    borderRadius: 14,
    border: `1px solid ${C.border}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    padding: '28px 32px',
  }

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: C.text2,
    marginBottom: 6,
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    fontSize: 14,
    color: C.text1,
    background: '#FAFAF8',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{ background: C.pageBg, minHeight: '100vh', padding: '36px 32px' }}>

      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text1, margin: 0 }}>個人設定</h1>
        <p style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>管理你的帳號資訊</p>
      </div>

      <div style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── 帳號資訊 ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: C.navy800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 22, fontWeight: 700, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text1 }}>{currentUser?.name}</div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 3 }}>
                Lv{currentUser?.level}・{LEVEL_LABELS[currentUser?.level] ?? '未知'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={labelStyle}>姓名</span>
              <div style={{ ...inputStyle, color: C.text2, background: '#F3F3F0', cursor: 'default' }}>
                {currentUser?.name || '—'}
              </div>
            </div>
            <div>
              <span style={labelStyle}>帳號等級</span>
              <div style={{ ...inputStyle, color: C.text2, background: '#F3F3F0', cursor: 'default' }}>
                Lv{currentUser?.level}・{LEVEL_LABELS[currentUser?.level] ?? '未知'}
              </div>
            </div>
          </div>
        </div>

        {/* ── 修改密碼 ── */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text1, margin: '0 0 20px' }}>修改密碼</h2>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 6 個字元"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = C.navy600 }}
                onBlur={e => { e.target.style.borderColor = C.border }}
              />
            </div>
            <div>
              <label style={labelStyle}>確認新密碼</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="再次輸入新密碼"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = C.navy600 }}
                onBlur={e => { e.target.style.borderColor = C.border }}
              />
            </div>
            {pwdMsg && (
              <p style={{
                fontSize: 13,
                color: pwdMsg.startsWith('✓') ? '#16a34a' : '#dc2626',
                margin: 0,
              }}>
                {pwdMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={pwdLoading || !newPassword || !confirmPwd}
              style={{
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                background: C.navy800,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: pwdLoading || !newPassword || !confirmPwd ? 'not-allowed' : 'pointer',
                opacity: pwdLoading || !newPassword || !confirmPwd ? 0.5 : 1,
                transition: 'opacity 0.15s',
                marginTop: 4,
              }}
            >
              {pwdLoading ? '更新中...' : '更新密碼'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
