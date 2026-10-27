# Project Status / TODO

Saved: 2026-10-27 — commit `f5c8f2a`

## How to resume

```bash
# Backend (from backend/)
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (from frontend/)
npm run dev
# open http://localhost:3000 in Chrome
```

## Working

- Voice login (name, reg no, say "login")
- Admin PDF upload with drag & drop + preview
- Scanned PDF OCR extraction (verified with `WebProg.pdf` → 7 questions)
- MCQ exam: TTS + STT, option matching incl. "be/see/two", navigation, keyboard fallback
- Descriptive exam: speak answer → "done" → confirm → submit
- MCQ auto-grading; descriptive manual grading (Admin → Submissions → score + feedback)
- Results page: score/pass-fail, pending evaluation, teacher feedback
- Robust STT (auto-restart, generation guard, echo suppression, error messages)
- Git initial commit; README + setup docs complete

## Remaining for tomorrow

1. **Live voice test in Chrome** — login → answer → submit (requires real microphone)
2. **Re-upload `WebProg.pdf`** in Admin — the current paper is the 15-question AI sample
3. **Visual check of grading flow** — Admin: enter score/feedback → student Results shows graded score
4. **Optional: push to GitHub** — no remote is configured yet:
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin master
   ```

## Optional future enhancements

- Exam timer / retake limit / question shuffle
- Admin authentication (currently open to anyone on the network)
- Per-question marks for descriptive grading (currently one overall score)
- Move from JSON files to a real database

## Data notes

- `backend/data/questions.json` is committed (sample paper).
- `backend/data/students.json` and `results.json` are **excluded from git** (personal data) but remain on this machine.
- Deleting a data JSON file resets that part of the system; it is recreated automatically.
