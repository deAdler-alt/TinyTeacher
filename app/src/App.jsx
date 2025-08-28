import { useState } from 'react'

function splitSentences(text) {
  const norm = (text || '').replace(/\s+/g, ' ').trim()
  const parts = norm.match(/[^.!?]+[.!?]?/g) || []
  return parts.map(s => s.trim()).filter(Boolean)
}

function tokenize(text) {
  return (text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-ząćęłńóśźż0-9]+/gi) || []
}

const STOP = new Set([
  'i','oraz','lub','albo','a','w','na','do','z','że','to','jak','o','od','po','u','przy','dla','ten','ta','to','te','tam','tu','jest','są','był','była','było','być','nie','tak','czy','się','nad','pod','między','oraz','który','która','które','the','and','or','of','in','on','to','for','with','is','are','was','were','be','by','as','at','it','this','that','an','a','from','into','over','under','between','which','who','whom','whose'
])

function wordFreq(words) {
  const f = {}
  for (const w of words) if (!STOP.has(w) && w.length > 2) f[w] = (f[w] || 0) + 1
  return f
}

function rakeKeywords(text, topK = 8) {
  const sents = splitSentences(text)
  const candidates = []
  const sep = /[^\p{L}\p{N}\+]+/u
  for (const s of sents) {
    const words = s.toLowerCase().split(sep).filter(Boolean)
    const phrases = []
    let current = []
    for (const w of words) {
      if (STOP.has(w) || w.length < 3) {
        if (current.length) { phrases.push(current); current = [] }
      } else current.push(w)
    }
    if (current.length) phrases.push(current)
    for (const p of phrases) candidates.push(p)
  }
  const freq = {}
  const degree = {}
  for (const p of candidates) {
    const deg = p.length - 1
    for (const w of p) {
      freq[w] = (freq[w] || 0) + 1
      degree[w] = (degree[w] || 0) + deg
    }
  }
  const scoreWord = {}
  for (const w in freq) scoreWord[w] = (degree[w] + freq[w]) / freq[w]
  const scorePhrase = candidates.map(p => [p.join(' '), p.reduce((a, w) => a + (scoreWord[w] || 0), 0)])
  scorePhrase.sort((a,b)=>b[1]-a[1])
  const uniq = []
  const seen = new Set()
  for (const [ph] of scorePhrase) {
    if (!seen.has(ph)) { uniq.push(ph); seen.add(ph) }
    if (uniq.length >= Math.max(5, topK)) break
  }
  return uniq
}

function jaccard(a, b) {
  const A = new Set(tokenize(a))
  const B = new Set(tokenize(b))
  const inter = [...A].filter(x=>B.has(x)).length
  const uni = new Set([...A, ...B]).size || 1
  return inter / uni
}

function summarize(text, maxSentences = 5) {
  const sentences = splitSentences(text)
  if (sentences.length <= maxSentences) return sentences.join(' ')
  const words = tokenize(text)
  const freq = wordFreq(words)
  const keywords = new Set(rakeKeywords(text, 10))
  const scored = sentences.map((s, i) => {
    const sw = tokenize(s)
    const base = sw.reduce((acc, w) => acc + (freq[w] || 0), 0) / Math.max(sw.length, 1)
    const kw = [...keywords].reduce((acc, k) => acc + (s.toLowerCase().includes(k) ? 1 : 0), 0)
    const pos = 1 - i / sentences.length
    const lenPenalty = Math.abs(18 - sw.length) / 18
    const score = 0.55*base + 0.3*kw + 0.15*pos - 0.1*lenPenalty
    return { i, s: s.trim(), score }
  }).sort((a,b)=>b.score-a.score)
  const selected = []
  for (const cand of scored) {
    if (selected.length >= maxSentences) break
    if (selected.every(x => jaccard(x.s, cand.s) < 0.6)) selected.push(cand)
  }
  selected.sort((a,b)=>a.i-b.i)
  return selected.map(x=>x.s).join(' ')
}

