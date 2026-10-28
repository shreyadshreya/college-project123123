import re
import unicodedata

from fastapi import APIRouter, HTTPException

from admin_auth import (
    ADMIN_USERNAME,
    TOKEN_TTL_SECONDS,
    authenticate_admin,
    create_admin_token,
)
from database import load_students
from models import AdminLogin, StudentLogin

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Registration numbers in the project are compact uppercase letters/digits.
# The existing records are inconsistent, so no fixed length/prefix is assumed.
REG_NO_RE = re.compile(r"^[A-Z0-9]+$")


def _normalise_name(value: str) -> str:
    """Compare names case-insensitively, ignoring spacing and punctuation."""
    folded = unicodedata.normalize("NFKC", value).casefold()
    return "".join(char for char in folded if char.isalnum())


def _normalise_reg_no(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().upper()


def _find_registered_student(name: str, reg_no: str) -> dict | None:
    """Return the record only when the name and number belong together."""
    wanted_name = _normalise_name(name)
    wanted_reg_no = _normalise_reg_no(reg_no)

    for student in load_students():
        stored_reg_no = _normalise_reg_no(str(student.get("reg_no", "")))
        if stored_reg_no != wanted_reg_no:
            continue
        if _normalise_name(str(student.get("name", ""))) == wanted_name:
            return student
    return None


@router.post("/login")
async def login(student: StudentLogin):
    """
    Log in only a student whose full name and registration number match the
    same existing record. Unknown students are never added automatically.
    """
    name = (student.name or "").strip()
    reg_no = _normalise_reg_no(student.reg_no or "")

    if not name or not _normalise_name(name):
        raise HTTPException(status_code=400, detail="Please enter your full name.")
    if not reg_no:
        raise HTTPException(status_code=400, detail="Please enter your registration number.")
    if not REG_NO_RE.fullmatch(reg_no):
        raise HTTPException(
            status_code=400,
            detail="Registration number must contain only letters and digits.",
        )

    registered = _find_registered_student(name, reg_no)
    if not registered:
        raise HTTPException(
            status_code=401,
            detail=(
                "Login failed. The full name and registration number do not "
                "match a registered student."
            ),
        )

    return {
        "message": f"Welcome, {registered['name']}! You are logged in.",
        "name": registered["name"],
        "reg_no": registered["reg_no"],
        "is_returning_student": True,
    }


@router.post("/admin-login")
async def admin_login(admin: AdminLogin):
    """Issue a short-lived bearer token for the configured admin account."""
    username = (admin.username or "").strip()
    password = admin.password or ""

    if not authenticate_admin(username, password):
        raise HTTPException(
            status_code=401,
            detail="Invalid admin username or password.",
        )

    return {
        "message": "Admin login successful.",
        "access_token": create_admin_token(),
        "token_type": "bearer",
        "expires_in": TOKEN_TTL_SECONDS,
        "username": ADMIN_USERNAME,
    }


@router.post("/register")
async def register(student: StudentLogin):
    """
    Public self-registration is disabled. Student records are provisioned by
    the examination office so unknown users cannot create a login for themselves.
    """
    raise HTTPException(
        status_code=403,
        detail="Student registration is managed by the examination office.",
    )
