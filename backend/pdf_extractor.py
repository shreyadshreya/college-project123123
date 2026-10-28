"""Extract exam questions from text-based or scanned PDF question papers.

The parser is line based and deliberately conservative:

* Only *explicit* option markers such as ``A)``, ``(A)``, ``A.`` or ``A:``
  are treated as options.  A bare letter (``A text``) is not an option - in
  normal question text "a" is usually just an article ("What is a variable?").
* Question text may wrap over several lines.
* Options may be inline (all on the question line) or on separate lines,
  optionally wrapped over several lines.
* Answer lines ("Ans: B") and a separate answer key are both supported.
* Scanned pages are OCR'd with RapidOCR when it is installed.
"""

import re
import unicodedata
from collections import defaultdict

import fitz  # PyMuPDF
from models import Question


class PDFExtractionError(Exception):
    """The PDF could not be read, or OCR is needed but unavailable."""


# ---------------------------------------------------------------------------
# Regular expressions
# ---------------------------------------------------------------------------

# Explicit option markers only:
#   (A)   [A]   A)   A.   A:   A -   (a)
# A marker must not be part of a word (so "USA)" is not option A).
OPTION_MARKER_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"(?:\((?P<paren>[A-Da-d])\)|\[(?P<bracket>[A-Da-d])\]|"
    r"(?P<plain>[A-Da-d])\s*[\)\.\:\-–—])"
)

# A line that starts with an option marker (the option text follows it).
OPTION_LINE_RE = re.compile(
    r"^\s*(?:\((?P<paren>[A-Da-d])\)|\[(?P<bracket>[A-Da-d])\]|"
    r"(?P<plain>[A-Da-d])\s*[\)\.\:\-–—])\s*(?P<text>.*)$"
)

# Question numbers:
#   Q1.   Q. 1   Question 1:   1.   1)   (1)   1 -
# Decimal sub-numbering such as 1.1 is intentionally not treated as a new
# question; it is normally a sub-part of the previous question.
QUESTION_START_RE = re.compile(
    r"^\s*(?:"
    r"Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?(?P<qnum>\d{1,3})(?!\d|\.\d)"
    r"|\((?P<pnum>\d{1,3})\)"
    r"|(?P<num>\d{1,3})(?!\d|\.\d)"
    r")\s*(?:[\.\)\:\-–—]\s*|\s+)"
    r"(?P<text>.*)$",
    re.IGNORECASE,
)

ANSWER_LINE_RE = re.compile(
    r"^\s*(?:correct\s+(?:answer|option)|answer|ans(?:wer)?)"
    r"\s*(?:is)?\s*[\.:\-–—]?\s*(?:option\s*)?\(?([A-Da-d])\)?"
    r"\s*[\.,;]?\s*$",
    re.IGNORECASE,
)

ANSWER_PAIR_RE = re.compile(
    r"(?<![\dA-Za-z])"
    r"(?:Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?)?"
    r"(\d{1,3})\s*[\.\)\:\-–—]?\s*\(?([A-Da-d])\)?"
    r"(?![\dA-Za-z])"
)

ANSWER_SEQUENCE_RE = re.compile(r"^\s*(?:[A-Da-d][\s,;.]*){2,}$")

SECTION_HEADING_RE = re.compile(
    r"^\s*(?:part|section|unit|module)\s*[-–—:.]?\s*"
    r"(?:[A-Z]|[IVX]{1,4}|\d{1,2})\b",
    re.IGNORECASE,
)

PAGE_NUMBER_RE = re.compile(
    r"^\s*(?:page\s*)?\d{1,3}\s*(?:/|of)\s*\d{1,3}\s*$", re.IGNORECASE
)

STANDALONE_NUMBER_RE = re.compile(r"^\s*\(?\d{1,3}[\.\):]?\s*$")
STANDALONE_OPTION_RE = re.compile(
    r"^\s*(?:\([A-Da-d]\)|\[[A-Da-d]\]|[A-Da-d][\)\.\:\-–—])\s*$"
)

