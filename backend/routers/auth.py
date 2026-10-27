from fastapi import APIRouter, HTTPException
from models import StudentLogin
from database import save_student, student_exists

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
async def login(student: StudentLogin):
    """
    Voice-based student login.
    Student speaks their Name and Registration Number.
    """
    if not student.name or not student.reg_no:
        raise HTTPException(status_code=400, detail="Name and Registration Number are required")

    # Save or update student
    save_student(student.name, student.reg_no)

    is_returning = student_exists(student.reg_no)

    return {
        "message": f"Welcome, {student.name}! You are logged in.",
        "name": student.name,
        "reg_no": student.reg_no,
        "is_returning_student": is_returning
    }


@router.post("/register")
async def register(student: StudentLogin):
    """Register a new student (pre-registration)."""
    if not student.name or not student.reg_no:
        raise HTTPException(status_code=400, detail="Name and Registration Number are required")

    save_student(student.name, student.reg_no)

    return {
        "message": f"Registration successful for {student.name}",
        "name": student.name,
        "reg_no": student.reg_no
    }
