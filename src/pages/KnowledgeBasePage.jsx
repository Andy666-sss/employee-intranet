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

/**
 * file_url 欄位格式（三種，由舊到新）：
 *   1. 舊版單一 URL 字串：  "https://..."
 *   2. 舊版 URL 陣列字串：  '["https://...","https://..."]'
 *   3. 新版物件陣列字串：   '[{"url":"...","name":"吉卜賽.pdf"},...]'
 *
 * parseFileEntries 統一解析成 Array<{url, name}>
 */
function parseFileEntries(fileUrlField) {
  if (!fileUrlField) return []
  try {
    const parsed = JSON.parse(fileUrlField)
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        if (typeof item === 'string') {
          // 舊版 URL 字串 → 從 URL 取得檔名（無中文也無妨）
          return { url: item, name: fallbackName(item) }
        }
        return item // 已是 {url, name}
      })
    }
  } catch {}
  // 最舊的純字串
  return [{ url: fileUrlField, name: fallbackName(fileUrlField) }]
}

// 從 URL 提取檔名（去除時間戳前綴，不含中文的舊資料用）
function fallbackName(url) {
  if (!url) return '附件'
  const raw = url.split('/').pop().split('?')[0]
  try { return decodeURIComponent(raw).replace(/^\d+_/, '') }
  catch { return raw.replace(/^\d+_/, '') }
}

// 從公開 URL 取出 Storage 路徑（用於刪除舊檔案）
function getStoragePath(url) {
  if (!url) return null
  const parts = url.split('/business_files/')
  if (parts.length < 2) return null
  try { return decodeURIComponent(parts[1].split('?')[0]) }
  catch { return parts[1].split('?')[0] }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  })
}

function canModify(item, currentUser) {
  const isOwner = item?.user_id && String(item.user_id) === String(currentUser?.user?.id)
  const isAdmin = (currentUser?.level ?? 0) >= 3
  return isOwner || isAdmin
}

// 上傳單一檔案：Storage 路徑用純 ASCII，原始檔名存入回傳物件
async function uploadFile(file) {
  // 去除非 ASCII 字元作為儲存路徑，但保留副檔名
  const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const filePath = `${Date.now()}_${safeName}`

  const { data, error } = await supabase.storage
    .from('business_files')
    .upload(filePath, file, { upsert: false })
  if (error) throw new Error(`「${file.name}」上傳失敗：${error.message}`)

  const { data: urlData } = supabase.storage.from('business_files').getPublicUrl(data.path)
  // 回傳 {url, name}：name 保留原始中文檔名供顯示用
  return { url: urlData.publicUrl, name: file.name }
}

async function deleteStorageFile(url) {
  const path = getStoragePath(url)
  if (path) await supabase.storage.from('business_files').remove([path])
}

