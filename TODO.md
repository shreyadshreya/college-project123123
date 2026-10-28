# Project Status / TODO

Saved: 2026-10-28 — no-results update

## How to resume

```bash
# Backend (from backend/)
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (from frontend/)
npm run dev
# open http://localhost:3000 in Chrome
```

## Working

- Voice login validated against the same existing student name + registration-number record; unknown students are not auto-registered
- Admin question-paper upload (PDF/JPG/JPEG/PNG) with drag & drop, preview, review/edit before saving
- Text PDF extraction + scanned PDF/image OCR (verified with `WebProg.pdf` → 7 questions)
- MCQ exam: TTS + STT, option matching incl. "be/see/two", navigation, keyboard fallback
- Descriptive exam: speak answer → "done" → confirm → submit
- Exam completion confirmation with no score, grading, or results page; raw answers saved to `submissions.json`
- Robust STT (auto-restart, generation guard, echo suppression, error messages)
- Git initial commit; README + setup docs complete

## Remaining for tomorrow

1. **Live voice test in Chrome** — login → answer → submit (requires real microphone)
2. **Visual check of image upload/review** — Admin: upload a JPG/PNG, edit a question, click Save Questions
3. **Re-upload `WebProg.pdf`** in Admin — the current paper is the 15-question AI sample
4. **Live submit check** — finish an exam and confirm the completion screen appears without a score.

## Optional future enhancements

- Clean the historical test/duplicate entries in `backend/data/students.json` and confirm the official registration-number format before a real examination
- Exam timer / retake limit / question shuffle
- Admin authentication (currently open to anyone on the network)
- Move from JSON files to a real database

## Data notes

- `backend/data/questions.json` is committed (sample paper).
- `backend/data/students.json` and `backend/data/submissions.json` are **excluded from git** (personal data) but remain on this machine.
- `backend/data/results.json` is a legacy file; the application no longer reads or writes it.
- Deleting a data JSON file resets that part of the system; it is recreated automatically.
