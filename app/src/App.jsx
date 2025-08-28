import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const CORS_PROXY = "https://tinyteacher-cors.lotopo5924.workers.dev/?u="

function normalize(text) { return (text || '').replace(/\s+/g, ' ').trim() }
function splitSentences(text) { const p = normalize(text).match(/[^.!?]+[.!?]*/g) || []; return p.map(s=>s.trim()).filter(Boolean) }
function tokenize(text) { const t=(text||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,''); return t.match(/[a-ząćęłńóśźż0-9]+/gi) || [] }

const STOP = new Set(['i','oraz','lub','albo','a','w','na','do','z','że','to','jak','o','od','po','u','przy','dla','ten','ta','to','te','tam','tu','jest','są','był','była','było','być','nie','tak','czy','się','nad','pod','między','który','która','które','the','and','or','of','in','on','to','for','with','is','are','was','were','be','by','as','at','it','this','that','an','a','from','into','over','under','between','which','who','whose','whom'])
function wordFreq(words){const f={};for(const w of words){if(w.length<3)continue;if(STOP.has(w))continue;f[w]=(f[w]||0)+1}return f}
function topKeywordsSimple(text,k=8){const f=wordFreq(tokenize(text));const terms=Object.entries(f).sort((a,b)=>b[1]-a[1]).map(([w])=>w).filter(w=>!/^\d+$/.test(w));const out=[];const seen=new Set();for(const w of terms){if(out.length>=k)break;if(seen.has(w))continue;out.push(w);seen.add(w)}return out}
function jaccard(a,b){const A=new Set(tokenize(a)),B=new Set(tokenize(b));const inter=[...A].filter(x=>B.has(x)).length;const uni=new Set([...A,...B]).size||1;return inter/uni}
function summarize(text,maxSentences=5){const sents=splitSentences(text);if(sents.length<=maxSentences)return sents.join(' ');const words=tokenize(text);const freq=wordFreq(words);const kw=new Set(topKeywordsSimple(text,12));const scored=sents.map((s,i)=>{const sw=tokenize(s);const base=sw.reduce((a,w)=>a+(freq[w]||0),0)/Math.max(sw.length,1);const kwHits=[...kw].reduce((a,k)=>a+(s.toLowerCase().includes(k)?1:0),0);const pos=1-i/sents.length;const lenPenalty=Math.max(0,sw.length-28)/28;const score=0.6*base+0.25*kwHits+0.15*pos-0.1*lenPenalty;return {i,s:s.trim(),score}}).sort((a,b)=>b.score-a.score);const chosen=[];for(const c of scored){if(chosen.length>=maxSentences)break;if(chosen.every(x=>jaccard(x.s,c.s)<0.6))chosen.push(c)}chosen.sort((a,b)=>a.i-b.i);return chosen.map(x=>x.s).join(' ')}
function simplify(text,targetLen=16){const sents=splitSentences(text).slice(0,6);const map=new Map([['utilize','use'],['approximately','about'],['numerous','many'],['prior to','before'],['zastosować','użyć'],['aproksymacja','przybliżenie'],['poprzez','przez'],['w celu','aby'],['implementacja','wdrożenie'],['konfiguracja','ustawienie'],['komponent','część']]);return sents.map(s=>{let t=s.replace(/\([^)]*\)/g,' ').replace(/[–—]/g,'-');for(const [k,v] of map.entries()) t=t.replace(new RegExp(`\\b${k}\\b`,'gi'),v);const w=t.trim().split(/\s+/);if(w.length>targetLen)t=w.slice(0,targetLen).join(' ')+'…';return t.trim()}).join(' ')}
function pickContextSentence(sents,term){const lower=term.toLowerCase();const exact=sents.find(s=>s.toLowerCase().includes(lower));if(exact)return exact;let best='',score=0;for(const s of sents){const sc=jaccard(s,term);if(sc>score){score=sc;best=s}}return best||sents[0]||''}
function makeFlashcards(text,kw,maxN=6){const sents=splitSentences(text);const out=[];const seen=new Set();for(const t of kw){if(out.length>=maxN)break;if(seen.has(t))continue;const s=pickContextSentence(sents,t);const def=normalize(s);if(!def)continue;out.push({term:t,definition:def});seen.add(t)}return out}
function makeQuiz(text,kw,n=5){const sents=splitSentences(text);const pool=kw.slice(0,12);const qs=[];const used=new Set();for(const term of pool){if(qs.length>=n)break;if(used.has(term))continue;const s=pickContextSentence(sents,term);if(!s)continue;const re=new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`,'i');if(!re.test(s))continue;const blank=s.replace(re,'_____').trim();let distractors=pool.filter(k=>k!==term && !s.toLowerCase().includes(k.toLowerCase()));while(distractors.length<3)distractors=distractors.concat(pool.filter(k=>k!==term));const options=[term,...distractors.slice(0,3)].sort(()=>Math.random()-0.5);qs.push({question:blank,options,answer:term});used.add(term)}return qs}

async function fetchHtml(url){
  try{const res=await fetch(url,{mode:'cors'});if(res.ok&&((res.headers.get('content-type')||'').includes('text/html')))return await res.text()}catch{}
  try{const res=await fetch(CORS_PROXY+encodeURIComponent(url));if(res.ok)return await res.text()}catch{}
  return null
}
function extractTextFromHtml(html){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,noscript').forEach(e=>e.remove());const main=doc.querySelector('main, article')||doc.body;return (main?.textContent||'').replace(/\s+/g,' ').trim()}

function useLessonsStore(){
  const key='tinyteacher-lessons'
  const read=()=>{try{const v=localStorage.getItem(key);return v?JSON.parse(v):[]}catch{return []}}
  const write=(arr)=>{try{localStorage.setItem(key,JSON.stringify(arr))}catch{}}
  const add=(lesson)=>{const arr=read();arr.unshift(lesson);write(arr)}
  const remove=(id)=>{const arr=read().filter(x=>x.id!==id);write(arr)}
  return { read, add, remove }
}

export default function App(){
  const [url,setUrl]=useState('')
  const [pasted,setPasted]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [summary,setSummary]=useState('')
  const [simple,setSimple]=useState('')
  const [cards,setCards]=useState([])
  const [quiz,setQuiz]=useState([])
  const [answers,setAnswers]=useState({})
  const [lessons,setLessons]=useState([])
  const [shareLink,setShareLink]=useState('')
  const qrRef=useRef(null)
  const store=useLessonsStore()
  const baseURL=`${window.location.origin}${import.meta.env.BASE_URL}`

  useEffect(()=>{ setLessons(store.read()) },[])
  useEffect(()=>{
    const h=window.location.hash
    if(h.startsWith('#lesson=')){
      const enc=h.slice('#lesson='.length)
      const json=decompressFromEncodedURIComponent(enc)
      try{
        const obj=JSON.parse(json)
        hydrate(obj)
      }catch{}
    }
  },[])

  const hydrate=(obj)=>{
    setUrl(obj.url||'')
    setPasted(obj.sourceText||'')
    setSummary(obj.summary||'')
    setSimple(obj.simple||'')
    setCards(obj.cards||[])
    setQuiz(obj.quiz||[])
    setAnswers({})
    setError('')
  }

  const createLesson=async ()=>{
    setError('');setLoading(true)
    setSummary('');setSimple('');setCards([]);setQuiz([]);setAnswers({})
    let text=normalize(pasted)
    if(!text && url){ const html=await fetchHtml(url); if(html) text=extractTextFromHtml(html) }
    if(!text){ setLoading(false); setError('Provide a URL that allows CORS or paste the text/transcript below.'); return }
    const sum=summarize(text,5)
    const simp=simplify(sum,16)
    const kws=topKeywordsSimple(text,8)
    const fc=makeFlashcards(text,kws,6)
    const qz=makeQuiz(text,kws,5)
    setSummary(sum);setSimple(simp);setCards(fc);setQuiz(qz);setLoading(false)
  }

  const choose=(qi,opt)=>{ setAnswers(p=>({...p,[qi]:opt})) }

  const saveLesson=()=>{
    if(!summary){ setError('Create a lesson first.'); return }
    const title=(splitSentences(summary)[0]||'Lesson').slice(0,80)
    const lesson={ id:Date.now(), title, url, sourceText:normalize(pasted), summary, simple, cards, quiz, createdAt:new Date().toISOString() }
    store.add(lesson)
    setLessons(store.read())
  }

  const loadLesson=(id)=>{
    const l=store.read().find(x=>x.id===id)
    if(!l) return
    hydrate(l)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  const deleteLesson=(id)=>{
    store.remove(id)
    setLessons(store.read())
  }

  const printLesson=()=>{ if(!summary){ setError('Create a lesson first.'); return } window.print() }

  const makeShare=async ()=>{
    if(!summary){ setError('Create a lesson first.'); return }
    const payload={ url, sourceText:normalize(pasted), summary, simple, cards, quiz }
    const enc=compressToEncodedURIComponent(JSON.stringify(payload))
    const link=`${baseURL}#lesson=${enc}`
    setShareLink(link)
    if(qrRef.current){
      try{ await QRCode.toCanvas(qrRef.current, link, { width: 240, margin: 1 }) }catch{}
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2 break-words">TinyTeacher</h1>
        <p className="mb-6 text-sm opacity-80 break-words">Offline-first lessons: summary, simplified, flashcards, quiz. Save locally, print, share via QR.</p>

        <div className="space-y-3 mb-6">
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Paste a URL (optional)" className="w-full border rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 break-words" />
          <textarea value={pasted} onChange={e=>setPasted(e.target.value)} placeholder="Or paste article/transcript text here" rows={8} className="w-full border rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={createLesson} disabled={loading} className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50 shadow-sm">{loading ? 'Creating…' : 'Create Lesson'}</button>
            <button onClick={saveLesson} className="px-4 py-2 rounded-xl bg-gray-900 text-white shadow-sm">Save lesson</button>
            <button onClick={printLesson} className="px-4 py-2 rounded-xl bg-gray-200">Print</button>
            <button onClick={makeShare} className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow-sm">Share (QR)</button>
            {error && <div className="text-red-600 text-sm break-words">{error}</div>}
          </div>
        </div>

        {summary && (
          <div className="space-y-8">
            <section className="border rounded-2xl p-4 bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-2">Summary</h2>
              <p className="leading-7 break-words">{summary}</p>
            </section>

            <section className="border rounded-2xl p-4 bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-2">Simplified</h2>
              <p className="leading-7 break-words">{simple}</p>
            </section>

            <section className="border rounded-2xl p-4 bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-3">Flashcards</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cards.map((c,i)=>(
                  <div key={i} className="border rounded-xl p-3 bg-gray-50 break-words">
                    <div className="font-medium mb-1">{c.term}</div>
                    <div className="text-sm opacity-80">{c.definition}</div>
                  </div>
                ))}
                {!cards.length && <div className="text-sm opacity-70">No flashcards generated.</div>}
              </div>
            </section>

            <section className="border rounded-2xl p-4 bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-3">Quiz</h2>
              <ol className="space-y-4 list-decimal ml-6">
                {quiz.map((q,i)=>{
                  const picked=answers[i]
                  return (
                    <li key={i} className="break-words">
                      <div className="mb-2">{q.question}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((o,j)=>{
                          const isPicked=picked===o
                          const isCorrect=o===q.answer
                          const cls=isPicked ? (isCorrect?'bg-green-600 text-white':'bg-red-600 text-white') : 'bg-gray-100 text-gray-900'
                          return (
                            <button key={j} onClick={()=>choose(i,o)} className={`text-left border rounded-xl p-2 break-words ${cls}`}>{o}</button>
                          )
                        })}
                      </div>
                      {picked && (<div className={`mt-2 text-sm ${picked===q.answer?'text-green-700':'text-red-700'}`}>{picked===q.answer?'Correct':`Answer: ${q.answer}`}</div>)}
                    </li>
                  )
                })}
                {!quiz.length && <div className="text-sm opacity-70">No quiz questions generated.</div>}
              </ol>
            </section>

            {shareLink && (
              <section className="border rounded-2xl p-4 bg-white shadow-sm">
                <h2 className="text-xl font-semibold mb-3">Share</h2>
                <p className="text-sm opacity-80 mb-2 break-words">Scan the QR or copy the link.</p>
                <canvas ref={qrRef} className="mb-3 mx-auto"></canvas>
                <input value={shareLink} readOnly className="w-full border rounded-xl p-2 bg-gray-50 break-words" />
                {window.location.hostname.includes('localhost') && (
                  <p className="text-xs opacity-70 mt-2">Tip: QR will work best on your deployed GitHub Pages URL.</p>
                )}
              </section>
            )}
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-3">My lessons</h2>
          <div className="space-y-2">
            {lessons.map(l=>(
              <div key={l.id} className="flex items-center justify-between border rounded-xl p-3 bg-white shadow-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.title}</div>
                  <div className="text-xs opacity-70">{new Date(l.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>loadLesson(l.id)} className="px-3 py-1 rounded-lg bg-gray-200">Load</button>
                  <button onClick={()=>deleteLesson(l.id)} className="px-3 py-1 rounded-lg bg-red-600 text-white">Delete</button>
                </div>
              </div>
            ))}
            {!lessons.length && <div className="text-sm opacity-70">No saved lessons yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
