from fastapi import APIRouter

from services.web_scraper.crawl4ai_scraper import extract_with_llm

web_scraper_router = APIRouter(prefix="/api/web_scraper")

@web_scraper_router.get("/get_web_data")
async def get_web_data(url: str, prompt: str):
    result = await extract_with_llm(url=url, prompt=prompt)
    return result