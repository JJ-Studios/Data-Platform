import httpx
from bs4 import BeautifulSoup
from typing import Optional, List, Any
from pydantic import BaseModel, HttpUrl, Field
from pydantic_ai import Agent, RunContext
from settings.models import ExtractedData

async def fetch_webpage(url: str) -> tuple[str, str]:
    """Fetch webpage and return (html, cleaned text)"""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        response = await client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Web Scraping Agent)"
        })
        response.raise_for_status()
        html = response.text

    soup = BeautifulSoup(html, "html.parser")

    for element in soup(["script", "style", "nav", "footer", "header", "iframe"]):
        element.decompose()

    text = soup.get_text()
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split(" "))
    text = "\n".join(chunk for chunk in chunks if chunk)

    return html, text

class ScrapingContext(BaseModel):
    url: str
    html_content: str
    extraction_instructuions: Optional[str] = None

scraping_agent = Agent(
    model="model",
    output_type=ExtractedData,
    system_prompt="""You are an expert web scraping assistant that extracts structured data from webpage content.

Your task:
1. Analyze the provided webpage content
2. Extract relevant information based on user instructions (if provided)
3. If no instructions given, identify the most important/relevant data
4. Structure data into title, description, and metadata fields

Guidelines:
- Extract factual information only
- Use metadata for structured key-value pairs (prices, dates, categories, lists, etc.)
- Be thorough but concise
- For e-commerce: extract product name, price, specs, availability
- For articles: extract headline, summary, author, date, topics
- For general pages: extract main heading, purpose, key information
"""
)

@scraping_agent.tool
async def search_elements(ctx: RunContext[ScrapingContext], css_selector: str) -> str:
    """Search for HTML elements using CSS selectors"""
    soup = BeautifulSoup(ctx.deps.html_content, "html.parser")
    elements = soup.select(css_selector)
    return "\n".join([el.get_text(strip=True) for el in elements[:10]])

@scraping_agent.tool
async def get_links(ctx: RunContext[ScrapingContext]) -> List[str]:
    """Extract links from the webpage"""
    soup = BeautifulSoup(ctx.deps.html_content, "html.parser")
    links = [a.get("href") for a in soup.find_all("a", href=True)]
    return links[:20]

async def extract_data(url: str, instructions: Optional[str] = None) -> ExtractedData:
    """Main extraction function"""
    html, text = await fetch_webpage(url)

    max_chars = 15000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[Content truncated...]"

    context = ScrapingContext(
        url=url,
        html_content=html,
        extraction_instructions=instructions
    )

    prompt = f"Extract structured data from this webpage:\n\n{text}"
    if instructions:
        prompt = f"{instructions}\n\n{prompt}"

    result = await scraping_agent.run(prompt, deps=context)
    result.output.source_url = url

    return result.output