import os
import tempfile
from datetime import datetime, timezone
import fitz
from fastapi import APIRouter, UploadFile, File, HTTPException
from pdf_extractor import extract_questions_from_pdf
from models import GradeSubmission
from database import (
    save_questions,
    clear_questions,
    load_questions,
    load_results,
    save_results,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF question paper and extract questions using AI (PyMuPDF)."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        questions = extract_questions_from_pdf(tmp_path)
        if not questions:
            # Include a raw text preview in the error for easier debugging
            doc = fitz.open(tmp_path)
            raw_text = "".join(page.get_text() for page in doc)
            doc.close()
            raise HTTPException(
                status_code=422,
                detail=(
                    "No questions could be extracted from the PDF. Please check the format. "
                    f"Raw text preview: {raw_text[:1000]}"
                ),
            )

        clear_questions()
        save_questions(questions)

        return {
            "message": f"Successfully extracted {len(questions)} questions",
            "count": len(questions),
            "questions": [q.model_dump() for q in questions]
        }
    finally:
        os.unlink(tmp_path)


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
