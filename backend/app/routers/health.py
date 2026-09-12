from fastapi import APIRouter

router = APIRouter(prefix="/health")

@router.get('/')
def health_check():
    return {"status": "ok", "version": "0.1.0"}