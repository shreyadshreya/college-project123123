# AI Driven Accessible Examination and Assessment System for Visually Impaired Students

A fully voice-controlled examination system that lets visually impaired students take exams independently — no scribe, no mouse, no paid screen reader required.

The admin uploads a question paper PDF or image (JPG/PNG), the system extracts the questions automatically, and the student takes the exam entirely by voice: the questions are read aloud and the answers are spoken.

## Features

- **Voice-based login** — student speaks their name and registration number; TTS guides every step and saying **"login"** completes sign-in. Only a full name and registration number that match the same existing student record are accepted.
- **AI question extraction** — upload/drag & drop a PDF, JPG, JPEG, or PNG question paper. Selectable PDF text is read with PyMuPDF; scanned PDFs and images are processed with **RapidOCR**.
- **MCQ exam mode** — TTS reads each question and its A–D options; STT captures spoken answers ("Option A", "be", "two", ...).
- **Descriptive exam mode** — for papers with no options (e.g. short-answer papers), the student speaks the answer, says **"done"**, and confirms with **"yes"**.
- **NLP-style voice navigation** — "Next", "Previous", "Repeat", "Submit", plus conversational variants.
- **No score evaluation** — the exam ends with a submission confirmation. Answers are stored as raw submissions for the examination office, but scores, grading, and result pages are not shown.
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
│   ├── pdf_extractor.py        # PDF/image parsing + OCR fallback
│   ├── requirements.txt        # Python dependencies
│   ├── routers/
│   │   ├── admin.py            # PDF/image upload, questions
│   │   ├── auth.py             # Student login/registration
│   │   ├── exam.py             # Exam questions and submission confirmation
│   │   └── sample.py           # Sample AI question paper
│   └── data/
│       ├── questions.json      # Extracted questions
│       └── students.json       # Registered students
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Login.jsx       # Voice login
│       │   ├── Admin.jsx       # PDF/image upload and review/edit
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
2. Drag & drop a question paper PDF, JPG, JPEG, or PNG (or click to select). A preview is shown.
3. Click **Upload & Extract**. Scanned PDFs and images are OCR-processed automatically. The current question paper is not replaced yet.
4. Review the extracted questions (MCQ or descriptive) in the correction form. Fix OCR mistakes, add missing questions or options, remove spurious ones, or set an answer that was not detected, then click **Save Questions**. Unknown answers are left blank rather than guessed. Use **Review & Correct** to edit the saved paper later.
5. Raw submissions are saved when the student finishes; there is no score entry, grading, or results page.

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

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/upload-pdf` | Upload a PDF, JPG, JPEG, or PNG and extract questions (with OCR fallback). Add `?save=false` to review without replacing the current paper. |
| GET | `/admin/questions` | Get all extracted questions |
| PUT | `/admin/questions` | Save corrections to extracted questions |
| DELETE | `/admin/questions` | Delete all questions |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Validate a full name + registration number against the same registered student |
| POST | `/auth/register` | Disabled; student records are managed by the examination office |

### Exam

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/exam/questions` | Get exam questions (without correct answers) |
| GET | `/exam/question/{id}` | Get one question |
| POST | `/exam/submit` | Save raw answers and receive a completion confirmation (no scoring) |

### Sample

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sample/generate-ai-paper` | Load a built-in 15-question sample paper |

## Data Storage

All data lives in `backend/data/` as JSON files:

- `questions.json` — current question paper
- `students.json` — registered students (provisioned by the examination office)
- `submissions.json` — raw submitted answers and timestamps, with no scores or feedback

The old `results.json` is no longer read or written by the application.

Student records are read from `students.json` on each login. Add an official record as `{"name": "...", "reg_no": "..."}`; public `/auth/register` is disabled.

Delete a file to reset that part of the system; it is recreated automatically.

## Notes & Limitations

- **Chrome is required** for reliable SpeechRecognition/SpeechSynthesis. The microphone must be allowed, and Chrome's speech service needs an internet connection.
- The app must be served from `localhost` or HTTPS for microphone access.
- Scanned PDFs and images are processed with OCR, so small misreads are possible (e.g. "JavaScript Form" → "JavaScriptForm"). Use **Review & Correct** in the Admin panel to fix them before the exam.
- Login validates the full name and registration number against the same existing student record; it does not use a password. Public self-registration is disabled. Do not expose the Admin panel publicly without adding authentication.
- The local `students.json` currently contains historical test entries and several variants of one number. Login accepts only exact existing record pairs, but no single length/prefix rule is enforced because the data is inconsistent. Clean and verify the student records before a real examination; the test entries should not be used in production.
- JSON storage is intended for a single-machine college project; use a real database for multi-user deployment.

## License

This project is developed for educational purposes to promote accessibility in education.
