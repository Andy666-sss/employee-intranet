import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

// 可自行增減班別選項
const SHIFTS = ['○', '休假', '補休', '公假', '事假', '病假', '喪假',
  '婚假', '陪產假', '管控日1', '管控夜1', '管控日2', '待1', '休1', '休2',
  '17退', '18署', '18退2', '20退1', '20起'
]

// 班別顏色定義
const SHIFT_COLORS = {
  '○': 'bg-yellow-200 text-gray-900',
  '休假': 'bg-gray-300 text-gray-900',
  '補休': 'bg-blue-200 text-gray-900',
  '公假': 'bg-green-200 text-gray-900',
  '事假': 'bg-red-300 text-white',
  '病假': 'bg-orange-200 text-gray-900',
  '喪假': 'bg-purple-300 text-white',
  '婚假': 'bg-pink-300 text-white',
  '陪產假': 'bg-indigo-300 text-white',
  '管控日1': 'bg-blue-600 text-white',
  '管控日2': 'bg-blue-700 text-white',
  '管控夜1': 'bg-red-700 text-white',
  '待1': 'bg-gray-400 text-gray-900',
  '休1': 'bg-slate-300 text-gray-900',
  '休2': 'bg-slate-400 text-gray-900',
  '17退': 'bg-red-500 text-white',
  '18署': 'bg-red-700 text-white',
  '18退2': 'bg-blue-400 text-white',
  '20退1': 'bg-blue-500 text-white',
  '20起': 'bg-red-500 text-white',
}

