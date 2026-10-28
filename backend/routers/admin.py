import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from pdf_extractor import (
    PDFExtractionError,
    extract_questions_from_image,
    extract_questions_from_pdf,
    get_image_text_preview,
    get_pdf_text_preview,
)
from models import Question
from database import (
    save_questions,
    clear_questions,
    load_questions,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
ALLOWED_FORMATS = "PDF, JPG, JPEG, or PNG"


def _detect_file_kind(content: bytes) -> str | None:
    """Identify a supported file from its bytes, not its extension."""
    if b"%PDF-" in content[:1024]:
        return "pdf"
    if content.startswith(b"\xff\xd8"):
        return "jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    return None


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...), save: bool = True):
    """
    Upload a PDF/JPG/PNG question paper and extract questions.

    ``save=false`` returns the extracted questions for review without
    replacing the current question paper.  The admin panel uses this mode
    and saves the reviewed questions with PUT /admin/questions.
    """
    filename = file.filename or ""
    if Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed formats: {ALLOWED_FORMATS}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"The file is too large "
                f"(maximum {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)"
            ),
        )

    kind = _detect_file_kind(content)
    if kind is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported or unrecognised file content. "
                f"Upload a valid {ALLOWED_FORMATS} file."
            ),
        )

    suffix = {"pdf": ".pdf", "jpeg": ".jpg", "png": ".png"}[kind]
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            if kind == "pdf":
                questions = extract_questions_from_pdf(tmp_path)
                preview = get_pdf_text_preview(tmp_path) if not questions else ""
            else:
                questions = extract_questions_from_image(tmp_path)
                preview = get_image_text_preview(tmp_path) if not questions else ""
        except PDFExtractionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        if not questions:
            noun = "PDF" if kind == "pdf" else "image"
            if preview:
                detail = (
                    f"No questions could be extracted from this {noun}. "
                    "The text was readable, but no supported question format "
                    f"was found. Extracted text preview: {preview}"
                )
            elif kind == "pdf":
                detail = (
                    "No questions could be extracted from this PDF. "
                    "The PDF contains no extractable text. If it is a scanned "
                    "paper, make sure OCR support is installed "
                    "(see requirements.txt)."
                )
            else:
                detail = (
                    "No readable text was found in this image. "
                    "Try a clearer, higher-resolution image."
                )
            raise HTTPException(status_code=422, detail=detail)

        if save:
            clear_questions()
            save_questions(questions)

        return {
            "message": f"Successfully extracted {len(questions)} questions",
            "count": len(questions),
            "saved": save,
            "questions": [q.model_dump() for q in questions],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process the uploaded file: {exc}",
        ) from exc
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@router.put("/questions")
async def update_questions(questions: list[Question]):
    """Save corrections to the extracted questions shown in the admin panel."""
    if not questions:
        raise HTTPException(status_code=400, detail="No questions were provided")

    cleaned = []
    for index, question in enumerate(questions, start=1):
        text = question.text.strip()
        if not text:
            raise HTTPException(
                status_code=422,
                detail=f"Question {index} has no question text",
            )

        options = {}
        for letter, value in question.options.items():
            key = letter.strip().upper()
            if key not in {"A", "B", "C", "D"}:
                raise HTTPException(
                    status_code=422,
                    detail=f"Question {index}: options must be labelled A-D",
                )
            value = (value or "").strip()
            if value:
                options[key] = value
        options = {letter: options[letter] for letter in "ABCD" if letter in options}

        if options and not ("A" in options and "B" in options):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Question {index}: an MCQ needs at least options A and B. "
                    "Clear all options to make it descriptive."
                ),
            )

        answer = (question.correct_answer or "").strip().upper() or None
        if answer not in options:
            answer = None

        cleaned.append(
            Question(id=index, text=text, options=options, correct_answer=answer)
        )

    save_questions(cleaned)
    return {
        "message": f"Saved corrections to {len(cleaned)} questions",
        "count": len(cleaned),
        "questions": [q.model_dump() for q in cleaned],
    }


@router.get("/questions")
async def get_all_questions():
    """Get all extracted questions (for admin review)."""
    questions = load_questions()
    return {"count": len(questions), "questions": [q.model_dump() for q in questions]}


@router.delete("/questions")
async def delete_all_questions():
    """Delete all questions."""
    clear_questions()
    return {"message": "All questions deleted"}
