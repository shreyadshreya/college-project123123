from pydantic import BaseModel, Field
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


class ExamResult(BaseModel):
    reg_no: str
    name: str
    total_questions: int
    correct: int
    score: float
    details: list[dict]
    mode: str = "mcq"  # "mcq" | "descriptive" | "mixed"
    pending_evaluation: bool = False
    graded: bool = False
    teacher_feedback: Optional[str] = None
    graded_at: Optional[str] = None


class GradeSubmission(BaseModel):
    score: float = Field(ge=0, le=100)
    feedback: Optional[str] = None
