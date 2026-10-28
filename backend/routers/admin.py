import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from pdf_extractor import (
    PDFExtractionError,
    extract_questions_from_pdf,
    get_pdf_text_preview,
)
from models import GradeSubmission
from database import (
    save_questions,
    clear_questions,
    load_questions,
    load_results,
    save_results,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF question paper and extract questions (text or OCR)."""
    filename = file.filename or ""
    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files (.pdf) are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"The PDF is too large (maximum {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )
    if b"%PDF-" not in content[:1024]:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF (missing PDF header)",
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            questions = extract_questions_from_pdf(tmp_path)
        except PDFExtractionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        if not questions:
            preview = get_pdf_text_preview(tmp_path)
            if preview:
                detail = (
                    "No questions could be extracted from this PDF. "
                    "The text was readable, but no supported question format was found. "
                    f"Extracted text preview: {preview}"
                )
            else:
                detail = (
                    "No questions could be extracted from this PDF. "
                    "The PDF contains no extractable text. If it is a scanned paper, "
                    "make sure OCR support is installed (see requirements.txt)."
                )
            raise HTTPException(status_code=422, detail=detail)

        clear_questions()
        save_questions(questions)

        return {
            "message": f"Successfully extracted {len(questions)} questions",
            "count": len(questions),
            "questions": [q.model_dump() for q in questions],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process the PDF: {exc}",
        ) from exc
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


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


@router.get("/results")
async def get_all_results():
    """Get all exam submissions (for teacher review / manual grading)."""
    results = load_results()
    return {"count": len(results), "results": [r.model_dump() for r in results]}


@router.post("/results/{index}/grade")
async def grade_result(index: int, grade: GradeSubmission):
    """
    Manually grade a descriptive/mixed submission.

    `index` is the 0-based position of the submission in the results list
    returned by GET /admin/results. The score is a percentage (0-100).
    """
    results = load_results()
    if index < 0 or index >= len(results):
        raise HTTPException(status_code=404, detail="Submission not found")

    result = results[index]
    if result.mode == "mcq":
        raise HTTPException(
            status_code=400,
            detail="MCQ submissions are graded automatically and cannot be graded manually",
        )

    result.score = round(grade.score, 2)
    result.pending_evaluation = False
    result.graded = True
    result.teacher_feedback = grade.feedback.strip() if grade.feedback else None
    result.graded_at = datetime.now(timezone.utc).isoformat()
    save_results(results)

    return result.model_dump()