# OCR noise: table headers, college headers, instruction lines, etc.
NOISE_EXACT = {
    "q.no", "q no", "qno", "questions", "question", "marks", "mark",
    "co", "level", "***", "1/1", "page",
}
NOISE_PREFIXES = (
    "answer any", "answerall", "answer all", "attempt any", "attempt all",
    "co:", "course ", "program :", "program:", "sem :", "sem:",
    "ia-", "st.francis", "st. francis", "pb.no", "koramangala", "co :",
    "max marks", "max. marks", "maximum marks", "time:", "duration:",
    "instructions", "instruction:", "note:", "subject:", "subject ",
    "usn:", "usn ", "reg no", "reg. no", "registration no", "registration number",
)
NOISE_WORDS = {
    "q.no", "qno", "questions", "question", "marks", "mark", "co", "level",
}

_ocr_engine = None


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def _get_ocr_engine():
    """Lazily create a shared RapidOCR engine (only needed for scanned PDFs)."""
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR()
    return _ocr_engine


def _clean_line(text: str) -> str:
    """Normalise Unicode/spacing in one extracted line."""
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _normalise_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _is_noise(text: str) -> bool:
    """True for page headers, instructions and other non-question lines."""
    t = _normalise_text(text)
    low = t.lower().strip(" .:-")
    if not low:
        return True
    if low in NOISE_EXACT:
        return True
    if PAGE_NUMBER_RE.match(t):
        return True
    if any(low.startswith(p) for p in NOISE_PREFIXES):
        return True
    if re.fullmatch(r"\d{1,3}\s*marks?", low):
        return True

    # Rows that consist only of table-header words (e.g. "Q.no Questions")
    words = re.findall(r"[a-z][a-z.']*", low)
    if words and all(w.strip(".") in NOISE_WORDS for w in words):
        return True

    # Course/subject codes like "24BCA51-WP"
    if re.fullmatch(r"[a-z0-9]{2,}-[a-z0-9]{2,}", low):
        return True
    return False


def _is_section_heading(text: str) -> bool:
    t = _normalise_text(text)
    # Only short standalone headings, not a sentence that starts with
    # "Part A ..." inside a real question.
    return bool(SECTION_HEADING_RE.match(t)) and len(t) <= 80 and "?" not in t


def _match_question_start(line: str):
    m = QUESTION_START_RE.match(line)
    if not m:
        return None
    number = int(m.group("qnum") or m.group("pnum") or m.group("num"))
    return {"number": number, "text": (m.group("text") or "").strip()}


def _match_option_line(line: str):
    m = OPTION_LINE_RE.match(line)
    if not m:
        return None
    letter = (m.group("paren") or m.group("bracket") or m.group("plain")).upper()
    return letter, (m.group("text") or "").strip()


def _match_answer_line(line: str):
    m = ANSWER_LINE_RE.match(line)
    return m.group(1).upper() if m else None


def _marker_letter(match) -> str:
    return (match.group("paren") or match.group("bracket") or match.group("plain")).upper()


def _option_markers(text: str):
    """Return explicit option markers as (start, end, letter)."""
    return [(m.start(), m.end(), _marker_letter(m)) for m in OPTION_MARKER_RE.finditer(text)]


def _consecutive_run(markers, expected: str):
    """Keep markers that form a consecutive A, B, C, D run from `expected`."""
    run = []
    for marker in markers:
        if marker[2] == expected:
            run.append(marker)
            if expected == "D":
                break
            expected = chr(ord(expected) + 1)
    return run


def _best_option_run(markers):
    """Find the longest A, B, C ... run (the real option list)."""
    best = []
    for i, marker in enumerate(markers):
        if marker[2] != "A":
            continue
        run = _consecutive_run(markers[i:], "A")
        if len(run) > len(best):
            best = run
    return best


