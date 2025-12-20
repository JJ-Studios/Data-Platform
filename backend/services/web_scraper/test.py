from scrape_engine import ScrapeEngine

# Replace with your actual URL and API key
TARGET_URL = "https://ufc.com/events" 

# 1. Initialize the engine
engine = ScrapeEngine(url=TARGET_URL)

# 2. Describe what you want and generate the scraper
description = "For each fight, get the red corner fighter's name and the blue corner fighter's name."
engine.generate_scraper(data_description=description)

# 3. Run the generated scraper to get the data
if engine.generated_code:
    data = engine.run_scraper()
    if data:
        print("\n--- Scraped Data ---")
        for item in data:
            print(item)