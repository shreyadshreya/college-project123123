import json
import os
from models import Question

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
QUESTIONS_FILE = os.path.join(DATA_DIR, "questions.json")
STUDENTS_FILE = os.path.join(DATA_DIR, "students.json")
RESULTS_FILE = os.path.join(DATA_DIR, "results.json")


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def load_questions() -> list[Question]:
    ensure_data_dir()
    if not os.path.exists(QUESTIONS_FILE):
        return []
    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [Question(**q) for q in data]


def save_questions(questions: list[Question]):
    ensure_data_dir()
    with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump([q.model_dump() for q in questions], f, indent=2, ensure_ascii=False)


def clear_questions():
    ensure_data_dir()
    if os.path.exists(QUESTIONS_FILE):
        os.remove(QUESTIONS_FILE)


def load_results() -> list[dict]:
    """Load legacy and current result records without changing their shape."""
    ensure_data_dir()
    if not os.path.exists(RESULTS_FILE):
        return []
    with open(RESULTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def save_results(results: list[dict]):
    ensure_data_dir()
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


def append_result(record: dict):
    """Append a submission while preserving all existing result records."""
    results = load_results()
    results.append(record)
    save_results(results)


def load_students() -> list[dict]:
    ensure_data_dir()
    if not os.path.exists(STUDENTS_FILE):
        return []
    with open(STUDENTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_student(name: str, reg_no: str):
    ensure_data_dir()
    students = load_students()
    # Check if student already exists
    for s in students:
        if s["reg_no"] == reg_no:
            s["name"] = name
            break
    else:
        students.append({"name": name, "reg_no": reg_no})
    with open(STUDENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(students, f, indent=2, ensure_ascii=False)


def student_exists(reg_no: str) -> bool:
    students = load_students()
    return any(s["reg_no"] == reg_no for s in students)
