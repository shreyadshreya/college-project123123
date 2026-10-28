from pydantic import BaseModel
from typing import Optional


class StudentLogin(BaseModel):
    name: str
    reg_no: str


class Question(BaseModel):
    id: int
    text: str
    options: dict[str, str]  # {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_answer: Optional[str] = None  # "A", "B", "C", or "D"


class ExamAnswer(BaseModel):
    question_id: int
    answer: str  # "A", "B", "C", or "D"


class ExamSubmission(BaseModel):
    reg_no: str
    answers: list[ExamAnswer]


class SubmissionRecord(BaseModel):
    reg_no: str
    name: str
    submitted_at: str
    total_questions: int
    answers: list[ExamAnswer]
