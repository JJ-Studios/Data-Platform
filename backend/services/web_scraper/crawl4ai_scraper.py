import json
import os

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, LLMConfig
from crawl4ai import LLMExtractionStrategy

from dotenv import load_dotenv

load_dotenv()

api_token = os.getenv("OPENAI_API_KEY")

async def extract_with_llm(url: str, prompt: str):
    browser_config = BrowserConfig(verbose=True, headless=True, text_mode=False)

    # llm_config = LLMConfig(provider="ollama/llama3.2:3b")
    # llm_config = LLMConfig(provider="ollama/hf.co/unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF:Q4_K_M")
    llm_config = LLMConfig(provider="openrouter/amazon/nova-2-lite-v1:free", base_url="https://openrouter.ai/api/v1", api_token=api_token)


    run_config = CrawlerRunConfig(
        only_text=True,
        remove_forms=True, 
        word_count_threshold=1,
        extraction_strategy=LLMExtractionStrategy(
            llm_config=llm_config,
            verbose=True,
            # schema=json,
            extraction_type="schema",
            instruction=prompt,
        ),
        cache_mode=CacheMode.BYPASS,
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url, config=run_config)

        raw_content = result.extracted_content

        if not raw_content:
            return {"error": "No content extracted"}
        
        try:
            parsed_data = json.loads(raw_content)
            return parsed_data
        
        except json.JSONDecodeError:
            print(f"Failed to parse JSON: {raw_content}")
            return {
                "error": "Failed to parse LLM output",
                "raw_content": raw_content
            }

        # return result.extracted_content