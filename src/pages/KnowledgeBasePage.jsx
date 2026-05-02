import { useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
  '人事業務',
  '警務業務',
  '督訓業務',
  '後勤業務',
  '教育業務',
  '偵查業務',
  '行政業務',
  '其他',
]

const ACCEPT_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg'

export default function KnowledgeBasePage({ currentUser }) {
  // 權限不足：Level 1 使用者
  if ((currentUser?.level ?? 0) < 2) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V7m0 0V5m0 2h2m-2 0H10m10 5a8 8 0 11-16 0 8 8 0 0116 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">權限不足</h2>
        <p className="text-sm text-gray-500">此功能僅開放 Level 2（社畜）以上人員使用</p>
      </div>
    )
  }

  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]     = useState(CATEGORIES[0])
  const [file, setFile]             = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg]     = useState('')

  function handleFileChange(e) {
    const selected = e.target.files[0]
    if (!selected) return
    if (selected.size > 20 * 1024 * 1024) {
      setErrorMsg('檔案大小不可超過 20MB')
      e.target.value = ''
      return
    }
    setFile(selected)
    setErrorMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('請填寫標題'); return }
    if (!file)         { setErrorMsg('請選擇要上傳的檔案'); return }

    setUploading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      // 1. 上傳檔案至 Storage（路徑加時間戳避免重名）
      const ext      = file.name.split('.').pop()
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const filePath = `${Date.now()}_${safeName}`

      const { data: storageData, error: storageError } = await supabase.storage
        .from('business_files')
        .upload(filePath, file, { upsert: false })

      if (storageError) throw new Error('上傳檔案失敗：' + storageError.message)

      // 2. 取得公開 URL
      const { data: urlData } = supabase.storage
        .from('business_files')
        .getPublicUrl(storageData.path)

      const fileUrl = urlData.publicUrl

      // 3. 寫入 knowledge_base 資料表
      const { error: dbError } = await supabase
        .from('knowledge_base')
        .insert({
          title:       title.trim(),
          description: description.trim() || null,
          category,
          file_url:    fileUrl,
        })

      if (dbError) throw new Error('儲存資料失敗：' + dbError.message)

      // 4. 成功：清空表單
      setSuccessMsg(`「${title.trim()}」已成功上傳！`)
      setTitle('')
      setDescription('')
      setCategory(CATEGORIES[0])
      setFile(null)
      e.target.reset()

    } catch (err) {
      setErrorMsg(err.message || '發生錯誤，請再試一次')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">業務資料庫 — 上傳檔案</h2>
        <p className="text-sm text-gray-500 mt-1">上傳業務相關文件，供全體人員查閱參考</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

        {/* 標題 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            標題 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="請輸入文件標題"
            maxLength={100}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        {/* 簡介 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            簡介 <span className="text-gray-400 font-normal text-xs">（選填）</span>
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="簡短說明此文件用途..."
            maxLength={300}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
          />
        </div>

        {/* 分類 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            分類 <span className="text-red-500">*</span>
          </label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition cursor-pointer"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* 檔案選擇 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            檔案 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="file"
              accept={ACCEPT_TYPES}
              onChange={handleFileChange}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            支援 PDF、Word、Excel、PowerPoint、圖片，上限 20MB
          </p>
          {file && (
            <p className="text-xs text-blue-600 mt-1 font-medium">
              已選擇：{file.name}（{(file.size / 1024 / 1024).toFixed(2)} MB）
            </p>
          )}
        </div>

        {/* 錯誤 / 成功訊息 */}
        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="flex items-start gap-2 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {successMsg}
          </div>
        )}

        {/* 送出按鈕 */}
        <button
          type="submit"
          disabled={uploading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              上傳中...
            </span>
          ) : '上傳檔案'}
        </button>
      </form>
    </div>
  )
}
