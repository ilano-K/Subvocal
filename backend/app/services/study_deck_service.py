import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.models.study_deck import StudyDeck

from app.schemas.library import StudyDeckCreate, StudyDeckUpdate
from app.core.errors import NotFoundError

logger = logging.getLogger("subvocal.library")

async def get_study_decks(db: AsyncSession) -> list[StudyDeck]:
    logger.info("Fetching all study decks from database...")
    result = await db.execute(
        select(StudyDeck)
    )
    decks = list(result.scalars().all())
    logger.info("Found %d study decks in database.", len(decks))
    return decks
    

async def get_study_deck(id: int, db: AsyncSession) -> StudyDeck:
    logger.info("Fetching study deck id=%d", id)
    result = await db.execute(
        select(StudyDeck).where(StudyDeck.id == id)
    )
    
    study_deck = result.scalar_one_or_none()
    if study_deck is None:
        logger.warning("Study deck id=%d not found", id)
        raise NotFoundError()
    return study_deck

async def create_study_deck(
    data: StudyDeckCreate,
    db: AsyncSession,
) -> StudyDeck:
    logger.info("Creating new study deck: title='%s', file='%s', chunks=%d, style='%s'",
                data.deck_title, data.filename, len(data.chunks), data.style)
    study_deck = StudyDeck(
        **data.model_dump()
    )
    db.add(study_deck)
    await db.commit()
    await db.refresh(study_deck)
    logger.info("Saved study deck to DB with id=%s", study_deck.id)
    return study_deck

async def update_study_deck(
    id: int, 
    data: StudyDeckUpdate, 
    db: AsyncSession
) -> StudyDeck:
    logger.info("Updating study deck id=%d", id)
    result = await db.execute(
        select(StudyDeck).where(StudyDeck.id == id)
    )
    
    study_deck = result.scalar_one_or_none()
    
    if study_deck is None:
        logger.warning("Cannot update: study deck id=%d not found", id)
        raise NotFoundError() 
    
    updates = data.model_dump(exclude_unset=True)
    logger.info("Applying updates to deck id=%d: %s", id, list(updates.keys()))
    
    for field, value in updates.items():
        setattr(study_deck, field, value)
    
    await db.commit()
    await db.refresh(study_deck)
    logger.info("Updated study deck id=%d successfully", id)
    return study_deck

async def delete_study_deck(id: int, db: AsyncSession) -> None:
    logger.info("Deleting study deck id=%d", id)
    result = await db.execute(
        select(StudyDeck).where(StudyDeck.id == id)
    )
    
    study_deck = result.scalar_one_or_none()
    
    if study_deck is None:
        logger.warning("Cannot delete: study deck id=%d not found", id)
        raise NotFoundError()
    
    await db.delete(study_deck)
    await db.commit()
    logger.info("Deleted study deck id=%d successfully", id)
    
    
    