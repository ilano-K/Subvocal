from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import JSON, DateTime, func
from app.database.db import Base
from datetime import datetime


class StudyDeck(Base):
    __tablename__ = "study_decks"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column()
    deck_title: Mapped[str] = mapped_column()
    pause_sec: Mapped[float] = mapped_column()
    voice_rate: Mapped[float] = mapped_column()
    estimated_sec: Mapped[float] = mapped_column()
    transcript: Mapped[str] = mapped_column()
    chunks: Mapped[list[dict]] = mapped_column(JSON)
    concepts: Mapped[list[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
