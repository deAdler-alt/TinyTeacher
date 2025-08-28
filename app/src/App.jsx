import { useEffect, useState } from 'react'
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx'
import { motion } from 'framer-motion'
import {
  BookOpen, Sparkles, Save, Download, Eraser, Trash2,
  Volume2, Pause, PlayCircle, Square as Stop, Settings2, Type, Link2, Loader2
} from 'lucide-react'

const CORS_PROXY = "https://tinyteacher-cors.lotopo5924.workers.dev/?u="

function normalize(t){return (t||'').replace(/\s+/g,' ').trim()}
function splitSentences(t){const p=normalize(t).match(/[^.!?]+[.!?]*/g)||[];return p.map(s=>s.trim()).filter(Boolean)}
function tokenize(t){const x=(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');return x.match(/[a-ząćęłńóśźż0-9]+/gi)||[]}
const STOP=new Set(['i','oraz','lub','albo','a','w','na','do','z','że','to','jak','o','od','po','u','przy','dla','ten','ta','to','te','tam','tu','jest','są','był','była','było','być','nie','tak','czy','się','nad','pod','między','który','która','które','the','and','or','of','in','on','to','for','with','is','are','was','were','be','by','as','at','it','this','that','an','a','from','into','over','under','between','which','who','whose','whom'])
function wordFreq(words){const f={};for(const w of words){if(w.length<3)continue;if(STOP.has(w))continue;f[w]=(f[w]||0)+1}return f}
function topKeywordsSimple(text,k=8){const f=wordFreq(tokenize(text));const terms=Object.entries(f).sort((a,b)=>b[1]-a[1]).map(([w])=>w).filter(w=>!/^\d+$/.test(w));const out=[];const seen=new Set();for(const w of terms){if(out.length>=k)break;if(seen.has(w))continue;out.push(w);seen.add(w)}return out}
function jaccard(a,b){const A=new Set(tokenize(a)),B=new Set(tokenize(b));const inter=[...A].filter(x=>B.has(x)).length;const uni=new Set([...A,...B]).size||1;return inter/uni}
function summarize(text,maxSentences=5){
  const sents=splitSentences(text); if(sents.length<=maxSentences) return sents.join(' ')
  const words=tokenize(text); const freq=wordFreq(words); const kw=new Set(topKeywordsSimple(text,12))
  const scored=sents.map((s,i)=>{
    const sw=tokenize(s)
    const base=sw.reduce((a,w)=>a+(freq[w]||0),0)/Math.max(sw.length,1)
    const kwHits=[...kw].reduce((a,k)=>a+(s.toLowerCase().includes(k)?1:0),0)
    const pos=1 - i/sents.length
    const lenPenalty=Math.max(0, sw.length - 28)/28
    const score=0.6*base + 0.25*kwHits + 0.15*pos - 0.1*lenPenalty
    return { i, s: s.trim(), score }
  }).sort((a,b)=>b.score-a.score)
  const chosen=[]
  for(const c of scored){
    if(chosen.length>=maxSentences) break
    if(chosen.every(x=>jaccard(x.s,c.s)<0.6)) chosen.push(c)
  }
  chosen.sort((a,b)=>a.i-b.i)
  return chosen.map(x=>x.s).join(' ')
}

const SIMPLE_MAP = new Map([
  ['utilize','use'],['approximately','about'],['numerous','many'],['prior to','before'],
  ['zastosować','użyć'],['aproksymacja','przybliżenie'],['poprzez','przez'],['w celu','aby'],
  ['implementacja','wdrożenie'],['konfiguracja','ustawienie'],['komponent','część']
])

function simplifyBase(text, targetLen, maxSentences=6){
  const sents = splitSentences(text).slice(0, maxSentences)
  return sents.map(s=>{
    let t=s.replace(/\([^)]*\)/g,' ').replace(/[–—]/g,'-')
    for(const [k,v] of SIMPLE_MAP.entries()) t=t.replace(new RegExp(`\\b${k}\\b`,'gi'),v)
    const w=t.trim().split(/\s+/)
    if(w.length>targetLen) t=w.slice(0,targetLen).join(' ')+'…'
    return t.trim()
  }).join(' ')
}

function simplifyForLevel(summaryText, level){
  if(level==='A2') return simplifyBase(summaryText, 12, 4)
  return simplifyBase(summaryText, 20, 6)
}

function pickContextSentence(sents,term){
  const lower=term.toLowerCase()
  const exact=sents.find(s=>s.toLowerCase().includes(lower))
  if(exact) return exact
  let best='',score=0
  for(const s of sents){ const sc=jaccard(s,term); if(sc>score){ score=sc; best=s } }
  return best||sents[0]||''
}
function makeFlashcards(text,kw,maxN=6){
  const s=splitSentences(text); const out=[]; const seen=new Set()
  for(const t of kw){
    if(out.length>=maxN) break
    if(seen.has(t)) continue
    const c=pickContextSentence(s,t); const def=normalize(c); if(!def) continue
    out.push({term:t, definition:def}); seen.add(t)
  }
  return out
}
function makeQuiz(text,kw,n=5){
  const s=splitSentences(text); const pool=kw.slice(0,12)
  const qs=[]; const used=new Set()
  for(const term of pool){
    if(qs.length>=n) break
    if(used.has(term)) continue
    const c=pickContextSentence(s,term); if(!c) continue
    const re=new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`,'i')
    if(!re.test(c)) continue
    const blank=c.replace(re,'_____').trim()
    let distractors=pool.filter(k=>k!==term && !c.toLowerCase().includes(k.toLowerCase()))
    while(distractors.length<3) distractors=distractors.concat(pool.filter(k=>k!==term))
    const options=[term, ...distractors.slice(0,3)].sort(()=>Math.random()-0.5)
    qs.push({ question:blank, options, answer:term }); used.add(term)
  }
  return qs
}

async function fetchHtml(url){
  try{
    const r=await fetch(url,{mode:'cors'})
    if(r.ok && ((r.headers.get('content-type')||'').includes('text/html'))) return await r.text()
  }catch{}
  try{
    const r=await fetch(CORS_PROXY+encodeURIComponent(url))
    if(r.ok) return await r.text()
  }catch{}
  return null
}
function extractTextFromHtml(html){
  const d=new DOMParser().parseFromString(html,'text/html')
  d.querySelectorAll('script,style,noscript').forEach(e=>e.remove())
  const m=d.querySelector('main, article')||d.body
  return (m?.textContent||'').replace(/\s+/g,' ').trim()
}

function useLessonsStore(){
  const key='tinyteacher-lessons'
  const read=()=>{ try{ const v=localStorage.getItem(key); return v?JSON.parse(v):[] }catch{ return [] } }
  const write=a=>{ try{ localStorage.setItem(key, JSON.stringify(a)) }catch{} }
  const add=l=>{ const a=read(); a.unshift(l); write(a) }
  const remove=id=>{ const a=read().filter(x=>x.id!==id); write(a) }
  const clear=()=>{ try{ localStorage.removeItem(key) }catch{} }
  return { read, add, remove, clear }
}

function isTtsSupported(){ return typeof window !== 'undefined' && 'speechSynthesis' in window }
function speakText(text, lang = 'pl', opts = {}, onEvent){
  const synth = window.speechSynthesis
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = opts.rate ?? 1
  u.pitch = opts.pitch ?? 1
  u.onstart = (e)=>onEvent?.({type:'start', e})
  u.onend   = (e)=>onEvent?.({type:'end',   e})
  synth.cancel()
  synth.speak(u)
  return { pause: ()=>synth.pause(), resume: ()=>synth.resume(), cancel: ()=>synth.cancel() }
}

export default function App(){
  const [url,setUrl]=useState('')
  const [pasted,setPasted]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const [summary,setSummary]=useState('')
  const [readingLevel,setReadingLevel]=useState('B2')
  const [simple,setSimple]=useState('')
  const [cards,setCards]=useState([])
  const [quiz,setQuiz]=useState([])
  const [answers,setAnswers]=useState({})
  const [lessons,setLessons]=useState([])
  const [dyslexia,setDyslexia]=useState(false)

  const [ttsCtrl, setTtsCtrl] = useState(null)
  const [speaking, setSpeaking] = useState(false)

  const store=useLessonsStore()

  useEffect(()=>{ setLessons(store.read()) },[])

  useEffect(()=>{
    if(summary) setSimple(simplifyForLevel(summary, readingLevel))
  },[summary, readingLevel])

  useEffect(() => {
    const handleBeforePrint = () => { if (summary) setSimple(simplifyForLevel(summary, readingLevel)) }
    window.addEventListener('beforeprint', handleBeforePrint)
    return () => window.removeEventListener('beforeprint', handleBeforePrint)
  }, [summary, readingLevel])

  useEffect(() => { ttsCtrl?.cancel?.(); setSpeaking(false) }, [simple])

  const clearCurrent=(keepInputs=false)=>{
    if(!keepInputs){ setUrl(''); setPasted('') }
    setSummary(''); setSimple(''); setCards([]); setQuiz([]); setAnswers({}); setError('')
    ttsCtrl?.cancel?.(); setSpeaking(false)
  }
  const clearAllSaved=()=>{ store.clear(); setLessons([]) }

  const createLesson=async ()=>{
    setError(''); setLoading(true); clearCurrent(true)
    let text=normalize(pasted)
    if(!text && url){ const html=await fetchHtml(url); if(html) text=extractTextFromHtml(html) }
    if(!text){ setLoading(false); setError('Provide a URL that allows CORS or paste the text/transcript below.'); return }
    const sum=summarize(text,5)
    const kws=topKeywordsSimple(text,8)
    const fc=makeFlashcards(text,kws,6)
    const qz=makeQuiz(text,kws,5)
    setSummary(sum); setCards(fc); setQuiz(qz)
    setLoading(false)
  }

  const choose=(qi,opt)=> setAnswers(p=>({...p,[qi]:opt}))

  const saveLesson=()=>{
    if(!summary){ setError('Create a lesson first.'); return }
    const title=(splitSentences(summary)[0]||'Lesson').slice(0,80)
    const lesson={ id:Date.now(), title, url, sourceText:normalize(pasted), summary, simple, cards, quiz, createdAt:new Date().toISOString(), readingLevel }
    store.add(lesson); setLessons(store.read())
  }
  const loadLesson=id=>{
    const l=store.read().find(x=>x.id===id); if(!l) return
    setUrl(l.url||''); setPasted(l.sourceText||''); setSummary(l.summary||''); setReadingLevel(l.readingLevel||'B2')
    setSimple(l.simple||''); setCards(l.cards||[]); setQuiz(l.quiz||[]); setAnswers({}); setError('')
    ttsCtrl?.cancel?.(); setSpeaking(false)
    window.scrollTo({ top:0, behavior:'smooth' })
  }
  const deleteLesson=id=>{ store.remove(id); setLessons(store.read()) }

  const exportDocx=async ()=>{
    if(!summary){ setError('Create a lesson first.'); return }
    const title='TinyTeacher — Lesson'
    const doc=new Document({
      sections:[{
        properties:{page:{margin:{top:720,right:720,bottom:720,left:720}}},
        children:[
          new Paragraph({ text:title, heading:HeadingLevel.TITLE, alignment:AlignmentType.LEFT }),
          new Paragraph({ text:'' }),
          new Paragraph({ text:`Reading level: ${readingLevel}`, heading:HeadingLevel.HEADING_3 }),
          new Paragraph({ text:'' }),
          new Paragraph({ text:'Summary', heading:HeadingLevel.HEADING_2 }),
          ...splitSentences(summary).map(s=>new Paragraph({ children:[new TextRun({ text:s })] })),
          new Paragraph({ text:'' }),
          new Paragraph({ text:'Simplified', heading:HeadingLevel.HEADING_2 }),
          ...splitSentences(simple).map(s=>new Paragraph({ children:[new TextRun({ text:s })] })),
          new Paragraph({ text:'' }),
          new Paragraph({ text:'Flashcards', heading:HeadingLevel.HEADING_2 }),
          ...(cards.length? cards.map(c=>new Paragraph({ children:[ new TextRun({ text:`${c.term}: ${c.definition}` }) ], bullet:{level:0} })) : [new Paragraph({ text:'No flashcards.' })]),
          new Paragraph({ text:'' }),
          new Paragraph({ text:'Quiz', heading:HeadingLevel.HEADING_2 }),
          ...(quiz.length? quiz.flatMap((q,idx)=>[
            new Paragraph({ children:[ new TextRun({ text:`${idx+1}. ${q.question.replace('_____', '__________')}` }) ] }),
            ...q.options.map(o=>new Paragraph({ children:[ new TextRun({ text:o }) ], bullet:{ level:1 } })),
            new Paragraph({ text:'' })
          ]) : [new Paragraph({ text:'No quiz questions.' })])
        ]
      }]
    })
    const blob=await Packer.toBlob(doc)
    const name=(`${(splitSentences(summary)[0]||'lesson').slice(0,40)}.docx`).replace(/[^\w\-]+/g,'_')
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove()
  }

  const glossyCard = "border border-white/40 bg-white/60 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(16,24,40,0.15)] rounded-2xl"

  return (
    <div className={`min-h-screen ${dyslexia ? 'dyslexia' : ''} text-gray-900`}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-br from-blue-500/30 via-indigo-400/20 to-fuchsia-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-emerald-400/20 via-cyan-300/20 to-blue-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:18px_18px] opacity-[0.15]" />
      </div>

      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/60 border-b border-white/40">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-extrabold text-xl gradient-text leading-none">TinyTeacher</div>
              <div className="text-xs opacity-70 -mt-0.5">Turn any content into a 10-minute lesson</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <Settings2 className="h-4 w-4 opacity-70" />
            <span className="opacity-70">PWA • Offline • DOCX</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className={`${glossyCard} p-5 mb-6`}
        >
          <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Accessibility and level controls">
            <div className="flex items-center gap-2">
              <Type className="h-5 w-5 opacity-70" />
              <span className="text-sm">Reading level</span>
              <div className="inline-flex rounded-xl overflow-hidden border border-black/10">
                <button
                  role="tab" aria-selected={readingLevel==='A2'}
                  onClick={()=>setReadingLevel('A2')}
                  className={`px-3 h-10 ${readingLevel==='A2'?'bg-blue-600 text-white':'bg-white hover:bg-black/5'}`}
                >A2</button>
                <button
                  role="tab" aria-selected={readingLevel==='B2'}
                  onClick={()=>setReadingLevel('B2')}
                  className={`px-3 h-10 ${readingLevel==='B2'?'bg-blue-600 text-white':'bg-white hover:bg-black/5'}`}
                >B2</button>
              </div>
            </div>

            {isTtsSupported() && (
              <div className="flex items-center gap-2" role="group" aria-label="Text to speech">
                <Volume2 className="h-5 w-5 opacity-70" />
                <button
                  onClick={()=>{
                    const c = speakText((simple || summary), 'pl', { rate: 1 }, ev => { if (ev.type==='end') setSpeaking(false) })
                    setTtsCtrl(c); setSpeaking(true)
                  }}
                  className="px-3 h-10 rounded-xl bg-white hover:bg-black/5 border border-black/10 flex items-center gap-1"
                  aria-pressed={speaking}
                >
                  <PlayCircle className="h-5 w-5" /> {speaking ? 'Restart' : 'Play'}
                </button>
                <button onClick={()=>ttsCtrl?.pause?.()} className="px-3 h-10 rounded-xl bg-white hover:bg-black/5 border border-black/10 flex items-center gap-1">
                  <Pause className="h-5 w-5" /> Pause
                </button>
                <button onClick={()=>ttsCtrl?.resume?.()} className="px-3 h-10 rounded-xl bg-white hover:bg-black/5 border border-black/10 flex items-center gap-1">
                  <PlayCircle className="h-5 w-5" /> Resume
                </button>
                <button onClick={()=>{ ttsCtrl?.cancel?.(); setSpeaking(false) }} className="px-3 h-10 rounded-xl bg-white hover:bg-black/5 border border-black/10 flex items-center gap-1">
                  <Stop className="h-5 w-5" /> Stop
                </button>
              </div>
            )}

            <label className="inline-flex items-center gap-2 ml-auto">
              <input type="checkbox" className="h-5 w-5" checked={dyslexia} onChange={e=>setDyslexia(e.target.checked)} aria-label="Enable dyslexia-friendly mode" />
              <span className="text-sm">Dyslexia-friendly</span>
            </label>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}
          className={`${glossyCard} p-5 mb-6`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm font-medium opacity-80">Source URL</label>
            <div className="hidden md:block text-right opacity-60 text-xs">Paste a public link (CORS-friendly)</div>
            <div className="md:col-span-2 flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60"><Link2 className="h-4 w-4" /></span>
                <input
                  value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/article"
                  className="w-full pl-9 pr-3 h-11 rounded-xl bg-white border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <label className="block text-sm font-medium opacity-80 md:col-span-2">Or paste article/transcript text</label>
            <textarea
              value={pasted} onChange={e=>setPasted(e.target.value)} rows={7}
              placeholder="Paste text here…"
              className="md:col-span-2 w-full rounded-xl p-3 bg-white border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={createLesson} disabled={loading}
              className="px-4 h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg disabled:opacity-60 flex items-center gap-2"
              aria-busy={loading}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {loading ? 'Creating…' : 'Create Lesson'}
            </button>
            <button onClick={()=>{ if(summary){ saveLesson() } else { setError('Create a lesson first.') }}} className="px-4 h-11 rounded-xl bg-white border border-black/10 hover:bg-black/5 flex items-center gap-2">
              <Save className="h-5 w-5" /> Save
            </button>
            <button onClick={exportDocx} className="px-4 h-11 rounded-xl bg-emerald-600 text-white hover:brightness-110 shadow flex items-center gap-2">
              <Download className="h-5 w-5" /> Download .docx
            </button>
            <button onClick={()=>{ setUrl(''); setPasted('') }} className="px-4 h-11 rounded-xl bg-white border border-black/10 hover:bg-black/5 flex items-center gap-2">
              <Eraser className="h-5 w-5" /> Clear inputs
            </button>
            <div aria-live="polite" className="text-red-600 text-sm">{error}</div>
          </div>
        </motion.section>

        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.35,delay:0.1}} className={`${glossyCard} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-semibold">Summary</h2>
              </div>
              <p className="leading-7">{summary}</p>
            </motion.section>

            <motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.35,delay:0.12}} className={`${glossyCard} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Type className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-semibold">Simplified</h2>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-black/5 border border-black/10">Level: {readingLevel}</span>
              </div>
              <p className="leading-7">{simple}</p>
            </motion.section>

            <motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.35,delay:0.14}} className={`${glossyCard} p-5`}>
              <h2 className="text-lg font-semibold mb-3">Flashcards</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cards.map((c,i)=>(
                  <div key={i} className="rounded-xl p-3 border border-black/10 bg-white/70">
                    <div className="font-medium">{c.term}</div>
                    <div className="text-sm opacity-80">{c.definition}</div>
                  </div>
                ))}
                {!cards.length && <div className="text-sm opacity-70">No flashcards generated.</div>}
              </div>
            </motion.section>

            <motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.35,delay:0.16}} className={`${glossyCard} p-5`}>
              <h2 className="text-lg font-semibold mb-3">Quiz</h2>
              <ol className="space-y-4 list-decimal ml-6">
                {quiz.map((q,i)=>{
                  const picked=answers[i]
                  return (
                    <li key={i}>
                      <div className="mb-2">{q.question}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((o,j)=>{
                          const isPicked=picked===o
                          const isCorrect=o===q.answer
                          const base="text-left rounded-xl p-2 border"
                          const cls=isPicked ? (isCorrect?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600') : 'bg-white/70 border-black/10 hover:bg-black/5'
                          return (
                            <button key={j} onClick={()=>choose(i,o)} className={`${base} ${cls}`}>{o}</button>
                          )
                        })}
                      </div>
                      {picked && (<div className={`mt-2 text-sm ${picked===q.answer?'text-emerald-700':'text-red-700'}`}>{picked===q.answer?'Correct':`Answer: ${q.answer}`}</div>)}
                    </li>
                  )
                })}
                {!quiz.length && <div className="text-sm opacity-70">No quiz questions generated.</div>}
              </ol>
            </motion.section>
          </div>
        )}

        <motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.35,delay:0.18}} className={`${glossyCard} p-5 mt-6`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">My lessons</h2>
            <button onClick={()=>{ store.clear(); setLessons([]) }} className="px-3 h-10 rounded-xl bg-white border border-black/10 hover:bg-black/5 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Clear saved
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lessons.map(l=>(
              <div key={l.id} className="rounded-xl p-3 border border-black/10 bg-white/70">
                <div className="font-medium line-clamp-2">{l.title}</div>
                <div className="text-xs opacity-70 mt-1">{new Date(l.createdAt).toLocaleString()}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={()=>loadLesson(l.id)} className="px-3 h-9 rounded-lg bg-white border border-black/10 hover:bg-black/5">Load</button>
                  <button onClick={()=>deleteLesson(l.id)} className="px-3 h-9 rounded-lg bg-red-600 text-white">Delete</button>
                </div>
              </div>
            ))}
            {!lessons.length && <div className="text-sm opacity-70">No saved lessons yet.</div>}
          </div>
        </motion.section>
      </main>

      <footer className="max-w-5xl mx-auto px-5 py-8 text-xs opacity-70">
        <div>© {new Date().getFullYear()} TinyTeacher • Built with React, Vite & Tailwind</div>
      </footer>

      <div className="only-print p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">TinyTeacher — Lesson</h1>
          {summary ? (
            <>
              <h2 className="text-xl font-semibold mb-2">Summary</h2>
              <p className="mb-4">{summary}</p>
              <h2 className="text-xl font-semibold mb-2">Simplified ({readingLevel})</h2>
              <p className="mb-4">{simple}</p>
              <h2 className="text-xl font-semibold mb-2">Flashcards</h2>
              <ul className="mb-4 list-disc ml-6">
                {cards.map((c,i)=>(<li key={i}><b>{c.term}:</b> {c.definition}</li>))}
              </ul>
              <h2 className="text-xl font-semibold mb-2">Quiz</h2>
              <ol className="list-decimal ml-6 space-y-4">
                {quiz.map((q,i)=>(
                  <li key={i}>
                    <div className="mb-1">{q.question.replace('_____', '__________')}</div>
                    <div className="text-sm opacity-60">Options: {q.options.join(', ')}</div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>No lesson to print.</p>
          )}
        </div>
      </div>
    </div>
  )
}