export default function SchedulePage({ currentUser }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [employees, setEmployees] = useState([])
  const [scheduleMap, setScheduleMap] = useState({})   // "employeeId_day" → shift
  const [savingKey, setSavingKey] = useState(null)
  const [popup, setPopup] = useState(null)
  const [myEmployeeId, setMyEmployeeId] = useState(null)
  const [uploadPreview, setUploadPreview] = useState(null)  // { records, filename }
  const [uploading, setUploading] = useState(false)

  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  useEffect(() => { fetchData() }, [year, month])

  // ── 上傳班表（解析 Excel，預覽後確認匯入）──────────────
  async function handleFileSelect(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

      // Row index 3 = 日期列（Excel序列號，從第4欄開始）
      const dateRow = data[3] || []
      const dateMap = []   // [{ col, iso }]
      for (let col = 3; col < dateRow.length; col++) {
        const serial = dateRow[col]
        if (typeof serial === 'number' && serial > 40000) {
          const d = new Date((serial - 25569) * 86400 * 1000)
          dateMap.push({ col, iso: d.toISOString().split('T')[0] })
        }
      }

      // 用番號對應 employees
      const empByBadge = {}
      employees.forEach(e => { empByBadge[Number(e.badge_number)] = e.id })

      // 解析每個員工的班別
      const records = []
      data.slice(5).forEach(row => {
        const badge = Number(row[0])
        if (!badge || !empByBadge[badge]) return
        const empId = empByBadge[badge]
        dateMap.forEach(({ col, iso }) => {
          const shift = row[col]
          if (shift && String(shift).trim()) {
            records.push({ employee_id: empId, date: iso, shift: String(shift).trim() })
          }
        })
      })

      // 去重：同一員工同一日期只保留最後一筆
      const seen = new Map()
      records.forEach(r => { seen.set(`${r.employee_id}_${r.date}`, r) })
      const deduped = Array.from(seen.values())

      setUploadPreview({ records: deduped, filename: file.name })
    }
    reader.readAsBinaryString(file)
  }

  async function handleClearMonth() {
    if (!window.confirm(`確定要清空 ${year} 年 ${month} 月的所有班表嗎？此動作無法復原。`)) return
    const pad = (n) => String(n).padStart(2, '0')
    const startDate = `${year}-${pad(month)}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${pad(month)}-${pad(lastDay)}`
    const { error } = await supabase
      .from('schedules')
      .delete()
      .gte('date', startDate)
      .lte('date', endDate)
    if (error) { alert('清空失敗：' + error.message); return }
    await fetchData()
  }

  async function confirmUpload() {
    if (!uploadPreview) return
    setUploading(true)
    const { records } = uploadPreview
    if (records.length === 0) { setUploading(false); return }

    // 取得本次上傳涵蓋的年月（可能跨月）
    const months = [...new Set(records.map(r => r.date.slice(0, 7)))]

    // 只刪除「這次 Excel 裡有的員工」的舊資料，不影響其他人
    const pad = (n) => String(n).padStart(2, '0')
    const empIds = [...new Set(records.map(r => r.employee_id))]
    for (const ym of months) {
      const [y, m] = ym.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const { error: delError } = await supabase
        .from('schedules')
        .delete()
        .gte('date', `${ym}-01`)
        .lte('date', `${ym}-${pad(lastDay)}`)
        .in('employee_id', empIds)
      if (delError) { alert('清除舊資料失敗：' + delError.message); setUploading(false); return }
    }

    // 分批寫入新資料
    const BATCH = 200
    for (let i = 0; i < records.length; i += BATCH) {
      const { error } = await supabase
        .from('schedules')
        .insert(records.slice(i, i + BATCH))
      if (error) { alert('匯入失敗：' + error.message); setUploading(false); return }
    }

    setUploadPreview(null)
    setUploading(false)
    await fetchData()
  }

  // ── 下載班表（產生 xlsx）──────────────────────────────
  function handleDownload() {
    const pad = (n) => String(n).padStart(2, '0')
    const title = `${year}年${month}月班表`

    // 標題列
    const header = ['番號', '職稱', '姓名', ...days.map(d => d)]
    const rows = employees.map(emp => {
      const shifts = days.map(d => scheduleMap[`${emp.id}_${d}`] || '')
      return [emp.badge_number, emp.title, emp.name, ...shifts]
    })

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])

    // 欄寬設定
    ws['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 8 },
      ...days.map(() => ({ wch: 5 }))
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, title)
    XLSX.writeFile(wb, `${title}.xlsx`)
  }

  useEffect(() => {
    if (!popup) return
    const onKey = (e) => { if (e.key === 'Escape') setPopup(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popup])

  async function fetchData() {
    // 讀取所有員工（含番號、職稱）
    const { data: empData } = await supabase
      .from('employees')
      .select('id, badge_number, title, name, user_id')
      .order('sort_order', { ascending: true })
    setEmployees(empData || [])

    // 記錄目前登入者對應的員工 ID
    const me = empData?.find(e => e.user_id === currentUser.user.id)
    setMyEmployeeId(me?.id ?? null)

    // 讀取當月班表
    const pad = (n) => String(n).padStart(2, '0')
    const startDate = `${year}-${pad(month)}-01`
    const endDate = `${year}-${pad(month)}-${pad(daysInMonth)}`

    let allSchedData = []
    let fromIndex = 0
    const pageSize = 1000

    while (true) {
      const { data: schedData, error } = await supabase
        .from('schedules')
        .select('employee_id, date, shift')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(fromIndex, fromIndex + pageSize - 1)

      if (error || !schedData || schedData.length === 0) break

      allSchedData = allSchedData.concat(schedData)

      if (schedData.length < pageSize) break
      fromIndex += pageSize
    }

    const map = {}
    allSchedData.forEach((s) => {
      const day = parseInt(s.date.split('-')[2], 10)
      map[`${s.employee_id}_${day}`] = s.shift
    })
    setScheduleMap(map)
  }

  async function handleShiftChange(emp, day, shift) {
    if (!myEmployeeId || emp.id !== myEmployeeId) return
    const key = `${emp.id}_${day}`
    setSavingKey(key)
    setScheduleMap((prev) => ({ ...prev, [key]: shift }))

    const pad = (n) => String(n).padStart(2, '0')
    const dateStr = `${year}-${pad(month)}-${pad(day)}`
    const { error } = await supabase.from('schedules').upsert(
      { employee_id: emp.id, date: dateStr, shift },
      { onConflict: 'employee_id,date' }
    )
    if (error) {
      setScheduleMap((prev) => { const r = { ...prev }; delete r[key]; return r })
      alert('儲存失敗，請再試一次。')
    }
    setSavingKey(null)
  }

  function handleCellClick(e, emp, day) {
    if (emp.id !== myEmployeeId) return
    const rect = e.currentTarget.getBoundingClientRect()
    setPopup({ emp, day, x: rect.left, y: rect.bottom + 6 })
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }
  function getDayLabel(day) {
    return ['日', '一', '二', '三', '四', '五', '六'][new Date(year, month - 1, day).getDay()]
  }
  function isWeekend(day) {
    const dow = new Date(year, month - 1, day).getDay()
    return dow === 0 || dow === 6
  }
  function isToday(day) {
    return year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate()
  }

  // 三個固定欄的寬度（px）
  const W_BADGE = 40   // 番號
  const W_TITLE = 72   // 職稱
  const W_NAME = 76   // 姓名
  const W_DAY = 50   // 每日欄

  return (
    <div className="px-4 py-6">
      {/* 標題 + 月份切換 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">班表</h2>
          <p className="text-xs text-gray-500 mt-1">點格子即可修改班別</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* 管理員專屬：上傳 / 下載 */}
          {currentUser.level >= 3 && (
            <>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                上傳班表
                <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileSelect} hidden />
              </label>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                下載班表
              </button>
              <button
                onClick={handleClearMonth}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50 cursor-pointer transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                清空當月
              </button>
            </>
          )}
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition">‹</button>
          <span className="text-sm font-medium text-gray-700 w-24 text-center">{year} 年 {month} 月</span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition">›</button>
        </div>
      </div>

      {/* 班表 */}
      <div className="rounded-xl border border-gray-200 shadow-sm bg-white" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
        <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr className="bg-gray-50">
              {/* 番號 */}
              <th style={{ position: 'sticky', left: 0, top: 0, minWidth: W_BADGE, zIndex: 40, background: '#f9fafb' }}
                className="border-b border-r border-gray-200 px-1 py-2 text-center font-medium text-gray-600">
                番號
              </th>
              {/* 職稱 */}
              <th style={{ position: 'sticky', left: W_BADGE, top: 0, minWidth: W_TITLE, zIndex: 40, background: '#f9fafb' }}
                className="border-b border-r border-gray-200 px-1 py-2 text-center font-medium text-gray-600">
                職稱
              </th>
              {/* 姓名 */}
              <th style={{ position: 'sticky', left: W_BADGE + W_TITLE, top: 0, minWidth: W_NAME, zIndex: 40, background: '#f9fafb' }}
                className="border-b border-r border-gray-200 px-1 py-2 text-center font-medium text-gray-600">
                姓名
              </th>
              {/* 日期 */}
              {days.map((d) => (
                <th key={d} style={{
                  position: 'sticky', top: 0, width: W_DAY, minWidth: W_DAY, zIndex: 25,
                  background: isToday(d) ? '#2563eb' : isWeekend(d) ? '#fff1f2' : '#f9fafb'
                }}
                  className={[
                    'border-b border-r border-gray-200 px-0 py-1.5 text-center font-medium',
                    isToday(d) ? 'text-white' : isWeekend(d) ? 'text-red-500' : 'text-gray-600',
                  ].join(' ')}>
                  <div>{d}</div>
                  <div className="font-normal opacity-70">{getDayLabel(d)}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {employees.map((emp, idx) => {
              const isOwn = emp.id === myEmployeeId
              const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fafb'
              return (
                <tr key={emp.id}>
                  {/* 番號 */}
                  <td style={{ position: 'sticky', left: 0, minWidth: W_BADGE, zIndex: 10, background: isOwn ? '#3b82f6' : rowBg }}
                    className={`border-b border-r border-gray-200 text-center font-medium py-1 ${isOwn ? 'text-white' : 'text-gray-500'}`}>
                    {emp.badge_number}
                  </td>
                  {/* 職稱 */}
                  <td style={{ position: 'sticky', left: W_BADGE, minWidth: W_TITLE, zIndex: 10, background: isOwn ? '#3b82f6' : rowBg }}
                    className={`border-b border-r border-gray-200 px-2 py-1 text-center whitespace-nowrap ${isOwn ? 'text-white font-medium' : 'text-gray-600'}`}>
                    {emp.title}
                  </td>
                  {/* 姓名 */}
                  <td style={{ position: 'sticky', left: W_BADGE + W_TITLE, minWidth: W_NAME, zIndex: 10, background: isOwn ? '#3b82f6' : rowBg }}
                    className={`border-b border-r border-gray-200 px-2 py-1 text-center font-semibold whitespace-nowrap ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                    {emp.name}
                  </td>

                  {/* 每日班別 */}
                  {days.map((d) => {
                    const key = `${emp.id}_${d}`
                    const shift = scheduleMap[key] || ''
                    const isSaving = savingKey === key
                    const colorClass = SHIFT_COLORS[shift] || ''

                    return (
                      <td key={d} style={{ width: W_DAY, minWidth: W_DAY }} className={[
                        'border-b border-r border-gray-200 p-0 text-center',
                        !shift && isWeekend(d) ? 'bg-red-50/60' : '',
                        !shift && isToday(d) ? 'bg-blue-50/40' : '',
                      ].join(' ')}>
                        {isOwn ? (
                          <button
                            onClick={(e) => handleCellClick(e, emp, d)}
                            disabled={isSaving}
                            className={[
                              'w-full h-8 text-center text-xs font-medium transition cursor-pointer',
                              isSaving ? 'opacity-40 cursor-wait' : 'hover:brightness-90',
                              shift ? colorClass : 'text-gray-300 hover:bg-blue-50',
                            ].join(' ')}
                          >
                            {isSaving ? '…' : (shift || '·')}
                          </button>
                        ) : (
                          <span className={[
                            'flex items-center justify-center w-full h-8 text-xs font-medium',
                            shift ? colorClass : 'text-gray-300',
                          ].join(' ')}>
                            {shift || '·'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 上傳預覽確認視窗 */}
      {uploadPreview && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => !uploading && setUploadPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">確認上傳班表</h3>
              <p className="text-sm text-gray-500 mb-1">檔案：{uploadPreview.filename}</p>
              <p className="text-sm text-gray-700 mb-5">
                共解析到 <span className="font-bold text-blue-600">{uploadPreview.records.length}</span> 筆班別資料，
                將覆蓋相同日期的現有資料。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={confirmUpload}
                  disabled={uploading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2 rounded-lg cursor-pointer disabled:cursor-wait transition"
                >
                  {uploading ? '匯入中...' : '確認匯入'}
                </button>
                <button
                  onClick={() => setUploadPreview(null)}
                  disabled={uploading}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg cursor-pointer transition"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 浮動選單 */}
      {popup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopup(null)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-xl border border-gray-200 p-3 w-52"
            style={{ top: popup.y, left: popup.x }}>
            <button
              onClick={() => { handleShiftChange(popup.emp, popup.day, ''); setPopup(null) }}
              className="w-full mb-2 py-1.5 rounded-lg text-xs text-gray-400 bg-gray-50 hover:bg-gray-100 cursor-pointer transition text-center"
            >
              ✕ 清除
            </button>
            <div className="grid grid-cols-3 gap-1">
              {SHIFTS.map((s) => (
                <button
                  key={s}
                  onClick={() => { handleShiftChange(popup.emp, popup.day, s); setPopup(null) }}
                  className={['py-1.5 rounded-lg text-xs font-medium text-center transition cursor-pointer hover:brightness-90', SHIFT_COLORS[s] || 'bg-gray-100 text-gray-700'].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
