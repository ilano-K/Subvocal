from fastapi import APIRouter, Depends, status
from app.database.db import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.library import StudyDeckCreate, StudyDeckResponse, StudyDeckUpdate
from app.services import study_deck_service

router = APIRouter(prefix="/library")

@router.get("/study_decks", response_model=list[StudyDeckResponse])
async def get_study_decks(db: AsyncSession = Depends(get_db)):
    return await study_deck_service.get_study_decks(db)

@router.get("/study_decks/{deck_id}", response_model=StudyDeckResponse)
async def get_study_deck(deck_id: int, db: AsyncSession = Depends(get_db)):
    return await study_deck_service.get_study_deck(deck_id, db)

@router.post("/study_decks", response_model=StudyDeckResponse, status_code=status.HTTP_201_CREATED)
async def create_study_deck(req: StudyDeckCreate, db: AsyncSession = Depends(get_db)):
    return await study_deck_service.create_study_deck(req, db)

@router.put("/study_decks/{deck_id}", response_model=StudyDeckResponse)
async def update_study_deck(deck_id: int, req: StudyDeckUpdate, db: AsyncSession = Depends(get_db)):
    return await study_deck_service.update_study_deck(deck_id, req, db)

@router.delete("/study_decks/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study_deck(deck_id: int, db: AsyncSession = Depends(get_db)):
    await study_deck_service.delete_study_deck(deck_id, db)
    


