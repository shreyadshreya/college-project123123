# Project Status / TODO

Saved: 2026-10-28 — admin submissions update

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
- Exam completion confirmation with no score or results page for students
- Answers now persist to `backend/data/results.json` with student identity, exam ID/name, timestamp, question IDs, options/text, submitted answers, correct answers when known, and available marks
- Authenticated admin login (bearer token; `/admin/*` and `/sample/*` protected)
- Admin **Student Answers** tab with search, refresh, submission table, and detailed per-question answer modal
- Admin-only automatic MCQ correctness and percentage score; descriptive answers remain pending and are displayed as submitted
- Backward-compatible normalisation of the five existing legacy result records (no old records rewritten)
- Robust STT (auto-restart, generation guard, echo suppression, error messages)
- Verified API auth, end-to-end student→admin browser workflow, persistence after backend restart, and frontend production build

## Remaining for tomorrow

1. **Live voice test in Chrome** — login → answer → submit (requires real microphone)
2. **Visual check of image upload/review** — Admin: upload a JPG/PNG, edit a question, click Save Questions
3. **Re-upload `WebProg.pdf`** in Admin — the current paper is the 15-question AI sample
4. **Change the fallback admin credentials** before any shared/production use; set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN_SECRET`
5. **Clean and verify student records** — confirm the official registration-number format and remove duplicate/test identities with the examination office
6. **Manual descriptive-answer evaluation** — no grading/feedback editor exists yet; the admin view shows only stored evaluation data

## Optional future enhancements

- Exam timer / retake limit / question shuffle
- Server-side search and pagination for very large submission lists
- Manual descriptive grading and feedback entry (admin-only)
- Move from JSON files to a real database

## Data notes

- `backend/data/questions.json` is committed (sample paper).
- `backend/data/students.json` and `backend/data/results.json` are **excluded from git** (personal data) but remain on this machine.
- `backend/data/backups/` contains timestamped backups made before the storage-format change and is excluded from git.
- Existing legacy result records are read and normalised in the admin view; they are never rewritten or deleted. Legacy records lack timestamps/exam IDs, so those fields display as not recorded.
- `backend/data/submissions.json` is no longer written or read. The application now appends to `results.json`.
- Test submissions created during verification were removed; the original five result records are unchanged (hash `94BFBF8CFDE9DD661CE73542A4B84DAD31E6AC9792F47B26517581EC45272203`).
- Deleting a data JSON file resets that part of the system; it is recreated automatically.
