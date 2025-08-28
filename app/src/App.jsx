import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx'

const CORS_PROXY = "https://tinyteacher-cors.lotopo5924.workers.dev/?u="

function normalize(t){return (t||'').replace(/\s+/g,' ').trim()}
function splitSentences(t){const p=normalize(t).match(/[^.!?]+[.!?]*/g)||[];return p.map(s=>s.trim()).filter(Boolean)}
function tokenize(t){const x=(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');return x.match(/[a-ząćęłńóśźż0-9]+/gi)||[]}
const STOP=new Set(['i','oraz','lub','albo','a','w','na','do','z','że','to','jak','o','od','po','u','przy','dla','ten','ta','to','te','tam','tu','jest','są','był','była','było','być','nie','tak','czy','się','nad','pod','między','który','która','które','the','and','or','of','in','on','to','for','with','is','are','was','were','be','by','as','at','it','this','that','an','a','from','into','over','under','between','which','who','whose','whom'])
function wordFreq(words){const f={};for(const w of words){if(w.length<3)continue;if(STOP.has(w))continue;f[w]=(f[w]||0)+1}return f}
function topKeywordsSimple(text,k=8){const f=wordFreq(tokenize(text));const terms=Object.entries(f).sort((a,b)=>b[1]-a[1]).map(([w])=>w).filter(w=>!/^\d+$/.test(w));const out=[];const seen=new Set();for(const w of terms){if(out.length>=k)break;if(seen.has(w))continue;out.push(w);seen.add(w)}return out}
function jaccard(a,b){const A=new Set(tokenize(a)),B=new Set(tokenize(b));const inter=[...A].filter(x=>B.has(x)).length;const uni=new Set([...A,...B]).size||1;return inter/uni}
function summarize(text,maxSentences=5){const sents=splitSentences(text);if(sents.length<=maxSentences)return sents.join(' ');const words=tokenize(text);const freq=wordFreq(words);const kw=new Set(topKeywordsSimple(text,12));const scored=sents.map((s,i)=>{const sw=tokenize(s);const base=sw.reduce((a,w)=>a+(freq[w]||0),0)/Math.max(sw.length,1);const kwHits=[...kw].reduce((a,k)=>a+(s.toLowerCase().includes(k)?1:0),0);const pos=1-i/sents.length;const lenPenalty=Math.max(0,sw.length-28)/28;const score=0.6*base+0.25*kwHits+0.15*pos-0.1*lenPenalty;return {i,s:s.trim(),score}}).sort((a,b)=>b.score-a.score);const chosen=[];for(const c of scored){if(chosen.length>=maxSentences)break;if(chosen.every(x=>jaccard(x.s,c.s)<0.6))chosen.push(c)}chosen.sort((a,b)=>a.i-b.i);return chosen.map(x=>x.s).join(' ')}
function simplify(text,targetLen=16){const s=splitSentences(text).slice(0,6);const map=new Map([['utilize','use'],['approximately','about'],['numerous','many'],['prior to','before'],['zastosować','użyć'],['aproksymacja','przybliżenie'],['poprzez','przez'],['w celu','aby'],['implementacja','wdrożenie'],['konfiguracja','ustawienie'],['komponent','część']]);return s.map(x=>{let t=x.replace(/\([^)]*\)/g,' ').replace(/[–—]/g,'-');for(const [k,v] of map.entries())t=t.replace(new RegExp(`\\b${k}\\b`,'gi'),v);const w=t.trim().split(/\s+/);if(w.length>targetLen)t=w.slice(0,targetLen).join(' ')+'…';return t.trim()}).join(' ')}
function pickContextSentence(sents,term){const lower=term.toLowerCase();const exact=sents.find(s=>s.toLowerCase().includes(lower));if(exact)return exact;let best='',score=0;for(const s of sents){const sc=jaccard(s,term);if(sc>score){score=sc;best=s}}return best||sents[0]||''}
function makeFlashcards(text,kw,maxN=6){const s=splitSentences(text);const out=[];const seen=new Set();for(const t of kw){if(out.length>=maxN)break;if(seen.has(t))continue;const c=pickContextSentence(s,t);const def=normalize(c);if(!def)continue;out.push({term:t,definition:def});seen.add(t)}return out}
function makeQuiz(text,kw,n=5){const s=splitSentences(text);const pool=kw.slice(0,12);const qs=[];const used=new Set();for(const term of pool){if(qs.length>=n)break;if(used.has(term))continue;const c=pickContextSentence(s,term);if(!c)continue;const re=new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`,'i');if(!re.test(c))continue;const blank=c.replace(re,'_____').trim();let distractors=pool.filter(k=>k!==term&&!c.toLowerCase().includes(k.toLowerCase()));while(distractors.length<3)distractors=distractors.concat(pool.filter(k=>k!==term));const options=[term,...distractors.slice(0,3)].sort(()=>Math.random()-0.5);qs.push({question:blank,options,answer:term});used.add(term)}return qs}

async function fetchHtml(url){try{const r=await fetch(url,{mode:'cors'});if(r.ok&&((r.headers.get('content-type')||'').includes('text/html')))return await r.text()}catch{}try{const r=await fetch(CORS_PROXY+encodeURIComponent(url));if(r.ok)return await r.text()}catch{}return null}
function extractTextFromHtml(html){const d=new DOMParser().parseFromString(html,'text/html');d.querySelectorAll('script,style,noscript').forEach(e=>e.remove());const m=d.querySelector('main, article')||d.body;return (m?.textContent||'').replace(/\s+/g,' ').trim()}

function useLessonsStore(){const key='tinyteacher-lessons';const read=()=>{try{const v=localStorage.getItem(key);return v?JSON.parse(v):[]}catch{return []}};const write=a=>{try{localStorage.setItem(key,JSON.stringify(a))}catch{}};const add=l=>{const a=read();a.unshift(l);write(a)};const remove=id=>{const a=read().filter(x=>x.id!==id);write(a)};const clear=()=>{try{localStorage.removeItem(key)}catch{}};return {read,add,remove,clear}}

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
  const [qrData,setQrData]=useState('')
  const [copied,setCopied]=useState(false)
  const qrImgRef=useRef(null)
  const store=useLessonsStore()
  const baseURL=`${window.location.origin}${import.meta.env.BASE_URL}`

  useEffect(()=>{ setLessons(store.read()) },[])
  useEffect(()=>{ const h=window.location.hash; if(h.startsWith('#lesson=')){ const enc=h.slice('#lesson='.length); const json=decompressFromEncodedURIComponent(enc); try{ hydrate(JSON.parse(json)) }catch{} }},[])

  const hydrate=obj=>{ setUrl(obj.url||''); setPasted(obj.sourceText||''); setSummary(obj.summary||''); setSimple(obj.simple||''); setCards(obj.cards||[]); setQuiz(obj.quiz||[]); setAnswers({}); setError(''); setShareLink(''); setQrData(''); setCopied(false) }
  const clearCurrent=(keepInputs=false)=>{ if(!keepInputs){ setUrl(''); setPasted('') } setSummary(''); setSimple(''); setCards([]); setQuiz([]); setAnswers({}); setError(''); setShareLink(''); setQrData(''); setCopied(false) }
  const clearAllSaved=()=>{ store.clear(); setLessons([]) }

  const createLesson=async ()=>{
    setError(''); setLoading(true); clearCurrent(true)
    let text=normalize(pasted)
    if(!text && url){ const html=await fetchHtml(url); if(html) text=extractTextFromHtml(html) }
    if(!text){ setLoading(false); setError('Provide a URL that allows CORS or paste the text/transcript below.'); return }
    const sum=summarize(text,5); const simp=simplify(sum,16)
    const kws=topKeywordsSimple(text,8); const fc=makeFlashcards(text,kws,6); const qz=makeQuiz(text,kws,5)
    setSummary(sum); setSimple(simp); setCards(fc); setQuiz(qz); setLoading(false)
  }

  const choose=(qi,opt)=> setAnswers(p=>({...p,[qi]:opt}))
  const saveLesson=()=>{ if(!summary){ setError('Create a lesson first.'); return } const title=(splitSentences(summary)[0]||'Lesson').slice(0,80); const lesson={ id:Date.now(), title, url, sourceText:normalize(pasted), summary, simple, cards, quiz, createdAt:new Date().toISOString() }; store.add(lesson); setLessons(store.read()) }
  const loadLesson=id=>{ const l=store.read().find(x=>x.id===id); if(!l)return; hydrate(l); window.scrollTo({top:0,behavior:'smooth'}) }
  const deleteLesson=id=>{ store.remove(id); setLessons(store.read()) }

  const makeShare=async ()=>{
    if(!summary){ setError('Create a lesson first.'); return }
    const payload={ url, sourceText:normalize(pasted), summary, simple, cards, quiz }
    const enc=compressToEncodedURIComponent(JSON.stringify(payload))
    const link=`${baseURL}#lesson=${enc}`
    setShareLink(link); setCopied(false)
    try{ const dataUrl=await QRCode.toDataURL(link,{width:240,margin:1}); setQrData(dataUrl) }catch{}
  }
  const copyShare=async ()=>{ if(!shareLink) return; try{ await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(()=>setCopied(false),1200) }catch{} }

  const exportDocx=async ()=>{
    if(!summary){ setError('Create a lesson first.'); return }
    const title='TinyTeacher — Lesson'
    const doc=new Document({
      sections:[{
        properties:{page:{margin:{top:720,right:720,bottom:720,left:720}}}, // 1" margins
        children:[
          new Paragraph({ text:title, heading:HeadingLevel.TITLE, alignment:AlignmentType.LEFT }),
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto p-6 print:hidden">
        <h1 className="text-3xl font-bold mb-2 break-words">TinyTeacher</h1>
        <p className="mb-6 text-sm opacity-80 break-words">Offline-first lessons: summary, simplified, flashcards, quiz. Save, DOCX export, and optional QR share.</p>

        <div className="space-y-3 mb-6">
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Paste a URL (optional)" className="w-full border rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 break-words" />
          <textarea value={pasted} onChange={e=>setPasted(e.target.value)} placeholder="Or paste article/transcript text here" rows={8} className="w-full border rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={createLesson} disabled={loading} className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50 shadow-sm">{loading ? 'Creating…' : 'Create Lesson'}</button>
            <button onClick={saveLesson} className="px-4 py-2 rounded-xl bg-gray-900 text-white shadow-sm">Save</button>
            <button onClick={exportDocx} className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow-sm">Download .docx</button>
            <button onClick={makeShare} className="px-4 py-2 rounded-xl bg-purple-600 text-white shadow-sm">Share (QR)</button>
            <button onClick={()=>clearCurrent()} className="px-4 py-2 rounded-xl bg-orange-500 text-white shadow-sm">Clear current</button>
            <button onClick={clearAllSaved} className="px-4 py-2 rounded-xl bg-red-600 text-white shadow-sm">Clear saved</button>
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
                            <button key={j} onClick={()=>setAnswers(p=>({...p,[i]:o}))} className={`text-left border rounded-xl p-2 break-words ${cls}`}>{o}</button>
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

            <section className="border rounded-2xl p-4 bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-3">Share</h2>
              {!shareLink && <p className="text-sm opacity-80 mb-3">Click <b>Share (QR)</b> to generate a link that encodes this lesson in the URL fragment. Scan QR on another device or copy the link.</p>}
              <div className="flex flex-col items-center gap-3">
                {qrData ? <img ref={qrImgRef} src={qrData} alt="QR" className="w-60 h-60" /> : <div className="w-60 h-60 bg-gray-100 rounded-xl flex items-center justify-center text-xs opacity-60">QR will appear here</div>}
                <input value={shareLink || ''} readOnly placeholder="Generated link will appear here" className="w-full border rounded-xl p-2 bg-gray-50 break-words" />
                <div className="flex gap-2">
                  <button onClick={copyShare} disabled={!shareLink} className="px-3 py-1 rounded-lg bg-gray-900 text-white">{copied ? 'Copied' : 'Copy link'}</button>
                  <a href={shareLink || '#'} target="_blank" rel="noreferrer" className={`px-3 py-1 rounded-lg ${shareLink ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 pointer-events-none'}`}>Open link</a>
                </div>
                <p className="text-xs opacity-70 text-center">No server used. The data is inside <code>#lesson=…</code> in the URL.</p>
              </div>
            </section>
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

      <div className="only-print p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4 break-words">TinyTeacher — Lesson</h1>
          {summary ? (
            <>
              <h2 className="text-xl font-semibold mb-2">Summary</h2>
              <p className="mb-4 break-words">{summary}</p>
              <h2 className="text-xl font-semibold mb-2">Simplified</h2>
              <p className="mb-4 break-words">{simple}</p>
              <h2 className="text-xl font-semibold mb-2">Flashcards</h2>
              <ul className="mb-4 list-disc ml-6">
                {cards.map((c,i)=>(<li key={i} className="break-words"><b>{c.term}:</b> {c.definition}</li>))}
              </ul>
              <h2 className="text-xl font-semibold mb-2">Quiz</h2>
              <ol className="list-decimal ml-6 space-y-4">
                {quiz.map((q,i)=>(
                  <li key={i} className="break-words">
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
