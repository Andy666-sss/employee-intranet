import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RegisterPage({ onBackToLogin }) {
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone3: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // 帳號統一轉成假 email 給 Supabase Auth 使用
  function toEmail(username) {
    return `${username.trim()}@intranet.app`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) { setError('請輸入姓名。'); return }
    if (!form.username.trim()) { setError('請設定帳號。'); return }
    if (/\s/.test(form.username)) { setError('帳號不能含有空格。'); return }
    if (form.password.length < 6) { setError('密碼至少需要 6 個字元。'); return }
    if (form.password !== form.confirmPassword) { setError('兩次密碼不一致。'); return }
    if (!/^\d{3}$/.test(form.phone3)) { setError('手機末三碼請輸入 3 位數字。'); return }

    setLoading(true)

    // 1. 建立 Supabase Auth 帳號（用假 email）
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: toEmail(form.username),
      password: form.password,
    })

    if (signUpError) {
      const msg = signUpError.message.includes('already registered')
        ? '此帳號已被使用，請換一個。'
        : `建立帳號失敗：${signUpError.message}`
      setError(msg)
      setLoading(false)
      return
    }

    // 2. 把帳號名稱寫入 profiles.name（方便後續顯示）
    await supabase
      .from('profiles')
      .update({ name: form.name.trim() })
      .eq('id', authData.user.id)

    // 3. 送出審核申請
    const { error: regError } = await supabase
      .from('pending_registrations')
      .insert({
        auth_user_id: authData.user.id,
        self_name: form.name.trim(),
        phone_last3: form.phone3,
      })

    if (regError) {
      setError(`送出審核失敗：${regError.message}`)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center max-w-sm w-full">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-yellow-100 rounded-full mb-4">
            <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">申請已送出！</h2>
          <p className="text-gray-500 text-sm mb-1">請等待管理員審核，通過後即可登入。</p>
          <p className="text-gray-400 text-xs mb-6">你的帳號是：<span className="font-mono font-medium text-gray-600">{form.username}</span></p>
          <button onClick={onBackToLogin} className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer transition">
            返回登入頁
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">申請帳號</h1>
          <p className="text-gray-500 mt-1 text-sm">填寫資料後由管理員審核</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} noValidate>

            {/* 姓名（自由輸入） */}
            <div className="mb-5">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                姓名 <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="請輸入真實姓名"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* 帳號（自由輸入） */}
            <div className="mb-5">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1.5">
                設定帳號 <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => set('username', e.target.value.trim())}
                placeholder="自訂帳號（不能有空格）"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="mt-1.5 text-xs text-gray-400">例如：wang001、police28</p>
            </div>

            {/* 密碼 */}
            <div className="mb-5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                設定密碼 <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="至少 6 個字元"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* 確認密碼 */}
            <div className="mb-5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                確認密碼 <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                placeholder="再輸入一次密碼"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* 手機末三碼 */}
            <div className="mb-6">
              <label htmlFor="phone3" className="block text-sm font-medium text-gray-700 mb-1.5">
                手機末三碼 <span className="text-red-500">*</span>
              </label>
              <input
                id="phone3"
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={form.phone3}
                onChange={(e) => set('phone3', e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="例：456"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition tracking-widest"
              />
              <p className="mt-1.5 text-xs text-gray-400">管理員會打電話確認，請填正確號碼。</p>
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
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? '送出申請中...' : '送出申請'}
            </button>
          </form>
        </div>

        <p className="text-center mt-4">
          <button onClick={onBackToLogin} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition">
            ← 返回登入
          </button>
        </p>
      </div>
    </div>
  )
}
