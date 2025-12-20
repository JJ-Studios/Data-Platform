import requests
from bs4 import BeautifulSoup
import pandas as pd

from openai import OpenAI

class ScrapeEngine():
    def __init__(self, url: str):
        # LLM
        self.client = OpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )
        # self.model = 'llama3.2:3b'
        self.model = 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-1M-GGUF:Q4_K_M'
        self.message_catolog = {}
        self.system_prompt = "You are an expert."

        # data
        self.url = url
        self.html_content = None
        self.generated_code = None

    def _fetch_html(self) -> bool:
        """
        Private method to fetch HTML content from URL.
        HTML content to be used for context on how to build scraper for specific site.
        Returns boolean value for success / failure.
        """
        try:
            response = requests.get(self.url)
            response.raise_for_status()
            self.html_content = response.text
            print("HTML Content fetched successfully")
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error fetching URL: {e}")
            return False
        
    def generate_scraper(self, data_description: str):
        if not self.html_content:
            if not self._fetch_html():
                return
        
        prompt = f"""
        Based on the following HTML content, write a single Python function named
        `parse_data()` that uses the BeautifulSoup library to extract specific data.

        The function should:
        1. Use this url to get the html content from: {self.url}.
        2. Parse the HTML using BeautifulSoup.
        3. Find and extract the data as described: "{data_description}".
        4. Return the data as a pandas dataframe.
        5. The function should be self-contained and not rely on any external variables.
        6. Only return the Python code for the function, nothing else.

        HTML Content:
        ```html
        {self.html_content[:5000]}
        ```
        """

        messages = [
            {"role": "system", "content": "You are an expert python programmer with a specialty in web scraping and data engineering."},
            {"role": "user", "content": prompt}
        ]

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
        )
        self.generated_code = completion.choices[0].message.content
        print(self.generated_code)
        return
    
    def run_scraper(self) -> list | None:
        if not self.generated_code:
            return None
        
        if not self.html_content:
            if not self._fetch_html():
                return None
            
        try:
            local_scope = {}
            
            exec(self.generated_code, globals(), local_scope)

            parser_func = local_scope['parse_data']
            
            scraped_data = parser_func(self.html_content)
            return scraped_data
        
        except Exception as e:
            return None
        
    def onboard_scraper(self) -> bool:

        return False