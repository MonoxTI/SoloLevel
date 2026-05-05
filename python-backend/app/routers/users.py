from fastapi import APIRouter

router = APIRouter()

@router.get("/user")
def get_users():
    return {"users": []}