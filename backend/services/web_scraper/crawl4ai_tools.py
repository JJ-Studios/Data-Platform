from typing import Literal, List, Optional
from pydantic_ai import FunctionToolset
from crawl4ai import AsyncWebCrawler, CacheMode, CrawlerRunConfig
from crawl4ai.deep_crawling import BFSDeepCrawlStrategy, DFSDeepCrawlStrategy, BestFirstCrawlingStrategy
from crawl4ai.deep_crawling.scorers import KeywordRelevanceScorer
from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

SearchStrategy = Literal["bfs", "dfs", "bestfirst"]

async def crawl_web(url: str):
    """Function to get markdown version of site"""
    config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(
            url=url,
            config=config
        )
        if result.success:
            return result.markdown
        else:
            return(f"Failed to crawl: {result.error_message}")

async def deep_web_crawl(
        url: str, 
        crawl_strategy: SearchStrategy, 
        max_depth: int = 2, 
        max_pages: int = 10, 
        score_threshold: float = 0.3,
        keywords: Optional[List[str]] = None
        ):
    """
    Docstring for deep_web_crawl
    
    :param url: Web url to crawl
    :type url: str
    :param crawl_strategy: depth first, breadth first, or best first [bfs, dfs, bestfirst]
    :type crawl_strategy: SearchStrategy
    :param max_depth: The max depth of which to crawl page urls
    :type max_depth: int
    :param max_pages: The max number of pages to crawl
    :type max_pages: int
    :param score_threshold: Minimum score for urls to be crawled
    :type score_threshold: float
    :param keywords: Keywords to use for bestfirst strategy, relevant keywords are used for scoring urls
    :type keywords: Optional[List[str]]
    """
    if crawl_strategy == "bfs":
        strategy = BFSDeepCrawlStrategy(
            max_depth=max_depth,
            include_external=False,
            max_pages=max_pages,
            score_threshold=score_threshold,
        )

    elif crawl_strategy == "dfs":
        strategy = DFSDeepCrawlStrategy(
            max_depth=max_depth,
            include_external=False,
            max_pages=max_pages,
            score_threshold=score_threshold,
        )
    
    elif crawl_strategy == "bestfirst":
        if not keywords:
            return "Please provide list of keywords to use for bestfirst strategy."
        scorer = KeywordRelevanceScorer(
            keywords=keywords,
            weight=0.7,
        )
        strategy = BestFirstCrawlingStrategy(
            max_depth=max_depth,
            include_external=False,
            max_pages=max_pages,
            url_scorer=scorer,
        )
    
    else:
        return f"Strategy is not valid: {crawl_strategy}. Please select 'bfs' or 'dfs'."

    config = CrawlerRunConfig(
        deep_crawl_strategy=strategy,
        scraping_strategy=LXMLWebScrapingStrategy(),
        # markdown_generator=DefaultMarkdownGenerator,
        verbose=True,
        cache_mode=CacheMode.BYPASS,
    )

    async with AsyncWebCrawler() as crawler:
        try:
            results = await crawler.arun(url, config=config)
            if hasattr(results, 'markdown'):
                return results.markdown
            elif isinstance(results, list):
                return "\n\n".join([r.markdown for r in results if r.success])

            return str(results)
        except Exception as e:
            return f"Crawl failed with error: {e}"

web_scraping_toolset = FunctionToolset(tools=[crawl_web])