def _build_options(text: str, run) -> dict:
    options = {}
    for i, marker in enumerate(run):
        end = run[i + 1][0] if i + 1 < len(run) else len(text)
        content = _normalise_text(text[marker[1]:end])
        # Keep empty values: a marker at the end of a wrapped line means its
        # text continues on the next line ("... C)" / "next line D) ...").
        options[marker[2]] = content
    return options


def _split_stem_and_inline_options(text: str):
    """Split 'question A) x B) y' into (question, {A: x, B: y})."""
    markers = _option_markers(text)
    run = _best_option_run(markers)
    if len(run) < 2:
        return _normalise_text(text), {}
    stem = _normalise_text(text[:run[0][0]])
    return stem, _build_options(text, run)


def _options_from_leading(letter: str, rest: str) -> dict:
    """Parse an option line, including further options packed on the same line."""
    options = {}
    markers = _option_markers(rest)
    if letter == "D":
        options["D"] = _normalise_text(rest)
        return options

    expected = chr(ord(letter) + 1)
    accepted = _consecutive_run(markers, expected)
    first_end = accepted[0][0] if accepted else len(rest)
    content = _normalise_text(rest[:first_end])
    options[letter] = content

    accepted_options = {}
    for i, marker in enumerate(accepted):
        end = accepted[i + 1][0] if i + 1 < len(accepted) else len(rest)
        accepted_options[marker[2]] = _normalise_text(rest[marker[1]:end])
    options.update(accepted_options)
    return options


def _merge_standalone_lines(lines: list[str]) -> list[str]:
    """Merge a lone question number (or option marker) with the next line."""
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if (
            nxt
            and not _is_noise(nxt)
            and (STANDALONE_NUMBER_RE.match(line) or STANDALONE_OPTION_RE.match(line))
        ):
            merged.append(f"{line} {nxt}")
            i += 2
        else:
            merged.append(line)
            i += 1
    return merged


def _match_answer_key_heading(line: str):
    """Return the remainder after an answer-key heading, or None."""
    m = re.match(
        r"^\s*(?:answer\s*key|answers?|key)\s*[\.:\-–—]?\s*(.*)$",
        line,
        re.IGNORECASE,
    )
    if not m:
        return None
    rest = m.group(1).strip()
    if not rest:
        return ""
    # "Answer Key: 1. A 2. B" is a heading; "Key Concepts" is not.
    if re.match(r"^\(?\d{1,3}\b", rest):
        return rest
    return None


def _parse_answer_pairs(line: str):
    pairs = []
    for m in ANSWER_PAIR_RE.finditer(line):
        pairs.append((int(m.group(1)), m.group(2).upper()))
    return pairs


def _parse_answer_sequence(line: str):
    stripped = re.sub(r"^(?:ans(?:wer)?|key)\s*[\.:\-–—]?\s*", "", line, flags=re.IGNORECASE)
    if ANSWER_SEQUENCE_RE.match(stripped):
        return re.findall(r"[A-Da-d]", stripped.upper())
    return []


# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------

def _split_ocr_columns(items, page_width):
    """Detect a two-column scanned layout; otherwise return one column."""
    if len(items) < 10:
        return [items]

    spans = sorted((item["x0"], item["x1"]) for item in items)
    merged = []
    for start, end in spans:
        if merged and start <= merged[-1][1] + page_width * 0.005:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])

    best = None
    for (_, end), (start, _) in zip(merged, merged[1:]):
        gap = start - end
        centre = (start + end) / 2
        if gap < page_width * 0.04 or not (page_width * 0.2 <= centre <= page_width * 0.8):
            continue
        left = sum(1 for item in items if item["x0"] < centre)
        right = len(items) - left
        if left < len(items) * 0.2 or right < len(items) * 0.2:
            continue
        if best is None or gap > best[0]:
            best = (gap, centre)

    if best is None:
        return [items]

    centre = best[1]
    return [
        [item for item in items if item["x0"] < centre],
        [item for item in items if item["x0"] >= centre],
    ]


