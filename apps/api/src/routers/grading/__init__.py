from src.routers.grading.feedback import router as feedback_router
from src.routers.grading.sse import router as sse_router
from src.routers.grading.submit import router as submit_router
from src.routers.grading.teacher import router as teacher_router

__all__ = ["feedback_router", "sse_router", "submit_router", "teacher_router"]
