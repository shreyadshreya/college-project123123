import fitz  # PyMuPDF
import re
from models import Question

# Splits text into question-text / option-marker / option-text parts.
# Matches option headers like "A) ", "(A) ", "A: ", "A - ", "A. " etc.
OPTION_SPLIT_RE = re.compile(r"(?<![A-Za-z0-9])([A-D][\)\]\.:\-–—]?\s+)", re.IGNORECASE)

QUESTION_RE = re.compile(
    r"^(?:[Qq]\s*\.?\s*|Question\s+)?(\d+)(?:[\.\):]\s*|\s+)(.+)", re.IGNORECASE
)
ANSWER_RE = re.compile(
    r"^(?:correct\s+answer|correct\s+option|answer|ans)[\s:\-–—]*([A-D])", re.IGNORECASE
)
OPTION_LINE_RE = re.compile(r"^[\(\[]?([A-D])[\)\]\.\:]\s*(.+)", re.IGNORECASE)

SECTION_RE = re.compile(r"^section\s+[a-z]\b", re.IGNORECASE)
SECTION_ANY_RE = re.compile(r"\bsection\s*[a-z]\b", re.IGNORECASE)
NUMBER_ONLY_RE = re.compile(r"^\(?\d{1,3}[\.\):]?$")

# OCR noise: table headers, college header, instruction lines, etc.
NOISE_EXACT = {
    "q.no", "q no", "questions", "question", "marks", "mark", "co", "level",
    "***", "1/1", "un", "love", "page",
}
NOISE_PREFIXES = (
    "answer any", "answerall", "answer all", "co:", "course ", "program :",
    "program:", "sem :", "sem:", "ia-", "st.francis", "st. francis", "pb.no",
    "koramangala", "co :",
)
NOISE_WORDS = {
    "q.no", "qno", "questions", "question", "marks", "mark", "co", "level",
}

_ocr_engine = None


def _get_ocr_engine():
    """Lazily create a shared RapidOCR engine (only needed for scanned PDFs)."""
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR()
    return _ocr_engine


