import { supabase } from '../lib/supabase'

export default function PendingPage({ onLogout }) {
  async function handleLogout() {
    await supabase.auth.signOut()
    onLogout()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center max-w-sm w-full">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-yellow-100 rounded-full mb-4">
          <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">帳號審核中</h2>
        <p className="text-gray-500 text-sm mb-1">你的申請已收到，請等待管理員審核。</p>
        <p className="text-gray-400 text-xs mb-8">通過後即可正常使用系統。如有疑問，請聯絡你的管理員。</p>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition"
        >
          登出
        </button>
      </div>
    </div>
  )
}