def _ocr_page_lines(page) -> list[str]:
    """OCR a scanned/image page and rebuild logical text lines."""
    try:
        engine = _get_ocr_engine()
    except Exception as exc:  # ImportError or missing model files
        raise PDFExtractionError(
            "This PDF appears to be scanned, but OCR is not available. "
            "Install its dependency with: pip install -r requirements.txt"
        ) from exc

    pix = page.get_pixmap(dpi=300)
    result, _ = engine(pix.tobytes("png"))
    if not result:
        return []

    page_width, page_height = pix.width, pix.height
    items = []
    for box, text, score in result:
        text = _clean_line(text)
        try:
            confidence = float(score)
        except (TypeError, ValueError):
            confidence = 1.0
        if not text or confidence < 0.3:
            continue
        x0 = min(point[0] for point in box)
        x1 = max(point[0] for point in box)
        y0 = min(point[1] for point in box)
        # Drop marks/CO/level cells printed in the far right table columns.
        # (Question/option text in a right-hand column starts well left of
        # this margin, so two-column papers are unaffected.)
        if x0 > page_width * 0.72:
            compact = text.strip(" .:;|")
            words = re.findall(r"[a-z]+", compact.lower())
            if re.fullmatch(r"[\dA-Za-z]{1,3}", compact) or (
                words and all(word in NOISE_WORDS for word in words)
            ):
                continue
        items.append({"x0": x0, "x1": x1, "x": x0, "y": y0, "text": text})

    if not items:
        return []

    lines = []
    for column in _split_ocr_columns(items, page_width):
        column = sorted(column, key=lambda item: (item["y"], item["x"]))
        rows = []
        tolerance = max(12, page_height * 0.008)
        for item in column:
            if rows and abs(item["y"] - rows[-1]["y"]) < tolerance:
                rows[-1]["text"] += " " + item["text"]
            else:
                rows.append({"y": item["y"], "text": item["text"]})

        rows = [row for row in rows if not _is_noise(row["text"])]

        # Merge a standalone question number with the row that follows it.
        merged = []
        i = 0
        while i < len(rows):
            text = rows[i]["text"]
            if (
                STANDALONE_NUMBER_RE.match(text)
                and i + 1 < len(rows)
            ):
                merged.append({"y": rows[i]["y"], "text": f"{text} {rows[i + 1]['text']}"})
                i += 2
            else:
                merged.append(rows[i])
                i += 1

        # If OCR missed a question number, a large vertical gap marks the
        # start of a new question row -> restore the sequential number.
        # (Option/answer/section lines are never given synthetic numbers.)
        gap_threshold = page_height * 0.04

        last_number = 0
        prev_y = None
        for row in merged:
            text = row["text"].strip()
            m = re.match(r"^(\d+)[\.\):\-–—]?\s+", text)
            if m:
                last_number = int(m.group(1))
                lines.append(text)
            else:
                gap = row["y"] - prev_y if prev_y is not None else 0
                starts_option = bool(
                    _match_option_line(text)
                    or _match_answer_line(text)
                    or _is_section_heading(text)
                    or _match_answer_key_heading(text) is not None
                )
                if (
                    not starts_option
                    and prev_y is not None
                    and gap > gap_threshold
                    and last_number > 0
                ):
                    last_number += 1
                    lines.append(f"{last_number}. {text}")
                else:
                    lines.append(text)
            prev_y = row["y"]

    return lines


# ---------------------------------------------------------------------------
# Question parsing
# ---------------------------------------------------------------------------

def _looks_like_answer_key_row(text: str) -> bool:
    pairs = _parse_answer_pairs(text)
    if len(pairs) >= 2:
        return True
    if re.fullmatch(r"[\d\s,;.\-–—]+", text):
        return True
    return False


