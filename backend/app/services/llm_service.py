from openai import AsyncOpenAI
from app.config import settings

# 1. initialize llm client
client = AsyncOpenAI(
    base_url=settings.llm_base_url,
    api_key=settings.llm_api_key,
)


