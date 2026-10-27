from fastapi import APIRouter, HTTPException
from models import ExamSubmission, ExamResult
from database import load_questions, load_results, save_result, load_students

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
    Submit exam answers and get results.

    MCQ questions are graded automatically. Descriptive questions (no options)
    cannot be auto-graded, so their answers are stored and the result is marked
    as pending evaluation.
    """
    questions = load_questions()
    if not questions:
        raise HTTPException(status_code=404, detail="No exam questions available.")

    # Build answer map (MCQ letters or free-text answers)
    answer_map = {a.question_id: (a.answer or "").strip() for a in submission.answers}

    correct_count = 0
    mcq_total = 0
    pending_evaluation = False
    details = []

    for q in questions:
        student_answer = answer_map.get(q.id, "")
        has_options = bool(q.options)

        if has_options:
            mcq_total += 1
            is_correct = bool(
                student_answer and q.correct_answer
                and student_answer.upper() == q.correct_answer.upper()
            )
            if is_correct:
                correct_count += 1

            details.append({
                "question_id": q.id,
                "question": q.text,
                "student_answer": student_answer.upper() if student_answer else "Not answered",
                "correct_answer": q.correct_answer or "N/A",
                "is_correct": is_correct
            })
        else:
            # Descriptive question -> manual evaluation
            pending_evaluation = True
            details.append({
                "question_id": q.id,
                "question": q.text,
                "student_answer": student_answer or "Not answered",
                "correct_answer": None,
                "is_correct": None
            })

    score = round((correct_count / mcq_total) * 100, 2) if mcq_total > 0 else 0.0

    if mcq_total == 0:
        mode = "descriptive"
    elif mcq_total == len(questions):
        mode = "mcq"
    else:
        mode = "mixed"

    # Look up the student's registered name
    student_name = submission.reg_no
    for s in load_students():
        if s.get("reg_no") == submission.reg_no:
            student_name = s.get("name", submission.reg_no)
            break

    result = ExamResult(
        reg_no=submission.reg_no,
        name=student_name,
        total_questions=len(questions),
        correct=correct_count,
        score=score,
        details=details,
        mode=mode,
        pending_evaluation=pending_evaluation
    )

    save_result(result)

    return result.model_dump()


@router.get("/result/{reg_no}")
async def get_result(reg_no: str):
    """Get the latest exam result for a student."""
    results = load_results()
    for r in reversed(results):
        if r.reg_no == reg_no:
            return r.model_dump()
    raise HTTPException(status_code=404, detail="No result found for this registration number")