def _apply_answer_key(entries, answer_pairs, sequence_answers):
    mcq_entries = [entry for entry in entries if entry["options"]]

    if sequence_answers:
        for entry, answer in zip(mcq_entries, sequence_answers):
            if entry["answer"] is None:
                entry["answer"] = answer

    if not answer_pairs:
        return

    numbers = [number for number, _ in answer_pairs]
    single_section_key = (
        len(answer_pairs) == len(mcq_entries)
        and numbers == list(range(1, len(answer_pairs) + 1))
    )
    if single_section_key:
        # Handles papers whose numbering restarts in every part.
        for entry, (_, answer) in zip(mcq_entries, answer_pairs):
            if entry["answer"] is None:
                entry["answer"] = answer
        return

    queues = defaultdict(list)
    for number, answer in answer_pairs:
        queues[number].append(answer)
    for entry in mcq_entries:
        candidates = queues.get(entry["number"])
        if entry["answer"] is None and candidates:
            entry["answer"] = candidates.pop(0)


def _parse_questions(lines: list[str]) -> list[Question]:
    """Parse question/option/answer lines into Question objects."""
    entries = []
    current = None
    in_answer_key = False
    answer_pairs = []
    sequence_answers = []

    def save_current():
        nonlocal current
        if current is None:
            return

        text = _normalise_text(current["text"])
        options = {
            letter: _normalise_text(value)
            for letter, value in current["options"].items()
            if value and _normalise_text(value)
        }

        # A single "A)" detected inside ordinary prose is not a real MCQ.
        # Fold it back into the question text instead of misclassifying.
        if options and (len(options) < 2 or "A" not in options or "B" not in options):
            extra = " ".join(f"{letter}) {value}" for letter, value in sorted(options.items()))
            text = _normalise_text(f"{text} {extra}")
            options = {}

        options = {letter: options[letter] for letter in "ABCD" if letter in options}
        answer = current.get("answer")
        if not options or answer not in options:
            answer = None

        if len(text) < 3 or not re.search(r"[A-Za-z]", text):
            current = None
            return
        if not options and (_is_section_heading(text) or _looks_like_answer_key_row(text)):
            current = None
            return

        entries.append({
            "number": current["number"],
            "text": text,
            "options": options,
            "answer": answer,
        })
        current = None

    for raw_line in _merge_standalone_lines(lines):
        line = _clean_line(raw_line)
        if not line:
            continue

        heading_rest = _match_answer_key_heading(line)
        if heading_rest is not None:
            save_current()
            in_answer_key = True
            if heading_rest:
                _consume_answer_key_line(heading_rest, answer_pairs, sequence_answers)
            continue

        if in_answer_key:
            if _consume_answer_key_line(line, answer_pairs, sequence_answers):
                continue
            if _is_section_heading(line) or _match_question_start(line):
                in_answer_key = False
            elif _is_noise(line):
                # Page footer inside an answer key section.
                continue

        if _is_section_heading(line):
            save_current()
            continue
        if _is_noise(line):
            continue

        question = _match_question_start(line)
        if question:
            save_current()
            stem, options = _split_stem_and_inline_options(question["text"])
            current = {
                "number": question["number"],
                "text": stem,
                "options": options,
                "answer": None,
                "last_option": max(options) if options else None,
            }
            continue

        if current is None:
            continue

        answer = _match_answer_line(line)
        if answer:
            current["answer"] = answer
            continue

        option = _match_option_line(line)
        if option:
            letter, rest = option
            parsed = _options_from_leading(letter, rest)
            for key, value in parsed.items():
                current["options"][key] = value
            if parsed:
                current["last_option"] = max(parsed)
            continue

        # Unrecognised line: continuation of the question, or of the last
        # option if options have already started.  A wrapped option line may
        # also contain the next marker mid-line ("... C)" / "text D) ...").
        if current["options"] and current.get("last_option"):
            last = current["last_option"]
            expected = chr(ord(last) + 1) if last != "D" else None
            markers = _option_markers(line)
            next_marker = next(
                (marker for marker in markers if expected and marker[2] == expected),
                None,
            )
            if next_marker:
                before = _normalise_text(line[:next_marker[0]])
                if before:
                    current["options"][last] = _normalise_text(
                        f"{current['options'].get(last, '')} {before}"
                    )
                leading = _match_option_line(line[next_marker[0]:])
                if leading:
                    parsed = _options_from_leading(*leading)
                    for key, value in parsed.items():
                        current["options"][key] = value
                    if parsed:
                        current["last_option"] = max(parsed)
                    continue
            current["options"][last] = _normalise_text(
                f"{current['options'].get(last, '')} {line}"
            )
        else:
            current["text"] = _normalise_text(f"{current['text']} {line}")

    save_current()
    _apply_answer_key(entries, answer_pairs, sequence_answers)

    questions = []
    for index, entry in enumerate(entries, start=1):
        questions.append(Question(
            id=index,
            text=entry["text"],
            options=entry["options"],
            correct_answer=entry["answer"] if entry["options"] else None,
        ))
    return questions


