# AI Driven Accessible Examination and Assessment System for Visually Impaired Students

A fully voice-controlled examination system that lets visually impaired students take exams independently — no scribe, no mouse, no paid screen reader required.

The admin uploads a question paper PDF or image (JPG/PNG), the system extracts the questions automatically, and the student takes the exam entirely by voice: the questions are read aloud and the answers are spoken.

## Features

- **Voice-based login** — student speaks their name and registration number; TTS guides every step and saying **"login"** completes sign-in. Only a full name and registration number that match the same existing student record are accepted.
- **AI question extraction** — upload/drag & drop a PDF, JPG, JPEG, or PNG question paper. Selectable PDF text is read with PyMuPDF; scanned PDFs and images are processed with **RapidOCR**.
- **MCQ exam mode** — TTS reads each question and its A–D options; STT captures spoken answers ("Option A", "be", "two", ...).
- **Descriptive exam mode** — for papers with no options (e.g. short-answer papers), the student speaks the answer, says **"done"**, and confirms with **"yes"**.
- **NLP-style voice navigation** — "Next", "Previous", "Repeat", "Submit", plus conversational variants.
- **Student results stay private** — the exam ends with a submission confirmation, with no score or result page for students. Authenticated admins can review saved answers in **Admin → Student Answers**, including automatic correctness for MCQs and any marks available in stored records.
- **Keyboard fallback** — A–D / 1–4, N, P, R, S shortcuts and typed answers, so the exam works without a microphone.
- **No external hardware** — uses the laptop's built-in microphone and speakers through the browser's Web Speech API.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | ReactJS, React Router, Web Speech API (Speech Synthesis + Speech Recognition) |
| Backend | Python, FastAPI, Uvicorn, PyMuPDF, Pillow, RapidOCR |
| Database | JSON file storage |
| Browser | Google Chrome (recommended for the Web Speech API) |

## Project Structure

```
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── models.py               # Pydantic models (Question, StudentLogin, ...)
│   ├── database.py             # JSON file storage operations
│   ├── admin_auth.py           # Admin credentials, bearer tokens, auth dependency
│   ├── submission_utils.py     # Normalises legacy and current result records
│   ├── pdf_extractor.py        # PDF/image parsing + OCR fallback
│   ├── requirements.txt        # Python dependencies
│   ├── routers/
│   │   ├── admin.py            # PDF/image upload, questions, submissions
│   │   ├── auth.py             # Student login and admin login
│   │   ├── exam.py             # Exam questions and answer submission
│   │   └── sample.py           # Sample AI question paper
│   └── data/
│       ├── questions.json      # Extracted questions
│       ├── students.json       # Registered students (local, ignored by git)
│       ├── results.json        # Submissions/results (local, ignored by git)
│       └── backups/            # Local JSON backups (ignored by git)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Login.jsx       # Voice login
│       │   ├── Admin.jsx       # Admin login, upload, review/edit
│       │   ├── StudentAnswers.jsx # Admin submissions table and answer detail
│       │   └── Exam.jsx        # Voice + keyboard exam engine
│       ├── hooks/useSpeech.js  # TTS + STT hooks
│       └── api.js              # API client
└── WebProg.pdf                 # Example scanned question paper
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Google Chrome
- A microphone and speakers/headphones
- Internet access (Chrome's speech recognition service is online)

### 1. Backend

Set the admin credentials in the same terminal before starting the server. For local development, if they are omitted, the fallback credentials are **`admin` / `admin123`**; change them before sharing the app.

PowerShell:

```powershell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "choose-a-strong-password"
$env:ADMIN_TOKEN_SECRET = "use-a-long-random-secret"
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

macOS/Linux:

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='choose-a-strong-password'
export ADMIN_TOKEN_SECRET='use-a-long-random-secret'
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

The API runs at `http://localhost:8000` (interactive docs at `/docs`). Admin tokens expire after `ADMIN_TOKEN_TTL_SECONDS` (default `28800`, i.e. 8 hours). Restart the backend after changing credentials.

