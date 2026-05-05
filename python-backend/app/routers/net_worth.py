from fastapi import APIRouter

router = APIRouter()

@router.get("/net")
def get_users():
    return {"users": []}