function simplify(text, targetLen = 16) {
  const sentences = splitSentences(text).slice(0, 6)
  const mapSimple = new Map([
    ['utilize','use'],['approximately','about'],['numerous','many'],['prior to','before'],
    ['zastosować','użyć'],['aproksymacja','przybliżenie'],['poprzez','przez'],['w celu','aby']
  ])
  const res = sentences.map(s => {
    let t = s.replace(/\([^)]*\)/g, ' ').replace(/[–—]/g,'-')
    for (const [k,v] of mapSimple.entries()) t = t.replace(new RegExp(`\\b${k}\\b`,'gi'), v)
    const words = t.trim().split(/\s+/)
    if (words.length > targetLen) t = words.slice(0, targetLen).join(' ') + '…'
    return t.trim()
  })
  return res.join(' ')
}

function makeFlashcards(text, keywords) {
  const sentences = splitSentences(text)
  const uniq = []
  const seen = new Set()
  for (const term of keywords) {
    if (uniq.length >= 6) break
    if (seen.has(term)) continue
    const s = sentences.find(x => x.toLowerCase().includes(term.toLowerCase())) || ''
    uniq.push({ term, definition: (s || 'Definition from context not found.').replace(/\s+/g,' ').trim() })
    seen.add(term)
  }
  return uniq
}

function makeQuiz(text, keywords, n = 5) {
  const sentences = splitSentences(text)
  const qs = []
  const used = new Set()
  const pool = keywords.slice(0, 12)
  for (const term of pool) {
    if (qs.length >= n) break
    if (used.has(term)) continue
    const s = sentences.find(x => x.toLowerCase().includes(term.toLowerCase()))
    if (!s) continue
    const blanked = s.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'i'), '_____').trim()
    let distractors = pool.filter(k => k !== term).filter(k => !s.toLowerCase().includes(k.toLowerCase()))
    while (distractors.length < 3) distractors = distractors.concat(pool.filter(k=>k!==term))
    const options = [term, ...distractors.slice(0,3)].sort(()=>Math.random()-0.5)
    qs.push({ question: blanked, options, answer: term })
    used.add(term)
  }
  return qs
}

const CORS_PROXY = "https://tinyteacher-cors.lotopo5924.workers.dev/?u="

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      return await res.text()
    }
  } catch {}
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(url))
    if (res.ok) return await res.text()
  } catch {}
  return null
}


function extractTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,noscript').forEach(el => el.remove())
  const main = doc.querySelector('main, article') || doc.body
  const text = (main?.textContent || '').replace(/\s+/g, ' ').trim()
  return text
}

export default function App() {
  const [url, setUrl] = useState('')
  const [pasted, setPasted] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [summary, setSummary] = useState('')
  const [simple, setSimple] = useState('')
  const [cards, setCards] = useState([])
  const [quiz, setQuiz] = useState([])

  const createLesson = async () => {
    setError('')
    setLoading(true)
    let text = pasted.trim()
    if (!text && url) {
      const html = await fetchHtml(url)
      if (html) text = extractTextFromHtml(html)
    }
    if (!text) {
      setLoading(false)
      setError('Provide a URL that allows CORS or paste the text/transcript below.')
      return
    }
    setSourceText(text)
    const sum = summarize(text, 5)
    const simp = simplify(sum, 18)
    const kws = rakeKeywords(text, 8)
    const fc = makeFlashcards(text, kws)
    const qz = makeQuiz(text, kws, 5)
    setSummary(sum)
    setSimple(simp)
    setCards(fc)
    setQuiz(qz)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">TinyTeacher</h1>
        <p className="mb-4">Turn any public link or pasted text into a 10-minute lesson.</p>

        <div className="space-y-3 mb-6">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste a URL (optional)"
            className="w-full border rounded-xl p-3"
          />
          <textarea
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            placeholder="Or paste article/transcript text here"
            rows={8}
            className="w-full border rounded-xl p-3"
          />
          <button
            onClick={createLesson}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Lesson'}
          </button>
          {error && <div className="text-red-600">{error}</div>}
        </div>

        {summary && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-semibold mb-2">Summary</h2>
              <p className="leading-7">{summary}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Simplified</h2>
              <p className="leading-7">{simple}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Flashcards</h2>
              <ul className="space-y-2">
                {cards.map((c, i) => (
                  <li key={i} className="border rounded-xl p-3">
                    <div className="font-medium">{c.term}</div>
                    <div className="text-sm opacity-80">{c.definition}</div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">Quiz</h2>
              <ol className="list-decimal ml-6 space-y-3">
                {quiz.map((q, i) => (
                  <li key={i}>
                    <div className="mb-2">{q.question}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((o, j) => (
                        <div key={j} className="border rounded-xl p-2">{o}</div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
