import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from models import ExamSubmission, SubmissionRecord
from database import append_result, load_questions, load_students

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
    Save an exam submission for the examination office.

    The student never receives a score. Answers are persisted with an
    admin-only, per-question record so marks can be reviewed later.
    """
    questions = load_questions()
    if not questions:
        raise HTTPException(status_code=404, detail="No exam questions available.")

    reg_no = submission.reg_no.strip()
    if not reg_no:
        raise HTTPException(status_code=400, detail="Registration number is required.")

    student = next(
        (
            record
            for record in load_students()
            if str(record.get("reg_no", "")).strip().upper() == reg_no.upper()
        ),
        None,
    )
    if not student:
        raise HTTPException(status_code=401, detail="Please log in before submitting the exam.")

    answer_map = {answer.question_id: (answer.answer or "").strip() for answer in submission.answers}
    question_ids = {question.id for question in questions}
    answers = [
        answer
        for answer in submission.answers
        if answer.question_id in question_ids
    ]

    details = []
    answered = 0
    correct = 0
    auto_graded = 0
    pending_evaluation = False

    for question in questions:
        student_answer = answer_map.get(question.id, "")
        if student_answer:
            answered += 1

        has_options = bool(question.options)
        correct_answer = (
            question.correct_answer
            if question.correct_answer in question.options
            else None
        )

        is_correct = None
        if has_options and correct_answer:
            auto_graded += 1
            is_correct = bool(
                student_answer
                and student_answer.upper() == correct_answer.upper()
            )
            if is_correct:
                correct += 1
        else:
            pending_evaluation = True

        details.append(
            {
                "question_id": question.id,
                "question": question.text,
                "options": question.options,
                "student_answer": student_answer,
                "correct_answer": correct_answer,
                "is_correct": is_correct,
                "marks_awarded": None,
                "max_marks": None,
            }
        )

    all_auto_graded = auto_graded == len(questions) and bool(questions)
    score = round((correct / len(questions)) * 100, 2) if all_auto_graded else None
    if pending_evaluation:
        status = "Pending evaluation"
    elif answered == len(questions):
        status = "Completed"
    else:
        status = "Partially answered"

    fingerprint = json.dumps(
        [
            {
                "id": question.id,
                "text": question.text,
                "options": question.options,
                "correct_answer": question.correct_answer,
            }
            for question in questions
        ],
        ensure_ascii=False,
        sort_keys=True,
    )
    exam_id = submission.exam_id or f"exam-{hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:10]}"
    exam_name = submission.exam_name or "Current Exam"

    record = SubmissionRecord(
        id=uuid.uuid4().hex,
        reg_no=str(student.get("reg_no", reg_no)),
        name=str(student.get("name", reg_no)),
        exam_id=exam_id,
        exam_name=exam_name,
        submitted_at=datetime.now(timezone.utc).isoformat(),
        total_questions=len(questions),
        answered=answered,
        status=status,
        mode=(
            "descriptive"
            if all(not question.options for question in questions)
            else "mcq"
            if all(question.options for question in questions)
            else "mixed"
        ),
        correct=correct,
        score=score,
        marks_obtained=score,
        total_marks=None,
        details=details,
        answers=answers,
        pending_evaluation=pending_evaluation,
        graded=False,
        teacher_feedback=None,
        graded_at=None,
    ).model_dump()

    append_result(record)

    return {
        "message": "Exam submitted successfully.",
        "submitted": True,
        "submission_id": record["id"],
        "answered": answered,
        "total_questions": len(questions),
    }
