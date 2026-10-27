# AI Driven Accessible Examination and Assessment System for Visually Impaired Students

A fully voice-controlled examination system that lets visually impaired students take exams independently — no scribe, no mouse, no paid screen reader required.

The admin uploads a question paper PDF (digital or scanned), the system extracts the questions automatically, and the student takes the exam entirely by voice: the questions are read aloud and the answers are spoken.

## Features

- **Voice-based login** — student speaks their name and registration number; TTS guides every step and saying **"login"** completes sign-in.
- **AI PDF extraction** — upload/drag & drop a question paper PDF; PyMuPDF extracts questions and options, with an automatic **OCR fallback (RapidOCR)** for scanned/image-only papers.
- **MCQ exam mode** — TTS reads each question and its A–D options; STT captures spoken answers ("Option A", "be", "two", ...).
- **Descriptive exam mode** — for papers with no options (e.g. short-answer papers), the student speaks the answer, says **"done"**, confirms with **"yes"**, and the answer is stored for teacher evaluation.
- **NLP-style voice navigation** — "Next", "Previous", "Repeat", "Submit", plus conversational variants.
- **Manual grading** — the teacher reviews descriptive submissions in the Admin panel, enters a score (0–100) and optional feedback; the student's Results page then shows the final grade.
- **Keyboard fallback** — A–D / 1–4, N, P, R, S shortcuts and typed answers, so the exam works without a microphone.
- **No external hardware** — uses the laptop's built-in microphone and speakers through the browser's Web Speech API.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | ReactJS, React Router, Web Speech API (Speech Synthesis + Speech Recognition) |
| Backend | Python, FastAPI, Uvicorn, PyMuPDF, RapidOCR |
| Database | JSON file storage |
| Browser | Google Chrome (recommended for the Web Speech API) |

## Project Structure

```
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── models.py               # Pydantic models (Question, ExamResult, ...)
│   ├── database.py             # JSON file storage operations
│   ├── pdf_extractor.py        # PDF parsing + OCR fallback
│   ├── requirements.txt        # Python dependencies
│   ├── routers/
│   │   ├── admin.py            # PDF upload, questions, submissions, grading
│   │   ├── auth.py             # Student login/registration
│   │   ├── exam.py             # Exam questions, submission, results
│   │   └── sample.py           # Sample AI question paper
│   └── data/
│       ├── questions.json      # Extracted questions
│       ├── results.json        # Exam submissions
│       └── students.json       # Registered students
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Login.jsx       # Voice login
│       │   ├── Admin.jsx       # PDF upload, submissions, grading
│       │   ├── Exam.jsx        # Voice + keyboard exam engine
│       │   └── Results.jsx     # Score / pending evaluation / feedback
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

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

The API runs at `http://localhost:8000` (interactive docs at `/docs`).

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

1. Open **Admin** in the navigation bar.
2. Drag & drop a question paper PDF (or click to select). A preview is shown.
3. Click **Save PDF & Extract**. Scanned papers are OCR-processed automatically.
4. Review the extracted questions (MCQ or descriptive).
5. After students submit, scroll to **Submissions**:
   - MCQ papers are graded automatically.
   - Descriptive answers show a score box and feedback field — click **Save Grade**.

### Student

1. Open the home page and click **Start Voice Login**.
2. Say your name when prompted (e.g. *"My name is Shreya"*).
3. Say your registration number (e.g. *"My registration number is U18IW24S0019"*).
4. Say **"login"** (or press Enter).
5. The exam starts automatically:
   - **MCQ:** after the question is read, say *"Option A"*, *"B"*, *"two"*, etc. Say **"yes"** to confirm, **"no"** to change.
   - **Descriptive:** speak your answer, say **"done"**, then **"yes"** to confirm.
   - Navigation: **"next"**, **"previous"**, **"repeat"**, **"submit"**.
6. Results are shown after submission. Descriptive papers display **Pending Evaluation** until the teacher grades them.

## API Endpoints

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/upload-pdf` | Upload a PDF and extract questions (with OCR fallback) |
| GET | `/admin/questions` | Get all extracted questions |
| DELETE | `/admin/questions` | Delete all questions |
| GET | `/admin/results` | List all exam submissions |
| POST | `/admin/results/{index}/grade` | Grade a descriptive submission (`score` 0–100, optional `feedback`) |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Student login (name + registration number) |
| POST | `/auth/register` | Pre-register a student |

### Exam

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/exam/questions` | Get exam questions (without correct answers) |
| GET | `/exam/question/{id}` | Get one question |
| POST | `/exam/submit` | Submit answers; MCQ auto-graded, descriptive marked pending |
| GET | `/exam/result/{reg_no}` | Get the student's latest result |

### Sample

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sample/generate-ai-paper` | Load a built-in 15-question sample paper |

## Data Storage

All data lives in `backend/data/` as JSON files:

- `questions.json` — current question paper
- `students.json` — registered students
- `results.json` — submissions and grades

Delete a file to reset that part of the system; it is recreated automatically.

## Notes & Limitations

- **Chrome is required** for reliable SpeechRecognition/SpeechSynthesis. The microphone must be allowed, and Chrome's speech service needs an internet connection.
- The app must be served from `localhost` or HTTPS for microphone access.
- Scanned PDFs are processed with OCR, so small misreads are possible (e.g. "JavaScript Form" → "JavaScriptForm").
- Login identifies the student (name + registration number); it does not verify a password. Do not expose the Admin panel publicly without adding authentication.
- JSON storage is intended for a single-machine college project; use a real database for multi-user deployment.

## License

This project is developed for educational purposes to promote accessibility in education.
