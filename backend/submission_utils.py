from typing import Any


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _submission_id(record: dict, index: int) -> str:
    return str(record.get("id") or f"legacy-{index}")


def _normalise_detail(detail: Any, index: int) -> dict:
    item = detail if isinstance(detail, dict) else {}
    options = item.get("options")
    if not isinstance(options, dict):
        options = {}

    marks = _as_float(item.get("marks_awarded"))
    max_marks = _as_float(item.get("max_marks"))
    is_correct = item.get("is_correct")
    if not isinstance(is_correct, bool):
        is_correct = None

    student_answer = item.get("student_answer")
    if student_answer is None:
        student_answer = ""

    correct_answer = item.get("correct_answer")
    if not isinstance(correct_answer, str) or not correct_answer.strip():
        correct_answer = None

    return {
        "question_id": _as_int(item.get("question_id"), index + 1),
        "question": str(item.get("question") or ""),
        "options": {str(key): str(value) for key, value in options.items()},
        "student_answer": str(student_answer),
        "correct_answer": correct_answer,
        "is_correct": is_correct,
        "marks_awarded": marks,
        "max_marks": max_marks,
    }


def _details(record: dict) -> list[dict]:
    raw = record.get("details")
    if isinstance(raw, list):
        return [_normalise_detail(item, index) for index, item in enumerate(raw)]

    # A minimal fallback for any future record that only has question answers.
    answers = record.get("answers")
    if isinstance(answers, list):
        return [
            _normalise_detail(
                {
                    "question_id": item.get("question_id"),
                    "student_answer": item.get("answer", ""),
                },
                index,
            )
            for index, item in enumerate(answers)
            if isinstance(item, dict)
        ]
    return []


def _answered(record: dict, details: list[dict]) -> int:
    value = record.get("answered")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(0, int(value))
    return sum(
        1
        for detail in details
        if detail["student_answer"].strip()
        and detail["student_answer"].strip().lower() != "not answered"
    )


def _status(record: dict, details: list[dict]) -> str:
    if record.get("status"):
        return str(record["status"])
    if record.get("graded"):
        return "Graded"
    if record.get("pending_evaluation"):
        return "Pending evaluation"
    if record.get("submitted_at"):
        return "Submitted"
    return "Legacy submission"


def _total_marks(record: dict, details: list[dict]) -> float | None:
    stored = _as_float(record.get("total_marks"))
    if stored is not None:
        return stored
    values = [detail["max_marks"] for detail in details if detail["max_marks"] is not None]
    if values and len(values) == len(details):
        return round(sum(values), 2)
    return None


def normalise_submission(record: dict, index: int, include_details: bool = False) -> dict:
    """Return one consistent submission shape for both old and new records."""
    if not isinstance(record, dict):
        record = {}

    details = _details(record)
    score = _as_float(record.get("score"))
    marks_obtained = _as_float(record.get("marks_obtained"))
    if marks_obtained is None:
        marks_obtained = score

    result = {
        "id": _submission_id(record, index),
        "reg_no": str(record.get("reg_no") or ""),
        "name": str(record.get("name") or record.get("reg_no") or ""),
        "exam_id": record.get("exam_id"),
        "exam_name": record.get("exam_name"),
        "submitted_at": record.get("submitted_at"),
        "total_questions": _as_int(record.get("total_questions"), len(details)),
        "answered": _answered(record, details),
        "correct": _as_int(record.get("correct")) if record.get("correct") is not None else None,
        "score": score,
        "marks_obtained": marks_obtained,
        "total_marks": _total_marks(record, details),
        "status": _status(record, details),
        "mode": record.get("mode"),
        "pending_evaluation": bool(record.get("pending_evaluation", False)),
        "graded": bool(record.get("graded", False)),
        "teacher_feedback": record.get("teacher_feedback"),
        "graded_at": record.get("graded_at"),
        "legacy": not bool(record.get("id")),
    }

    if include_details:
        result["details"] = details
        result["answers"] = [
            {
                "question_id": detail["question_id"],
                "answer": detail["student_answer"],
            }
            for detail in details
        ]
    return result
