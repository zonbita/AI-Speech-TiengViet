import { useEffect, useRef, useState } from 'react'

const TTS = '/api'

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeVoice(raw) {
  const value = `${raw || ''}`.trim()
  if (!value) return 'Trúc Ly'
  return value.split('—')[0].split('·')[0].trim() || value
}

function normalizeVoiceOption(option) {
  if (typeof option === 'string') {
    const id = normalizeVoice(option)
    return { id, label: option }
  }
  const id = normalizeVoice(option?.id || option?.label)
  return {
    id,
    label: option?.label || option?.id || id,
  }
}

export default function App() {
  const [engine, setEngine] = useState('vieneu')
  const [voice, setVoice] = useState('Trúc Ly')
  const [voices, setVoices] = useState([{ id: 'Trúc Ly', label: 'Trúc Ly' }])
  // Pitch theo semitone để nghe "anime/dễ thương" hơn (0 = bình thường)
  const [pitch, setPitch] = useState(0)
  const [online, setOnline] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [tab, setTab] = useState('chat')
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'bot',
      text: 'Gõ câu tiếng Việt hoặc English, mình sẽ đọc thành giọng nói.',
    },
  ])
  const listRef = useRef(null)
  const voiceBoxRef = useRef(null)

  useEffect(() => {
    let stop = false
    ;(async () => {
      while (!stop) {
        try {
          const res = await fetch(`${TTS}/health`)
          if (!res.ok) throw new Error('health')
          const data = await res.json()
          if (stop) return
          setOnline(true)
          if (Array.isArray(data.voices) && data.voices.length) {
            const list = data.voices.map(normalizeVoiceOption)
            setVoices(list)
            setVoice((v) => (list.some((x) => x.id === v) ? v : list[0].id))
          }
          return
        } catch {
          if (stop) return
          setOnline(false)
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
    })()
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    // Close voice dropdown on outside click
    function onDocMouseDown(e) {
      if (!voiceOpen) return
      const el = voiceBoxRef.current
      if (!el) return
      if (el.contains(e.target)) return
      setVoiceOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [voiceOpen])

  async function speak(raw) {
    const value = raw.trim()
    if (!value || busy) return
    setText('')
    setBusy(true)
    const userId = uid()
    setMessages((m) => [...m, { id: userId, role: 'user', text: value }])

    try {
      const selectedVoice = normalizeVoice(voice)
      const res = await fetch(`${TTS}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, engine, voice: selectedVoice, pitch }),
      })
      const type = res.headers.get('content-type') || ''
      if (!res.ok || type.includes('application/json')) {
        const err = await res.json().catch(() => ({ error: 'Không tạo được giọng' }))
        throw new Error(err.error || 'Không tạo được giọng')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const botId = uid()
      setMessages((m) => [
        ...m,
        {
          id: botId,
          role: 'bot',
          text: 'Đã xuất giọng',
          audioUrl: url,
          engine,
          voice: selectedVoice,
          pitch,
          autoPlay: true,
        },
      ])
      setOnline(true)
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: 'bot',
          text: e.message || 'Lỗi TTS. Hãy chạy: python app.py serve',
          error: true,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    speak(text)
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="orb top-[-8%] left-[-6%] h-[28rem] w-[28rem] bg-violet-500/45" />
      <div className="orb bottom-[-10%] right-[-8%] h-[32rem] w-[32rem] bg-cyan-400/30" />
      <div className="orb top-[38%] left-[42%] h-[18rem] w-[18rem] bg-fuchsia-500/25" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_42%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <header className="glass mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4">
          <div>
            <p className="text-[11px] tracking-[0.22em] text-white/55 uppercase">Speech Tiếng Việt</p>
            <h1 className="font-semibold text-xl tracking-tight">Chat → Voice</h1>
          </div>
          <div className="flex rounded-2xl bg-white/10 p-1 text-sm">
            {[
              ['chat', 'Chat'],
              ['test', 'Test giọng'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-xl px-3 py-1.5 transition ${tab === k ? 'bg-white/90 font-semibold text-[#1a1240]' : 'text-white/75 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-rose-400 shadow-[0_0_12px_#fb7185]'}`}
            />
            <span className="text-white/75">{online ? 'TTS online' : 'Đang kết nối server (nạp model)...'}</span>
          </div>
        </header>

        {tab === 'test' && (
          <VoiceTest
            voices={voices}
            current={voice}
            onUse={(id) => {
              setEngine('vieneu')
              setVoice(id)
              setTab('chat')
            }}
          />
        )}
        <section className={`glass-strong ${tab === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem]`}>
          <div className="flex flex-wrap gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-[11px] text-white/55">
              Engine
              <select
                value={engine}
                onChange={(e) => {
                  setEngine(e.target.value)
                  setVoiceOpen(false)
                }}
                className="glass rounded-2xl bg-[#1c1840] px-3 py-2 text-sm text-white outline-none"
              >
                <option value="vieneu">VieNeu</option>
                <option value="f5">F5 clone</option>
              </select>
            </label>
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-[11px] text-white/55">
              Giọng VieNeu
              <div ref={voiceBoxRef} className="relative">
                <button
                  type="button"
                  disabled={engine !== 'vieneu'}
                  onClick={() => {
                    if (engine !== 'vieneu') return
                    setVoiceOpen((v) => !v)
                  }}
                  className="glass w-full rounded-2xl bg-[#1c1840] px-3 py-2 text-sm text-white outline-none disabled:opacity-40 flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {voices.find((v) => v.id === voice)?.label || voice}
                  </span>
                  <span className="text-white/70">{voiceOpen ? '▴' : '▾'}</span>
                </button>
                {voiceOpen && engine === 'vieneu' && (
                  <div className="absolute left-0 top-[calc(100%_+_0.5rem)] z-20 w-max min-w-full max-w-[90vw] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1840] shadow-xl">
                    {voices.map((v) => {
                      const active = v.id === voice
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setVoice(v.id)
                            setVoiceOpen(false)
                          }}
                          className={`w-full whitespace-nowrap px-3 py-1.5 text-left text-sm transition hover:bg-white/10 ${
                            active ? 'bg-white/15 text-white' : 'text-white/90'
                          }`}
                        >
                          {v.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] text-white/55">
              Pitch (tông)
              <div className="flex items-center gap-2">
                <input
                  aria-label="Pitch"
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full"
                />
                <span className="min-w-[3rem] text-right text-sm text-white/70">
                  {Math.abs(pitch) < 1e-6 ? '0' : pitch > 0 ? `+${pitch}` : `${pitch}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPitch(0)}
                  className="rounded-xl bg-white/10 px-2 py-1 text-xs text-white/80 transition hover:bg-white/15"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPitch(2.5)}
                  className="rounded-xl bg-white/10 px-2 py-1 text-xs text-white/80 transition hover:bg-white/15"
                >
                  dễ thương +2.5
                </button>
                <button
                  type="button"
                  onClick={() => setPitch(4)}
                  className="rounded-xl bg-white/10 px-2 py-1 text-xs text-white/80 transition hover:bg-white/15"
                >
                  anime +4
                </button>
              </div>
            </label>
          </div>

          <div ref={listRef} className="chat-scroll flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.map((msg) => (
              <Bubble key={msg.id} msg={msg} />
            ))}
            {busy && (
              <div className="glass max-w-[80%] rounded-3xl rounded-bl-md px-4 py-3 text-sm text-white/80">
                Đang tạo giọng
                <span className="ml-1 inline-flex gap-1">
                  <span className="mt-2 h-1.5 w-1.5 animate-bounce rounded-full bg-white/80 [animation-delay:-0.2s]" />
                  <span className="mt-2 h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" />
                  <span className="mt-2 h-1.5 w-1.5 animate-bounce rounded-full bg-white/80 [animation-delay:0.2s]" />
                </span>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-white/10 p-4 sm:p-5">
            <div className="glass flex items-end gap-2 rounded-[1.6rem] p-2 pl-4">
              <textarea
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    speak(text)
                  }
                }}
                placeholder="Nhập nội dung cần đọc…"
                className="h-[250px] flex-1 resize-none bg-transparent py-2.5 text-[15px] text-white outline-none placeholder:text-white/40"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="rounded-2xl bg-white/90 px-4 py-2.5 text-sm font-semibold text-[#1a1240] shadow-[0_8px_24px_rgba(255,255,255,0.18)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Đọc
              </button>
            </div>
            <p className="mt-2 px-1 text-center text-[11px] text-white/40">
              Enter để gửi · Shift+Enter xuống dòng · Chạy <code>python app.py serve</code> trước
            </p>
          </form>
        </section>
      </main>
    </div>
  )
}

const SAMPLE = 'Xin chào, đây là giọng đọc thử. Hôm nay trời đẹp quá!'

function VoiceTest({ voices, current, onUse }) {
  const [sample, setSample] = useState(SAMPLE)
  const [pitch, setPitch] = useState(0)
  const [state, setState] = useState({}) // id -> {loading, url, key, error}
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(null)

  function play(id, url) {
    const a = audioRef.current
    if (!a) return
    a.src = url
    a.play()
    setPlaying(id)
  }

  async function test(id) {
    const value = sample.trim()
    if (!value) return
    const key = `${value}|${pitch}`
    const cur = state[id]
    if (cur?.loading) return
    if (cur?.url && cur.key === key) return play(id, cur.url)
    setState((s) => ({ ...s, [id]: { loading: true } }))
    try {
      const res = await fetch(`${TTS}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, engine: 'vieneu', voice: id, pitch }),
      })
      const type = res.headers.get('content-type') || ''
      if (!res.ok || type.includes('application/json')) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Lỗi tạo giọng')
      }
      const url = URL.createObjectURL(await res.blob())
      setState((s) => ({ ...s, [id]: { url, key } }))
      play(id, url)
    } catch (e) {
      setState((s) => ({ ...s, [id]: { error: e.message } }))
    }
  }

  return (
    <section className="glass-strong flex flex-1 flex-col gap-4 rounded-[2rem] p-4 sm:p-5">
      <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-[3] min-w-[14rem] flex-col gap-1 text-[11px] text-white/55">
          Câu đọc thử
          <input
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            className="glass rounded-2xl bg-transparent px-3 py-2 text-sm text-white outline-none"
          />
        </label>
        <label className="flex flex-1 min-w-[9rem] flex-col gap-1 text-[11px] text-white/55">
          Pitch {pitch > 0 ? `+${pitch}` : pitch}
          <input type="range" min={-6} max={6} step={0.5} value={pitch} onChange={(e) => setPitch(parseFloat(e.target.value))} />
        </label>
      </div>
      <p className="text-[11px] text-white/45">Bấm ▶ để nghe thử. Mỗi lần tạo mất vài giây (VieNeu chạy CPU); nghe lại câu cũ thì phát ngay.</p>
      <div className="chat-scroll grid flex-1 content-start gap-2 overflow-y-auto sm:grid-cols-2">
        {voices.map((v) => {
          const st = state[v.id] || {}
          const [name, ...rest] = v.label.split('—')
          return (
            <div
              key={v.id}
              className={`glass flex items-center gap-3 rounded-2xl px-3 py-2 ${v.id === current ? 'ring-1 ring-emerald-300/60' : ''}`}
            >
              <button
                type="button"
                onClick={() => test(v.id)}
                disabled={st.loading}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/90 text-sm text-[#1a1240] transition hover:bg-white disabled:opacity-50"
                title="Nghe thử"
              >
                {st.loading ? '…' : playing === v.id ? '♪' : '▶'}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{name.trim()}</div>
                <div className={`truncate text-[11px] ${st.error ? 'text-rose-300' : 'text-white/55'}`}>
                  {st.error || rest.join('—').trim()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUse(v.id)}
                className="shrink-0 rounded-xl bg-white/10 px-2 py-1 text-xs text-white/80 transition hover:bg-white/20"
              >
                Dùng
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Bubble({ msg }) {
  const mine = msg.role === 'user'

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
          mine
            ? 'rounded-br-md bg-white/20 text-white'
            : msg.error
              ? 'rounded-bl-md border border-rose-300/30 bg-rose-500/15 text-rose-100'
              : 'glass rounded-bl-md text-white/90'
        }`}
      >
        <p>{msg.text}</p>
        {msg.audioUrl && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-white/70">
              Phát lại · {msg.engine}
              {msg.engine === 'vieneu' ? ` · ${msg.voice}` : ''}
              {typeof msg.pitch === 'number' && Math.abs(msg.pitch) > 1e-6
                ? ` · pitch ${msg.pitch > 0 ? '+' : ''}${msg.pitch}`
                : ''}
            </div>
            <audio
              key={msg.audioUrl}
              controls
              autoPlay={Boolean(msg.autoPlay)}
              preload="metadata"
              src={msg.audioUrl}
              className="w-full max-w-xs"
            />
          </div>
        )}
      </div>
    </div>
  )
}
