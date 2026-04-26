import { useState } from 'react'
import { supabase } from '../lib/supabase'

const LEVEL_LABELS = {
  1: '牛馬',
  2: '社畜',
  3: '管理員'
}

export default function LoginPage({ onLogin, onRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 帳號若不含 @ 則補上假網域（自訂帳號用）
    const loginEmail = email.includes('@') ? email : `${email}@intranet.app`

    // 1. Auth 登入
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    if (authError) {
      setError('帳號或密碼錯誤，請再試一次。')
      setLoading(false)
      return
    }

    // 2. 取得 profiles（level）
    const { data: profile } = await supabase
      .from('profiles')
      .select('level, name')
      .eq('id', authData.user.id)
      .single()

    // 3. 確認是否已核准（employees.user_id 是否有對應）
    const { data: employee } = await supabase
      .from('employees')
      .select('id, name, badge_number, title')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (employee) {
      // 已核准 → 正常登入
      const level = profile?.level ?? 1
      onLogin({
        user: authData.user,
        level,
        levelLabel: LEVEL_LABELS[level] ?? '未知',
        name: employee.name,
        status: 'approved',
      })
    } else {
      // 檢查是否有待審核申請
      const { data: reg } = await supabase
        .from('pending_registrations')
        .select('status')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle()

      // 登入成功但沒核准記錄（管理員直接建的帳號，或 Level 3）
      if (!reg && profile?.level >= 3) {
        onLogin({
          user: authData.user,
          level: profile.level,
          levelLabel: LEVEL_LABELS[profile.level] ?? '管理員',
          name: profile.name || email.split('@')[0],
          status: 'approved',
        })
        setLoading(false)
        return
      }

      onLogin({
        user: authData.user,
        level: profile?.level ?? 1,
        levelLabel: LEVEL_LABELS[profile?.level ?? 1] ?? '未知',
        name: profile?.name || email.split('@')[0],
        status: reg?.status ?? 'none',
      })
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">三大二中員工內網系統</h1>
          <p className="text-gray-500 mt-1 text-sm">請使用公司帳號登入</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleLogin} noValidate>
            <div className="mb-5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                帳號
              </label>
              <input
                id="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="輸入你的帳號"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                密碼
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {error && (
              <div role="alert" className="mb-5 flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4">
          <button
            onClick={onRegister}
            className="text-blue-600 hover:text-blue-700 cursor-pointer transition"
          >
            還沒有帳號？申請帳號
          </button>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">如有問題請聯絡管理員</p>
      </div>
    </div>
  )
}
