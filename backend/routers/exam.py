from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from models import ExamSubmission, SubmissionRecord
from database import load_questions, load_students, save_submission

router = APIRouter(prefix="/exam", tags=["Exam"])


@router.get("/questions")
async def get_exam_questions():
    """Get all exam questions (without correct answers for students)."""
    questions = load_questions()
    if not questions:
        raise HTTPException(status_code=404, detail="No exam questions available. Please contact admin.")

    # Remove correct answers before sending to student
    safe_questions = []
    for q in questions:
        safe_questions.append({
            "id": q.id,
            "text": q.text,
            "options": q.options
        })

    return {"count": len(safe_questions), "questions": safe_questions}


@router.get("/question/{question_id}")
async def get_question(question_id: int):
    """Get a specific question by ID."""
    questions = load_questions()
    for q in questions:
        if q.id == question_id:
            return {
                "id": q.id,
                "text": q.text,
                "options": q.options
            }
    raise HTTPException(status_code=404, detail="Question not found")


@router.post("/submit")
async def submit_exam(submission: ExamSubmission):
    """
    Save an exam submission without scoring or grading it.

    Answers are kept for the examination office but no result is calculated,
    stored as a score, or returned to the student.
    """
    questions = load_questions()
    if not questions:
        raise HTTPException(status_code=404, detail="No exam questions available.")

    reg_no = submission.reg_no.strip()
    if not reg_no:
        raise HTTPException(status_code=400, detail="Registration number is required.")

    student = next(
        (record for record in load_students() if record.get("reg_no") == reg_no),
        None,
    )
    if not student:
        raise HTTPException(status_code=401, detail="Please log in before submitting the exam.")

    question_ids = {question.id for question in questions}
    answers = [answer for answer in submission.answers if answer.question_id in question_ids]
    answered = sum(1 for answer in answers if (answer.answer or "").strip())

    save_submission(
        SubmissionRecord(
            reg_no=reg_no,
            name=student.get("name", reg_no),
            submitted_at=datetime.now(timezone.utc).isoformat(),
            total_questions=len(questions),
            answers=answers,
        )
    )

    return {
        "message": "Exam submitted successfully.",
        "submitted": True,
        "answered": answered,
        "total_questions": len(questions),
    }
