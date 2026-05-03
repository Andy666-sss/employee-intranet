import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── 分類設定 ───────────────────────────────────────────────────
const CATEGORIES = [
  { name: '人事業務', bg: 'bg-blue-100', text: 'text-blue-700' },
  { name: '警務業務', bg: 'bg-red-100', text: 'text-red-700' },
  { name: '督訓業務', bg: 'bg-orange-100', text: 'text-orange-700' },
  { name: '後勤業務', bg: 'bg-green-100', text: 'text-green-700' },
  { name: '保防業務', bg: 'bg-purple-100', text: 'text-purple-700' },
  { name: '秘書、資訊業務', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { name: '分隊長', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { name: '其他', bg: 'bg-gray-100', text: 'text-gray-600' },
]
const CATEGORY_NAMES = CATEGORIES.map(c => c.name)
const CATEGORY_STYLE = Object.fromEntries(CATEGORIES.map(c => [c.name, c]))
const ACCEPT_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg'

// 從 Storage URL 取出原始檔名（去除時間戳前綴）
function getFilename(url) {
  if (!url) return '附件'
  const raw = decodeURIComponent(url.split('/').pop().split('?')[0])
  return raw.replace(/^\d+_/, '')
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  })
}

// ── 詳細資料 Modal ─────────────────────────────────────────────
function DetailModal({ item, onClose }) {
  const catStyle = CATEGORY_STYLE[item.category] || { bg: 'bg-gray-100', text: 'text-gray-600' }

  // 按下 Backdrop 關閉
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        onClick={handleBackdrop}
      >
        <div
          className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col"
          style={{ width: '66vw', height: '66vh', minWidth: '320px', maxWidth: '860px' }}
        >

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${catStyle.bg} ${catStyle.text}`}>
                  {item.category}
                </span>
                <time className="text-xs text-gray-400">{formatDate(item.created_at)}</time>
              </div>
              <h3 className="text-base font-semibold text-gray-900 leading-snug text-left">{item.title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 cursor-pointer transition shrink-0 mt-0.5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body：只能上下捲動，禁止左右捲動 */}
          <div className="px-6 py-5 overflow-y-auto overflow-x-hidden flex-1 space-y-5">

            {/* 內容 */}
            {item.description ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words text-left w-full">
                {item.description}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic text-left">（無內容）</p>
            )}

            {/* 附件 */}
            {item.file_url && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 text-left">附件</p>
                <a
                  href={item.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a3 3 0 016 0v4a3 3 0 11-6 0V7a5 5 0 0110 0v4a1 1 0 11-2 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                  </svg>
                  <span className="break-all">{getFilename(item.file_url)}</span>
                </a>
              </div>
            )}

            {/* 上傳者 */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 text-left">
                上傳者：
                <span className="text-gray-600 font-medium ml-1">
                  {item.uploader_name || '未知'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── 上傳 Modal ─────────────────────────────────────────────────
function UploadModal({ currentUser, onClose, onSuccess }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState(CATEGORY_NAMES[0])
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setErrorMsg('檔案大小不可超過 20MB')
      e.target.value = ''
      return
    }
    setFile(f)
    setErrorMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('請填寫標題'); return }
    if (!content.trim()) { setErrorMsg('請填寫內容'); return }

    setUploading(true)
    setErrorMsg('')

    try {
      let fileUrl = null

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const filePath = `${Date.now()}_${safeName}`
        const { data: storageData, error: storageError } = await supabase.storage
          .from('business_files')
          .upload(filePath, file, { upsert: false })
        if (storageError) throw new Error('附件上傳失敗：' + storageError.message)
        const { data: urlData } = supabase.storage
          .from('business_files')
          .getPublicUrl(storageData.path)
        fileUrl = urlData.publicUrl
      }

      const { error: dbError } = await supabase.from('knowledge_base').insert({
        title: title.trim(),
        description: content.trim(),
        category,
        file_url: fileUrl,
        user_id: currentUser?.user?.id ?? null,
      })
      if (dbError) throw new Error('儲存失敗：' + dbError.message)

      onSuccess()
    } catch (err) {
      setErrorMsg(err.message || '發生錯誤，請再試一次')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h3 className="text-base font-semibold text-gray-900">新增業務資料</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* 標題 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                標題 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="請輸入標題"
                maxLength={100}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
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
                {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* 內容（主角） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                內容 <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={7}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="請輸入詳細說明、注意事項或業務內容..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none leading-relaxed"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{content.length} 字</p>
            </div>

            {/* 附件（選填，置於底部） */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                附件
                <span className="ml-1.5 text-xs text-gray-400 font-normal">（選填）</span>
              </label>
              <input
                type="file"
                accept={ACCEPT_TYPES}
                onChange={handleFileChange}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-gray-50"
              />
              <p className="text-xs text-gray-400 mt-1">PDF、Word、Excel、PPT、圖片，上限 20MB</p>
              {file && (
                <p className="text-xs text-blue-600 mt-1.5 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a3 3 0 016 0v4a3 3 0 11-6 0V7a5 5 0 0110 0v4a1 1 0 11-2 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                  </svg>
                  {file.name}（{(file.size / 1024 / 1024).toFixed(2)} MB）
                </p>
              )}
            </div>

            {/* 錯誤訊息 */}
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
              <button
                type="submit"
                disabled={uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    儲存中...
                  </span>
                ) : '確認新增'}
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
  const [items, setItems] = useState([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [showUpload, setShowUpload] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const canUpload = (currentUser?.level ?? 0) >= 2

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setFetching(true)
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('id, title, description, category, file_url, created_at, user_id')
      .order('created_at', { ascending: false })

    if (!error && data) {
      // 取得所有上傳者的姓名
      const userIds = [...new Set(data.map(d => d.user_id).filter(Boolean))]
      let nameMap = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds)
        if (profiles) {
          profiles.forEach(p => { nameMap[p.id] = p.name })
        }
      }
      setItems(data.map(item => ({
        ...item,
        uploader_name: nameMap[item.user_id] || null,
      })))
    }
    setFetching(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      const matchSearch = !q
        || item.title.toLowerCase().includes(q)
        || (item.description || '').toLowerCase().includes(q)
      const matchCat = activeCategory === '全部' || item.category === activeCategory
      return matchSearch && matchCat
    })
  }, [items, search, activeCategory])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* ── 頁首 ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">業務資料庫</h2>
          <p className="text-sm text-gray-500 mt-0.5">共 {items.length} 筆資料</p>
        </div>
        {canUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增資料
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
          placeholder="搜尋標題或內容..."
          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-sm"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L10 8.586l1.293-1.293a1 1 0 101.414 1.414L11.414 10l1.293 1.293a1 1 0 01-1.414 1.414L10 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L8.586 10 7.293 8.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* ── 分類篩選 ── */}
      <div className="flex gap-2 flex-wrap mb-6">
        {['全部', ...CATEGORY_NAMES].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition border',
              activeCategory === cat
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600',
            ].join(' ')}
          >
            {cat}
          </button>
        ))}
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
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-5 cursor-pointer"
              >
                {/* 分類 + 日期 */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${catStyle.bg} ${catStyle.text}`}>
                    {item.category}
                  </span>
                  <time className="text-[11px] text-gray-400">{formatDate(item.created_at)}</time>
                </div>

                {/* 標題 */}
                <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-2">
                  {item.title}
                </h3>

                {/* 內容預覽 */}
                {item.description && (
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap flex-1 line-clamp-5">
                    {item.description}
                  </p>
                )}

                {/* 底部：上傳者 + 附件圖示 */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400 truncate">
                    {item.uploader_name ? `上傳者：${item.uploader_name}` : ''}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.file_url && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a3 3 0 016 0v4a3 3 0 11-6 0V7a5 5 0 0110 0v4a1 1 0 11-2 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                        </svg>
                        附件
                      </span>
                    )}
                    <span className="text-[11px] text-blue-400 font-medium">查看詳情 →</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 詳細資料 Modal ── */}
      {selectedItem && (
        <DetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* ── 上傳 Modal ── */}
      {showUpload && (
        <UploadModal
          currentUser={currentUser}
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); fetchItems() }}
        />
      )}
    </div>
  )
}
