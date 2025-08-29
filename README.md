# TinyTeacher
**Turn any article or transcript into a 10-minute lesson.**  
Summary → Simplified (A2↔B2) → Flashcards → Quiz → **DOCX export**. Works offline, PWA-ready. TTS and Dyslexia-friendly built in.

## Why
Under-resourced schools and NGOs lack tools that are simple, private, and free. TinyTeacher runs in the browser, costs $0, and helps teachers create clean, editable lesson packs in minutes.

## Key Features
- 🧠 **Heuristic summarizer** (no API keys, works offline)
- ✂️ **Reading level** slider (A2 ↔ B2)
- 🗣️ **Text-to-Speech** (Web Speech; offline on most devices)
- ♿ **Dyslexia-friendly mode** (spacing, contrast)
- 🗂️ **Flashcards & MCQ quiz** (auto-generated)
- 📝 **Export to DOCX** (teacher-friendly, fully editable)
- 💾 **Local saves** (no accounts, no server)
- 🌙 **Dark mode** (persisted)
- 📱 **PWA** (installable, offline-first)

## Live
- Dev: `npm run dev` → open `http://localhost:5173`
- PWA install: Chrome → menu → “Install TinyTeacher”

## Stack
- **React 18 + Vite + Tailwind**
- **framer-motion** (polish), **lucide-react** (icons)
- **docx** (Word export)
- **vite-plugin-pwa** (offline)
- Vanilla JS heuristics (summary/simplify/quiz)

## Architecture
```
Browser (PWA)
- UI (React/Tailwind/framer-motion)
- Heuristics (summary/simplify/flashcards/quiz)
- TTS (Web Speech API)
- Local storage (browser)
- Export (docx)
````

## Quickstart
```bash
# Node 18+ (recommended)
npm install
npm run dev
````

### Build & Deploy

* **Static build**: `npm run build`
* Host `/dist` on any static host.
* **Vercel**: import repo → Framework: Vite → Build: `npm run build` → Output: `dist/`
* **PWA**: icons in `public/icons/`, manifest via `vite.config.js`

## Usage

1. Paste **URL** (CORS-friendly) or **text**.
2. Click **Create Lesson**.
3. Adjust **Reading level** (A2/B2).
4. (Optional) **Play** to listen (TTS).
5. **Save** locally or **Download .docx**.

## Accessibility

* Dyslexia mode (increased line/word spacing)
* Visible focus rings
* Keyboard-friendly controls
* TTS for auditory learning

## Privacy

* No accounts. No analytics. Content stays in the browser.
* Exported DOCX generated locally.

## Limitations

* Heuristic summarization ≠ factual verification.
* Some URLs require a CORS-friendly proxy or pasting raw text.

## Roadmap

* Improved entity/key-phrase ranking
* Teacher templates for DOCX (grade levels)
* Offline OCR (optional lazy-loaded)
* Basic analytics **on-device** (privacy-preserving)

## Why it works

* **Innovation**: offline, no-cost pipeline; teacher-ready DOCX; A2/B2 + dyslexia + TTS in one.
* **Technical**: custom heuristics + PWA + DOCX generation.
* **Impact**: zero-cost tool for under-resourced classrooms.
* **Presentation**: simple flow, clear story; demo under 2 minutes.
* **Commercial**: free core; premium templates/branding/organizational features.
* **Design & UX**: polished UI, mobile-first, accessible.

## Dev 

```bash
npm run dev      # start
npm run build    # production build
npm run preview  # preview build
```

## License

MIT - see `LICENSE`