> **Security:** the fallback admin credentials are for local development only. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN_SECRET` to strong values before deploying the project.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in Chrome. The Vite dev server proxies `/api` to the backend at port 8000.

### Production build (optional)

```bash
cd frontend
npm run build
npm run preview
```

## How to Use

### Admin / Teacher

1. Open **Admin** in the navigation bar and sign in with the configured admin username and password.
2. In the **Question Paper** tab, drag & drop a question paper PDF, JPG, JPEG, or PNG (or click to select). A preview is shown.
3. Click **Upload & Extract**. Scanned PDFs and images are OCR-processed automatically. The current question paper is not replaced yet.
4. Review the extracted questions (MCQ or descriptive) in the correction form. Fix OCR mistakes, add missing questions or options, remove spurious ones, or set an answer that was not detected, then click **Save Questions**. Unknown answers are left blank rather than guessed. Use **Review & Correct** to edit the saved paper later.
5. Open the **Student Answers** tab to review submissions. Use the search field to filter by student name or registration number, use **Refresh** to reload saved data, and click **View Answers** to see each question, the student's actual answer, the stored correct answer, automatic MCQ correctness, and any marks that are available.
6. New submissions are saved to `backend/data/results.json`. Descriptive answers are shown as submitted text and remain pending unless marks/evaluation already exist in the stored record; the app does not invent correct answers or marks.

### Student

1. Open the home page and click **Start Voice Login**. You can also type your details.
2. Say your full name as it appears on the college record (e.g. *"My name is Shreiya D"*).
3. Say your registration number (e.g. *"My registration number is U18IW24S0019"*).
4. Say **"login"** (or press Enter). Both details are checked against the same registered student record; unknown or mismatched details are rejected.
5. The exam starts automatically:
   - **MCQ:** after the question is read, say *"Option A"*, *"B"*, *"two"*, etc. Say **"yes"** to confirm, **"no"** to change.
   - **Descriptive:** speak your answer, say **"done"**, then **"yes"** to confirm.
   - Navigation: **"next"**, **"previous"**, **"repeat"**, **"submit"**.
6. After submission, the system confirms that the exam was submitted. The raw answers are saved for the examination office, and no score or result is calculated or shown.

Student records are managed by the examination office; public self-registration is disabled.

## API Endpoints

### Admin

All `/admin/*` endpoints require `Authorization: Bearer <admin access token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/upload-pdf` | Upload a PDF, JPG, JPEG, or PNG and extract questions (with OCR fallback). Add `?save=false` to review without replacing the current paper. |
| GET | `/admin/questions` | Get all extracted questions |
| PUT | `/admin/questions` | Save corrections to extracted questions |
| DELETE | `/admin/questions` | Delete all questions |
| GET | `/admin/submissions` | List saved submissions with student, exam, timestamp, answered count, available marks, and status |
| GET | `/admin/submissions/{submission_id}` | Get one submission with every saved question ID, answer, correct answer, automatic correctness, and available marks |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Validate a full name + registration number against the same registered student |
| POST | `/auth/admin-login` | Validate the configured admin credentials and return a bearer token |
| POST | `/auth/register` | Disabled; student records are managed by the examination office |

### Exam

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/exam/questions` | Get exam questions (without correct answers) |
| GET | `/exam/question/{id}` | Get one question |
| POST | `/exam/submit` | Save answers and return a completion confirmation; no score is returned to the student |

### Sample

All `/sample/*` endpoints require the same admin bearer token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sample/generate-ai-paper` | Load a built-in 15-question sample paper |

## Data Storage

All data lives in `backend/data/` as JSON files:

- `questions.json` — current question paper (committed sample)
- `students.json` — registered students (provisioned by the examination office; ignored by git)
- `results.json` — saved exam submissions (ignored by git)
- `backups/` — timestamped local backups made before the submission-format update (ignored by git)

New records are appended to `results.json` without removing existing records. The record format preserves the student identity, exam ID/name, submission timestamp, counts, status, per-question answers, correct answers when known, automatic MCQ correctness, and available marks:

```json
{
  "id": "0cad5cebbdf84bb2adb7992a1cbf0e11",
  "reg_no": "U18IW24S0019",
  "name": "Shreiya.D",
  "exam_id": "exam-f3b6ec3d47",
  "exam_name": "Current Exam",
  "submitted_at": "2026-10-28T15:56:33.457187+00:00",
  "total_questions": 15,
  "answered": 3,
  "status": "Partially answered",
  "mode": "mcq",
  "correct": 2,
  "score": 13.33,
  "marks_obtained": 13.33,
  "total_marks": null,
  "pending_evaluation": false,
  "details": [
    {
      "question_id": 1,
      "question": "What does AI stand for?",
      "options": { "A": "Artificial Intelligence", "B": "Automated Intelligence", "C": "Advanced Internet", "D": "Applied Informatics" },
      "student_answer": "A",
      "correct_answer": "A",
      "is_correct": true,
      "marks_awarded": null,
      "max_marks": null
    }
  ],
  "answers": [{ "question_id": 1, "answer": "A" }]
}
```

`score`/`marks_obtained` are percentages when every question can be automatically checked. Per-question `marks_awarded` and `total_marks` are stored only when actual marks exist; the application never invents them. Descriptive answers are kept as text with `is_correct: null` and a pending status. Existing legacy records that contain only totals are normalised on read, so no old result data is rewritten or discarded. The old `submissions.json` format from the previous version is no longer written or read.

Student records are read from `students.json` on each login. Add an official record as `{"name": "...", "reg_no": "..."}`; public `/auth/register` is disabled.

Delete a data file to reset that part of the system; it is recreated automatically. `results.json` and `students.json` are excluded from git because they contain personal data.

## Notes & Limitations

- **Chrome is required** for reliable SpeechRecognition/SpeechSynthesis. The microphone must be allowed, and Chrome's speech service needs an internet connection.
- The app must be served from `localhost` or HTTPS for microphone access.
- Scanned PDFs and images are processed with OCR, so small misreads are possible (e.g. "JavaScript Form" → "JavaScriptForm"). Use **Review & Correct** in the Admin panel to fix them before the exam.
- Student login validates the full name and registration number against the same existing student record; it does not use a student password. Public self-registration is disabled. Admin endpoints require a separate bearer-token login, and the admin token is kept in the browser's `sessionStorage` until logout or expiry.
- The fallback admin credentials (`admin` / `admin123`) are for local development only. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN_SECRET`, and serve the app over HTTPS before using it outside a local machine.
- The local `students.json` currently contains historical test entries and several variants of one number. Login accepts only exact existing record pairs, but no single length/prefix rule is enforced because the data is inconsistent. Clean and verify the student records before a real examination; the test entries should not be used in production.
- Legacy result records do not contain submission timestamps, exam IDs, or stored option text. The admin view shows “Not recorded”/“—” for those missing values and does not rewrite the original records. Per-question marks are shown only when an existing evaluation stored them; automatic MCQ scores are percentages based on the total number of questions.
- JSON storage is intended for a single-machine college project; use a real database for multi-user deployment.

## License

This project is developed for educational purposes to promote accessibility in education.