// ── 附件清單（共用） ───────────────────────────────────────────
function FileList({ entries }) {
  if (!entries.length) return null
  return (
    <ul className="space-y-1.5">
      {entries.map((entry, i) => (
        <li key={i}>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a3 3 0 016 0v4a3 3 0 11-6 0V7a5 5 0 0110 0v4a1 1 0 11-2 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
            </svg>
            <span className="break-all">{entry.name}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

// ── 附件選擇器（上傳/編輯共用） ────────────────────────────────
function FilePickerSection({ newFiles, onAdd, onRemove, hint }) {
  function handleChange(e) {
    const selected = Array.from(e.target.files)
    const oversized = selected.filter(f => f.size > 20 * 1024 * 1024)
    if (oversized.length) alert(`以下檔案超過 20MB 上限，已略過：\n${oversized.map(f => f.name).join('\n')}`)
    const valid = selected.filter(f => f.size <= 20 * 1024 * 1024)
    if (valid.length) onAdd(valid)
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept={ACCEPT_TYPES}
        multiple
        onChange={handleChange}
        className="w-full text-sm text-gray-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50"
      />
      <p className="text-xs text-gray-400">{hint || 'PDF、Word、Excel、PPT、圖片，每個上限 20MB，可多選'}</p>
      {newFiles.length > 0 && (
        <ul className="space-y-1">
          {newFiles.map((f, i) => (
            <li key={i} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
              <span className="text-xs text-blue-700 truncate max-w-[260px]">{f.name}</span>
              <button type="button" onClick={() => onRemove(i)}
                className="text-xs text-blue-400 hover:text-red-500 cursor-pointer shrink-0 ml-2 transition">
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 詳細資料 Modal ─────────────────────────────────────────────
function DetailModal({ item, currentUser, onClose, onEdit, onDelete }) {
  const catStyle = CATEGORY_STYLE[item.category] || { bg: 'bg-gray-100', text: 'text-gray-600' }
  const canAct = canModify(item, currentUser)
  const entries = parseFileEntries(item.file_url)

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={handleBackdrop}>
        <div
          className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col"
          style={{ width: '66vw', height: '66vh', minWidth: '320px', maxWidth: '860px' }}
        >
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
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-5 overflow-y-auto overflow-x-hidden flex-1 space-y-5">
            {item.description
              ? <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words text-left w-full">{item.description}</p>
              : <p className="text-sm text-gray-400 italic text-left">（無內容）</p>
            }

            {entries.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 text-left">
                  附件（{entries.length} 個）
                </p>
                <FileList entries={entries} />
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 text-left">
                上傳者：<span className="text-gray-600 font-medium ml-1">{item.uploader_name || '未知'}</span>
              </p>
            </div>
          </div>

          {canAct && (
            <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2">
              <button onClick={onEdit}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                編輯
              </button>
              <button onClick={onDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg cursor-pointer transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                刪除
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── 編輯 Modal ─────────────────────────────────────────────────
function EditModal({ item, onClose, onSuccess }) {
  const initialEntries = parseFileEntries(item.file_url)
  const [title, setTitle] = useState(item.title || '')
  const [content, setContent] = useState(item.description || '')
  const [category, setCategory] = useState(item.category || CATEGORY_NAMES[0])
  const [keptEntries, setKeptEntries] = useState(initialEntries)
  const [newFiles, setNewFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('請填寫標題'); return }
    if (!content.trim()) { setErrorMsg('請填寫內容'); return }

    setSaving(true)
    setErrorMsg('')

    try {
      // 刪除被移除的舊附件
      const removedEntries = initialEntries.filter(e => !keptEntries.some(k => k.url === e.url))
      await Promise.all(removedEntries.map(e => deleteStorageFile(e.url)))

      // 上傳新附件（回傳 {url, name}）
      const uploadedEntries = await Promise.all(newFiles.map(uploadFile))

      const allEntries = [...keptEntries, ...uploadedEntries]
      const fileUrlValue = allEntries.length === 0 ? null : JSON.stringify(allEntries)

      const { error: dbError } = await supabase
        .from('knowledge_base')
        .update({ title: title.trim(), description: content.trim(), category, file_url: fileUrlValue })
        .eq('id', item.id)
      if (dbError) throw new Error('更新失敗：' + dbError.message)

      onSuccess()
    } catch (err) {
      setErrorMsg(err.message || '發生錯誤，請再試一次')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-60" onClick={onClose} />
      <div className="fixed inset-0 z-70 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[92vh] flex flex-col">

          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h3 className="text-base font-semibold text-gray-900">編輯業務資料</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">標題 <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">分類 <span className="text-red-500">*</span></label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition cursor-pointer">
                {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">內容 <span className="text-red-500">*</span></label>
              <textarea rows={7} value={content} onChange={e => setContent(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none leading-relaxed" />
              <p className="text-xs text-gray-400 mt-1 text-right">{content.length} 字</p>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                附件<span className="ml-1.5 text-xs text-gray-400 font-normal">（選填，可多個）</span>
              </label>

              {keptEntries.length > 0 && (
                <ul className="space-y-1">
                  {keptEntries.map(entry => (
                    <li key={entry.url} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200">
                      <span className="text-xs text-gray-600 truncate max-w-[260px]">{entry.name}</span>
                      <button type="button"
                        onClick={() => setKeptEntries(prev => prev.filter(e => e.url !== entry.url))}
                        className="text-xs text-red-400 hover:text-red-600 cursor-pointer shrink-0 ml-2 transition">
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <FilePickerSection
                newFiles={newFiles}
                onAdd={files => setNewFiles(prev => [...prev, ...files])}
                onRemove={i => setNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                hint="選擇要新增的附件（可多選）"
              />
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {errorMsg}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed">
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    儲存中...
                  </span>
                ) : '儲存變更'}
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

// ── 上傳 Modal ─────────────────────────────────────────────────
function UploadModal({ currentUser, onClose, onSuccess }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState(CATEGORY_NAMES[0])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setErrorMsg('請填寫標題'); return }
    if (!content.trim()) { setErrorMsg('請填寫內容'); return }

    setUploading(true)
    setErrorMsg('')

    try {
      // uploadFile 回傳 {url, name}，保留原始中文檔名
      const entries = await Promise.all(files.map(uploadFile))
      const fileUrlValue = entries.length === 0 ? null : JSON.stringify(entries)

      const { error: dbError } = await supabase.from('knowledge_base').insert({
        title: title.trim(),
        description: content.trim(),
        category,
        file_url: fileUrlValue,
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

          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h3 className="text-base font-semibold text-gray-900">新增業務資料</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">標題 <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="請輸入標題" maxLength={100}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">分類 <span className="text-red-500">*</span></label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition cursor-pointer">
                {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">內容 <span className="text-red-500">*</span></label>
              <textarea rows={7} value={content} onChange={e => setContent(e.target.value)}
                placeholder="請輸入詳細說明、注意事項或業務內容..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none leading-relaxed" />
              <p className="text-xs text-gray-400 mt-1 text-right">{content.length} 字</p>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                附件<span className="ml-1.5 text-xs text-gray-400 font-normal">（選填，可多個）</span>
              </label>
              <FilePickerSection
                newFiles={files}
                onAdd={newOnes => setFiles(prev => [...prev, ...newOnes])}
                onRemove={i => setFiles(prev => prev.filter((_, idx) => idx !== i))}
              />
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {errorMsg}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    上傳中...
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
  const [editingItem, setEditingItem] = useState(null)
  const canUpload = (currentUser?.level ?? 0) >= 2

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setFetching(true)
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('id, title, description, category, file_url, created_at, user_id')
      .order('created_at', { ascending: false })

    if (!error && data) {
      const userIds = [...new Set(data.map(d => d.user_id).filter(Boolean))]
      let nameMap = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds)
        if (profiles) profiles.forEach(p => { nameMap[p.id] = p.name })
      }
      setItems(data.map(item => ({ ...item, uploader_name: nameMap[item.user_id] || null })))
    }
    setFetching(false)
  }

  async function handleDelete(item) {
    if (!window.confirm(`確定要刪除「${item.title}」嗎？此操作無法復原。`)) return
    const entries = parseFileEntries(item.file_url)
    await Promise.all(entries.map(e => deleteStorageFile(e.url)))
    const { error } = await supabase.from('knowledge_base').delete().eq('id', item.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    setSelectedItem(null)
    await fetchItems()
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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">業務資料庫</h2>
          <p className="text-sm text-gray-500 mt-0.5">共 {items.length} 筆資料</p>
        </div>
        {canUpload && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增資料
          </button>
        )}
      </div>

      <div className="relative mb-4">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋標題或內容..."
          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-sm" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L10 8.586l1.293-1.293a1 1 0 101.414 1.414L11.414 10l1.293 1.293a1 1 0 01-1.414 1.414L10 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L8.586 10 7.293 8.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {['全部', ...CATEGORY_NAMES].map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition border',
              activeCategory === cat
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600',
            ].join(' ')}>
            {cat}
          </button>
        ))}
      </div>

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
            const fileCount = parseFileEntries(item.file_url).length
            return (
              <div key={item.id} onClick={() => setSelectedItem(item)}
                className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-5 cursor-pointer text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${catStyle.bg} ${catStyle.text}`}>
                    {item.category}
                  </span>
                  <time className="text-[11px] text-gray-400">{formatDate(item.created_at)}</time>
                </div>

                <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-2 text-left">
                  {item.title}
                </h3>

                {item.description && (
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap flex-1 line-clamp-5 text-left">
                    {item.description}
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400 truncate">
                    {item.uploader_name ? `上傳者：${item.uploader_name}` : ''}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {fileCount > 0 && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a3 3 0 016 0v4a3 3 0 11-6 0V7a5 5 0 0110 0v4a1 1 0 11-2 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                        </svg>
                        附件{fileCount > 1 ? ` ${fileCount}` : ''}
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

      {selectedItem && !editingItem && (
        <DetailModal
          item={selectedItem} currentUser={currentUser}
          onClose={() => setSelectedItem(null)}
          onEdit={() => setEditingItem(selectedItem)}
          onDelete={() => handleDelete(selectedItem)}
        />
      )}

      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={async () => { setEditingItem(null); setSelectedItem(null); await fetchItems() }}
        />
      )}

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
