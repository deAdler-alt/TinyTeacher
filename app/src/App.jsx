import { useState } from 'react'

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]/g) || [text]
}

function tokenize(text) {
  return text.toLowerCase().match(/[a-ząćęłńóśźż0-9]+/gi) || []
}

const STOP = new Set([
  'i','oraz','lub','albo','a','w','na','do','z','że','to','jak','o','od','po','u','przy','dla','ten','ta','to','the','and','or','of','in','on','to','for','with','is','are','was','were','be','by','as','at','it','this','that','an','a'
])

function wordFreq(words) {
  const f = {}
  for (const w of words) if (!STOP.has(w) && w.length > 2) f[w] = (f[w] || 0) + 1
  return f
}

function summarize(text, maxSentences = 5) {
  const sentences = splitSentences(text)
  const words = tokenize(text)
  const freq = wordFreq(words)
  const scored = sentences.map((s, i) => {
    const sw = tokenize(s)
    const score = sw.reduce((acc, w) => acc + (freq[w] || 0), 0) / Math.max(sw.length, 1)
    return { i, s: s.trim(), score }
  })
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, maxSentences).sort((a, b) => a.i - b.i).map(x => x.s)
  return top.join(' ')
}

function simplify(text, targetLen = 18) {
  const sentences = splitSentences(text)
  const simple = sentences.map(s => {
    let t = s.replace(/\([^)]*\)/g, ' ')
    const words = t.trim().split(/\s+/)
    if (words.length > targetLen) t = words.slice(0, targetLen).join(' ') + '…'
    return t.trim()
  })
  return simple.join(' ')
}

function topKeywords(text, k = 6) {
  const freq = wordFreq(tokenize(text))
  const arr = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([w]) => w)
  return arr.slice(0, k)
}

function makeFlashcards(text, keywords) {
  const sentences = splitSentences(text)
  return keywords.map(term => {
    const s = sentences.find(x => x.toLowerCase().includes(term.toLowerCase())) || ''
    const def = s.replace(/\s+/g, ' ').trim()
    return { term, definition: def || 'Definition from context not found.' }
  })
}

function makeQuiz(text, keywords, n = 5) {
  const sentences = splitSentences(text)
  const qs = []
  const used = new Set()
  for (const term of keywords) {
    if (qs.length >= n) break
    const s = sentences.find(x => x.toLowerCase().includes(term.toLowerCase()))
    if (!s) continue
    if (used.has(term)) continue
    used.add(term)
    const blanked = s.replace(new RegExp(`\\b${term}\\b`, 'i'), '_____')
    const distractors = keywords.filter(k => k !== term).slice(0, 3)
    const options = [term, ...distractors].slice(0, 4).sort(() => Math.random() - 0.5)
    qs.push({ question: blanked.trim(), options, answer: term })
  }
  return qs
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return null
    const html = await res.text()
    return html
  } catch {
    return null
  }
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
    const keywords = topKeywords(text, 6)
    const fc = makeFlashcards(text, keywords)
    const qz = makeQuiz(text, keywords, 5)
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
