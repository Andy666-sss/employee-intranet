import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── 分類設定（名稱 + 顏色） ────────────────────────────────────
const CATEGORIES = [
  { name: '人事業務', bg: 'bg-blue-100',   text: 'text-blue-700'   },
  { name: '警務業務', bg: 'bg-red-100',    text: 'text-red-700'    },
  { name: '督訓業務', bg: 'bg-orange-100', text: 'text-orange-700' },
  { name: '後勤業務', bg: 'bg-green-100',  text: 'text-green-700'  },
  { name: '教育業務', bg: 'bg-purple-100', text: 'text-purple-700' },
  { name: '偵查業務', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { name: '行政業務', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { name: '其他',     bg: 'bg-gray-100',   text: 'text-gray-600'   },
]
const CATEGORY_NAMES  = CATEGORIES.map(c => c.name)
const CATEGORY_STYLE  = Object.fromEntries(CATEGORIES.map(c => [c.name, c]))
const ACCEPT_TYPES    = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg'

// ── 檔案類型圖示 ───────────────────────────────────────────────
function FileTypeIcon({ url }) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase()
  if (ext === 'pdf') return (
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 shrink-0">
      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    </span>
  )
  if (['doc','docx'].includes(ext)) return (
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 shrink-0">
      <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    </span>
  )
  if (['xls','xlsx'].includes(ext)) return (
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-50 shrink-0">
      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 3a1 1 0 000 2h10a1 1 0 000-2H5zm0 4a1 1 0 000 2h10a1 1 0 000-2H5z" clipRule="evenodd" />
      </svg>
    </span>
  )
  if (['jpg','jpeg','png','gif'].includes(ext)) return (
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-pink-50 shrink-0">
      <svg className="w-5 h-5 text-pink-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    </span>
  )
  return (
    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 shrink-0">
      <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    </span>
  )
}

// ── 上傳 Modal ─────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }) {
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]     = useState(CATEGORY_NAMES[0])
  const [file, setFile]             = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [errorMsg, setErrorMsg]     = useState('')

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { setErrorMsg('檔案大小不可超過 20MB'); e.target.value = ''; return }
    setFile(f)
    setErrorMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('請填寫標題'); return }
    if (!file)         { setErrorMsg('請選擇要上傳的檔案'); return }
    setUploading(true)
    setErrorMsg('')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const filePath = `${Date.now()}_${safeName}`
      const { data: storageData, error: storageError } = await supabase.storage
        .from('business_files').upload(filePath, file, { upsert: false })
      if (storageError) throw new Error('上傳檔案失敗：' + storageError.message)

      const { data: urlData } = supabase.storage
        .from('business_files').getPublicUrl(storageData.path)

      const { error: dbError } = await supabase.from('knowledge_base').insert({
        title: title.trim(),
        description: description.trim() || null,
        category,
        file_url: urlData.publicUrl,
      })
      if (dbError) throw new Error('儲存資料失敗：' + dbError.message)
      onSuccess()
    } catch (err) {
      setErrorMsg(err.message || '發生錯誤，請再試一次')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">上傳新檔案</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* 標題 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">標題 <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="請輸入文件標題" maxLength={100}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
            </div>
            {/* 簡介 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">簡介 <span className="text-xs text-gray-400 font-normal">（選填）</span></label>
              <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="簡短說明此文件用途..." maxLength={300}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none" />
            </div>
            {/* 分類 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">分類 <span className="text-red-500">*</span></label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition cursor-pointer">
                {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* 檔案 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">檔案 <span className="text-red-500">*</span></label>
              <input type="file" accept={ACCEPT_TYPES} onChange={handleFileChange}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 file:cursor-pointer border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none" />
              <p className="text-xs text-gray-400 mt-1">PDF、Word、Excel、PPT、圖片，上限 20MB</p>
              {file && <p className="text-xs text-blue-600 mt-1 font-medium">已選擇：{file.name}（{(file.size/1024/1024).toFixed(2)} MB）</p>}
            </div>
            {/* 錯誤 */}
            {errorMsg && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {errorMsg}
              </div>
            )}
            {/* 按鈕 */}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>上傳中...
                  </span>
                ) : '確認上傳'}
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg text-sm transition cursor-pointer">
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

// ── 主組件 ────────────────────────────────────────────────────
export default function KnowledgeBasePage({ currentUser }) {
  const [items, setItems]               = useState([])
  const [fetching, setFetching]         = useState(true)
  const [search, setSearch]             = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [showUpload, setShowUpload]     = useState(false)
  const canUpload = (currentUser?.level ?? 0) >= 2

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setFetching(true)
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('id, title, description, category, file_url, created_at')
      .order('created_at', { ascending: false })
    if (!error) setItems(data || [])
    setFetching(false)
  }

  // 本機篩選：搜尋 + 分類
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      const matchSearch = !q
        || item.title.toLowerCase().includes(q)
        || (item.description || '').toLowerCase().includes(q)
      const matchCategory = activeCategory === '全部' || item.category === activeCategory
      return matchSearch && matchCategory
    })
  }, [items, search, activeCategory])

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* ── 頁首 ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">業務資料庫</h2>
          <p className="text-sm text-gray-500 mt-0.5">共 {items.length} 份文件</p>
        </div>
        {canUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            上傳新檔案
          </button>
        )}
      </div>

      {/* ── 搜尋框 ── */}
      <div className="relative mb-4">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜尋標題或簡介..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-sm"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L10 8.586l1.293-1.293a1 1 0 101.414 1.414L11.414 10l1.293 1.293a1 1 0 01-1.414 1.414L10 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L8.586 10 7.293 8.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* ── 分類篩選按鈕 ── */}
      <div className="flex gap-2 flex-wrap mb-6">
        {['全部', ...CATEGORY_NAMES].map(cat => {
          const isActive = activeCategory === cat
          const style = cat !== '全部' ? CATEGORY_STYLE[cat] : null
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition border',
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600',
              ].join(' ')}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* ── 資料列表 ── */}
      {fetching ? (
        <div className="text-center py-20 text-gray-400 text-sm">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400 text-sm">查無符合的資料</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const catStyle = CATEGORY_STYLE[item.category] || { bg: 'bg-gray-100', text: 'text-gray-600' }
            return (
              <a
                key={item.id}
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-5 cursor-pointer"
              >
                {/* 圖示 + 分類 */}
                <div className="flex items-start justify-between mb-3">
                  <FileTypeIcon url={item.file_url} />
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${catStyle.bg} ${catStyle.text}`}>
                    {item.category}
                  </span>
                </div>

                {/* 標題 */}
                <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1.5 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {item.title}
                </h3>

                {/* 簡介 */}
                {item.description && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3 flex-1">
                    {item.description}
                  </p>
                )}

                {/* 底部：日期 + 開啟提示 */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                  <span className="text-[11px] text-gray-400">{formatDate(item.created_at)}</span>
                  <span className="text-[11px] text-blue-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    點擊開啟 →
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* ── 上傳 Modal ── */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); fetchItems() }}
        />
      )}
    </div>
  )
}
