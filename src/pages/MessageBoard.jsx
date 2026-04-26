import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MAX_CHARS = 200

export default function MessageBoard({ currentUser }) {
  const [allMessages, setAllMessages]       = useState([])
  const [content, setContent]               = useState('')
  const [isAnonymous, setIsAnonymous]       = useState(false)
  const [loading, setLoading]               = useState(false)
  const [fetching, setFetching]             = useState(true)
  const [error, setError]                   = useState('')

  const [replyTo, setReplyTo]               = useState(null)
  const [expandedReplies, setExpandedReplies] = useState({})   // { [msgId]: true }
  const [replyContent, setReplyContent]     = useState('')
  const [replyAnonymous, setReplyAnonymous] = useState(false)
  const [replyLoading, setReplyLoading]     = useState(false)

  useEffect(() => { fetchMessages() }, [])

  async function fetchMessages() {
    setFetching(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, is_anonymous, created_at, user_id, parent_id, profiles(name)')
      .order('created_at', { ascending: true })
    if (error) {
      setError('載入留言失敗：' + error.message)
    } else {
      setAllMessages(data || [])
    }
    setFetching(false)
  }

  function getDisplayName(msg) {
    const realName = msg.profiles?.name || '員工'
    if (!msg.is_anonymous) return realName
    if (currentUser.level >= 3) return `${realName}（匿名）`
    return '匿名人士'
  }

  function getAvatar(msg) {
    if (msg.is_anonymous && currentUser.level < 3) return '？'
    return (msg.profiles?.name?.[0] || '員').toUpperCase()
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString('zh-TW', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)
    setError('')
    const { error } = await supabase.from('messages').insert({
      user_id: currentUser.user.id,
      content: content.trim(),
      is_anonymous: isAnonymous,
    })
    if (error) { setError('送出失敗，請再試一次。') }
    else { setContent(''); setIsAnonymous(false); await fetchMessages() }
    setLoading(false)
  }

  async function handleReply(parentId) {
    if (!replyContent.trim()) return
    setReplyLoading(true)
    const { error } = await supabase.from('messages').insert({
      user_id: currentUser.user.id,
      content: replyContent.trim(),
      is_anonymous: replyAnonymous,
      parent_id: parentId,
    })
    if (!error) {
      setReplyContent('')
      setReplyAnonymous(false)
      setReplyTo(null)
      setExpandedReplies(prev => ({ ...prev, [parentId]: true }))
      await fetchMessages()
    }
    setReplyLoading(false)
  }

  function toggleReplies(msgId) {
    setExpandedReplies(prev => ({ ...prev, [msgId]: !prev[msgId] }))
    if (expandedReplies[msgId]) setReplyTo(null)
  }

  const topLevel = allMessages
    .filter(m => !m.parent_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  function getReplies(parentId) {
    return allMessages
      .filter(m => m.parent_id === parentId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }

  const myInitial = (currentUser.name?.[0] || '我').toUpperCase()

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">

      {/* ── 發言框（頂部，Instagram 風格）── */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex items-start gap-3">
          {/* 自己的頭像 */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
            {myInitial}
          </div>
          <div className="flex-1">
            <textarea
              rows={2}
              value={content}
              onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
              placeholder="說點什麼吧..."
              className="w-full text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none leading-relaxed"
            />
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-1">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={e => setIsAnonymous(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 cursor-pointer"
                />
                <span className="text-xs text-gray-400">匿名</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-300">{content.length}/{MAX_CHARS}</span>
                <button
                  type="submit"
                  disabled={loading || !content.trim()}
                  className="text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:text-blue-200 cursor-pointer disabled:cursor-not-allowed transition"
                >
                  {loading ? '發送中...' : '發送'}
                </button>
              </div>
            </div>
          </div>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-500 pl-11">{error}</p>}
      </form>

      {/* ── 分隔線 ── */}
      <div className="border-t border-gray-100" />

      {/* ── 留言列表 ── */}
      {fetching ? (
        <p className="text-center text-gray-400 text-sm py-10">載入中...</p>
      ) : topLevel.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-10">還沒有留言，來第一個說說心情吧！</p>
      ) : (
        <ul className="space-y-0 divide-y divide-gray-100">
          {topLevel.map((msg) => {
            const replies = getReplies(msg.id)
            const isExpanded = expandedReplies[msg.id]
            const isReplying = replyTo === msg.id

            return (
              <li key={msg.id} className="py-4">
                {/* 主留言 */}
                <div className="flex items-start gap-3">
                  {/* 頭像 */}
                  <div className={[
                    'w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0',
                    msg.is_anonymous && currentUser.level < 3
                      ? 'bg-gray-300 text-gray-500'
                      : 'bg-gradient-to-br from-blue-400 to-indigo-500',
                  ].join(' ')}>
                    {getAvatar(msg)}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 名字 + 時間 */}
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{getDisplayName(msg)}</span>
                        {msg.is_anonymous && currentUser.level >= 3 && (
                          <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">後台可見真名</span>
                        )}
                      </div>
                      <time className="text-[11px] text-gray-400 shrink-0">{formatTime(msg.created_at)}</time>
                    </div>

                    {/* 內文 */}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed text-left">{msg.content}</p>

                    {/* 操作列 */}
                    <div className="flex items-center gap-4 mt-2">
                      <button
                        onClick={() => {
                          setReplyTo(isReplying ? null : msg.id)
                          setReplyContent('')
                          if (!isExpanded && !isReplying) {
                            setExpandedReplies(prev => ({ ...prev, [msg.id]: true }))
                          }
                        }}
                        className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer transition font-medium"
                      >
                        {isReplying ? '取消' : '回覆'}
                      </button>

                      {replies.length > 0 && (
                        <button
                          onClick={() => toggleReplies(msg.id)}
                          className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer transition font-medium"
                        >
                          {isExpanded ? '收起回覆' : `查看 ${replies.length} 則回覆`}
                        </button>
                      )}
                    </div>

                    {/* 展開的回覆列表 */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3 pl-1 border-l-2 border-gray-100">
                        {replies.map(reply => (
                          <div key={reply.id} className="flex items-start gap-2 pl-3">
                            <div className={[
                              'w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5',
                              reply.is_anonymous && currentUser.level < 3
                                ? 'bg-gray-300 text-gray-500'
                                : 'bg-gradient-to-br from-purple-400 to-pink-400',
                            ].join(' ')}>
                              {getAvatar(reply)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-gray-800">{getDisplayName(reply)}</span>
                                  {reply.is_anonymous && currentUser.level >= 3 && (
                                    <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">後台可見真名</span>
                                  )}
                                </div>
                                <time className="text-[10px] text-gray-400 shrink-0">{formatTime(reply.created_at)}</time>
                              </div>
                              <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed text-left">{reply.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 回覆輸入框 */}
                    {isReplying && (
                      <div className="mt-3 flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {myInitial}
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                          <textarea
                            rows={2}
                            value={replyContent}
                            onChange={e => setReplyContent(e.target.value.slice(0, MAX_CHARS))}
                            placeholder={`回覆 ${getDisplayName(msg)}...`}
                            autoFocus
                            className="w-full text-xs text-gray-800 placeholder-gray-400 resize-none focus:outline-none bg-transparent leading-relaxed"
                          />
                          <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 mt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={replyAnonymous}
                                onChange={e => setReplyAnonymous(e.target.checked)}
                                className="w-3 h-3 rounded border-gray-300 text-blue-500 cursor-pointer"
                              />
                              <span className="text-[11px] text-gray-400">匿名</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-300">{replyContent.length}/{MAX_CHARS}</span>
                              <button
                                onClick={() => handleReply(msg.id)}
                                disabled={replyLoading || !replyContent.trim()}
                                className="text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:text-blue-200 cursor-pointer disabled:cursor-not-allowed transition"
                              >
                                {replyLoading ? '送出中...' : '送出'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