def _consume_answer_key_line(line: str, answer_pairs, sequence_answers) -> bool:
    pairs = _parse_answer_pairs(line)
    if pairs:
        answer_pairs.extend(pairs)
        return True

    letters = _parse_answer_sequence(line)
    if letters:
        sequence_answers.extend(letters)
        return True

    # Header row of an answer-key table: "Q.No 1 2 3 4"
    if re.fullmatch(
        r"(?:q\.?\s*no\.?|question\s*(?:no\.?)?)\s*[\d\s,;.\-–—]+",
        line,
        re.IGNORECASE,
    ):
        return True
    if re.fullmatch(r"[\d\s,;.\-–—]+", line):
        return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _read_page_lines(doc) -> list[str]:
    lines = []
    for page_number, page in enumerate(doc, start=1):
        text = page.get_text()
        if len(text.strip()) >= 20:
            text = text.replace("\r\n", "\n").replace("\r", "\n")
            # Re-join words hyphenated across a line break.
            text = re.sub(r"(?<=[A-Za-z])-\n(?=[A-Za-z])", "", text)
            lines.extend(text.split("\n"))
        else:
            try:
                lines.extend(_ocr_page_lines(page))
            except PDFExtractionError:
                raise
            except Exception as exc:
                raise PDFExtractionError(
                    f"OCR failed on page {page_number}: {exc}"
                ) from exc
    return lines


def extract_questions_from_pdf(pdf_path: str) -> list[Question]:
    """
    Extract questions, options and answers from a PDF question paper.

    Text-based pages are read directly; scanned/image-only pages are
    processed with RapidOCR when it is installed.

    Raises PDFExtractionError for unreadable/encrypted PDFs or when OCR is
    required but unavailable.
    """
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        raise PDFExtractionError(f"Could not open the PDF: {exc}") from exc

    try:
        if doc.page_count == 0:
            raise PDFExtractionError("The PDF has no pages")
        if getattr(doc, "needs_pass", False) or getattr(doc, "is_encrypted", False):
            raise PDFExtractionError(
                "The PDF is password-protected. Please upload an unlocked PDF."
            )
        lines = _read_page_lines(doc)
    finally:
        doc.close()

    return _parse_questions(lines)


def get_pdf_text_preview(pdf_path: str, limit: int = 1200) -> str:
    """Return a short raw-text preview (no OCR) for error messages."""
    try:
        doc = fitz.open(pdf_path)
    except Exception:
        return ""
    try:
        parts = []
        length = 0
        for page in doc:
            text = page.get_text().strip()
            if not text:
                continue
            parts.append(text)
            length += len(text)
            if length >= limit:
                break
        return _normalise_text("\n".join(parts))[:limit]
    except Exception:
        return ""
    finally:
        doc.close()
