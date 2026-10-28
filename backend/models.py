from pydantic import BaseModel
from typing import Optional


class StudentLogin(BaseModel):
    name: str
    reg_no: str


class AdminLogin(BaseModel):
    username: str
    password: str


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
    exam_id: Optional[str] = None
    exam_name: Optional[str] = None


class SubmissionRecord(BaseModel):
    id: str
    reg_no: str
    name: str
    exam_id: Optional[str] = None
    exam_name: Optional[str] = None
    submitted_at: str
    total_questions: int
    answered: int
    status: str
    mode: Optional[str] = None
    correct: Optional[int] = None
    score: Optional[float] = None
    marks_obtained: Optional[float] = None
    total_marks: Optional[float] = None
    details: list[dict]
    answers: list[ExamAnswer]
    pending_evaluation: bool = False
    graded: bool = False
    teacher_feedback: Optional[str] = None
    graded_at: Optional[str] = None