def _is_noise(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return True
    if t in NOISE_EXACT:
        return True
    if SECTION_ANY_RE.search(t):
        return True
    if any(t.startswith(p) for p in NOISE_PREFIXES):
        return True
    # Rows that consist only of table-header words (e.g. "Q.no Questions")
    words = re.findall(r"[a-z.]+", t)
    if words and all(w in NOISE_WORDS for w in words):
        return True
    # Course/subject codes like "24BCA51-WP"
    if re.fullmatch(r"[a-z0-9]{2,}-[a-z0-9]{2,}", t):
        return True
    return False


def _parse_inline_options(text: str) -> dict:
    """Parse options embedded in the question line, e.g.
    '1. What does AI stand for? A) Artificial Intelligence B) ...' -> {'A': '...', ...}
    """
    parts = OPTION_SPLIT_RE.split(text)
    options = {}
    # With a capturing group, split() -> [text, marker, text, marker, ..., text]
    for i in range(1, len(parts) - 1, 2):
        marker = parts[i]
        letter_match = re.match(r"[A-D]", marker, re.IGNORECASE)
        if not letter_match:
            continue
        letter = letter_match.group(0).upper()
        content = parts[i + 1].strip()
        if content:
            options[letter] = content
    return options


def _strip_inline_options(text: str) -> str:
    """Remove inline option markers and text from the question text."""
    parts = OPTION_SPLIT_RE.split(text)
    return re.sub(r"\s+", " ", parts[0]).strip()


def _ocr_page_lines(page) -> list[str]:
    """
    OCR a scanned/image page and rebuild logical text lines.
    Uses coordinates to drop side columns (marks / CO levels) and to
    detect question rows that lost their number during OCR.
    """
    engine = _get_ocr_engine()
    pix = page.get_pixmap(dpi=300)
    result, _ = engine(pix.tobytes("png"))
    if not result:
        return []

    page_width = pix.width
    items = []
    for box, text, _score in result:
        x0 = min(p[0] for p in box)
        y0 = min(p[1] for p in box)
        text = (text or "").strip()
        if text:
            items.append({"x": x0, "y": y0, "text": text})

    # Drop the right-hand columns (marks, CO, level) of exam tables
    items = [i for i in items if i["x"] < page_width * 0.72]
    items.sort(key=lambda i: (i["y"], i["x"]))

    # Group items that sit on the same visual row
    rows = []
    for item in items:
        if rows and abs(item["y"] - rows[-1]["y"]) < 18:
            rows[-1]["text"] += " " + item["text"]
        else:
            rows.append({"y": item["y"], "text": item["text"]})

    # Remove headers / instructions / section titles
    rows = [r for r in rows if not _is_noise(r["text"])]

    # Merge standalone question numbers ("1.") with the text that follows
    merged = []
    i = 0
    while i < len(rows):
        text = rows[i]["text"]
        if NUMBER_ONLY_RE.match(text) and i + 1 < len(rows):
            merged.append({"y": rows[i]["y"], "text": f"{text} {rows[i + 1]['text']}"})
            i += 2
        else:
            merged.append(rows[i])
            i += 1

    # If a question number was missed by OCR, a large vertical gap marks
    # the start of a new question row -> restore the sequential number.
    lines = []
    last_number = 0
    prev_y = None
    for row in merged:
        text = row["text"].strip()
        m = re.match(r"^(\d+)[\.\):]?\s+", text)
        if m:
            last_number = int(m.group(1))
            lines.append(text)
        else:
            gap = row["y"] - prev_y if prev_y is not None else 0
            if prev_y is not None and gap > 100 and last_number > 0:
                last_number += 1
                lines.append(f"{last_number}. {text}")
            else:
                lines.append(text)
        prev_y = row["y"]

    return lines


def _parse_questions(lines: list[str]) -> list[Question]:
    """Parse question/option/answer lines into Question objects."""
    questions = []
    current_question = None
    question_id = 0

    def save_current():
        nonlocal question_id
        if not current_question:
            return
        text = re.sub(r"\s+", " ", current_question["text"]).strip()
        if len(text) < 5 or SECTION_RE.match(text):
            return
        question_id += 1
        questions.append(Question(
            id=question_id,
            text=text,
            options=current_question["options"],
            correct_answer=current_question.get("answer")
        ))

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        if _is_noise(line):
            continue

        # Detect question start (Q1., 1., Q1:, Question 1:, 1), etc.)
        q_match = QUESTION_RE.match(line)
        if q_match:
            save_current()
            raw_text = q_match.group(2).strip()
            current_question = {
                "text": _strip_inline_options(raw_text),
                "options": _parse_inline_options(raw_text),
                "answer": None
            }
            continue

        if current_question is None:
            continue

        # Detect options: A) opt, (A) opt, A. opt, etc.
        opt_match = OPTION_LINE_RE.match(line)
        if opt_match:
            letter = opt_match.group(1).upper()
            text = opt_match.group(2).strip()
            current_question["options"][letter] = text
            continue

        # Detect answer line: "Answer: A" or "Ans: A" or "Correct Answer: B" etc.
        ans_match = ANSWER_RE.match(line)
        if ans_match:
            current_question["answer"] = ans_match.group(1).upper()
            continue

        # If line doesn't match any pattern, append to question text
        # (handles multi-line questions)
        current_question["text"] += " " + line

    save_current()

    return questions


def extract_questions_from_pdf(pdf_path: str) -> list[Question]:
    """
    Extract questions, options, and answers from a PDF question paper.

    Text-based PDFs are read directly (supports MCQ formats with options
    inline or on separate lines, plus descriptive questions without options).
    Scanned/image-only PDFs are processed with OCR (RapidOCR).

    Supported examples:
    - Q1. Question text? A) opt1 B) opt2 C) opt3 D) opt4
    - 1. Question text? (A) opt1 (B) opt2 (C) opt3 (D) opt4
    - Answer: A
    - 1. Explain the difference between supervised and unsupervised learning.
    """
    doc = fitz.open(pdf_path)
    lines = []
    for page in doc:
        text = page.get_text()
        if len(text.strip()) >= 20:
            lines.extend(text.strip().split("\n"))
        else:
            # Scanned/image-only page -> OCR fallback
            lines.extend(_ocr_page_lines(page))
    doc.close()

    return _parse_questions(lines)
