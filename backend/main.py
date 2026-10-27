from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import admin, auth, exam, sample

app = FastAPI(
    title="AI Driven Accessible Examination System",
    description="An AI-powered accessible examination system for visually impaired students",
    version="1.0.0"
)

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(exam.router)
app.include_router(sample.router)


@app.get("/")
async def root():
    return {
        "message": "AI Driven Accessible Examination System",
        "version": "1.0.0",
        "endpoints": {
            "admin": "/admin",
            "auth": "/auth",
            "exam": "/exam"
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
