import requests
from bs4 import BeautifulSoup
import pandas as pd

fight_data_list = []

response = requests.get('https://www.ufc.com/event/ufc-319')

# print(response.status_code)

# print(response.content)

soup = BeautifulSoup(response.content, 'html.parser')

# print(soup.prettify())

fight_cards = soup.find_all('div', class_='c-listing-ticker-fightcard')

for card in fight_cards:
    # --- Red Corner ---
    red_name = card.find('div', class_='c-listing-ticker-fightcard__red_corner_name').get_text(strip=True)
    red_corner_div = card.find('div', class_='c-listing-ticker-fightcard__red_corner')
    red_image = red_corner_div.find('img')['src']
    
    # Handle potentially missing rank
    red_rank_tag = red_corner_div.find('div', class_='c-listing-ticker-fightcard__rank')
    red_rank = red_rank_tag.get_text(strip=True) if red_rank_tag else "Unranked"

    # --- Blue Corner ---
    blue_name = card.find('div', class_='c-listing-ticker-fightcard__blue_corner_name').get_text(strip=True)
    blue_corner_div = card.find('div', class_='c-listing-ticker-fightcard__blue_corner')
    blue_image = blue_corner_div.find('img')['src']

    # Handle potentially missing rank
    blue_rank_tag = blue_corner_div.find('div', class_='c-listing-ticker-fightcard__rank')
    blue_rank = blue_rank_tag.get_text(strip=True) if blue_rank_tag else "Unranked"
    
    # Print the results for the current fight
    # print(f"🔴 {red_name} ({red_rank}) vs. 🔵 {blue_name} ({blue_rank})")
    # print(f"   Red Image: {red_image}")
    # print(f"   Blue Image: {blue_image}")
    # print("-" * 40)

    fight_data_list.append({
        "Red Corner Name": red_name,
        "Red Corner Rank": red_rank,
        "Blue Corner Name": blue_name,
        "Blue Corner Rank": blue_rank,
        "Red Corner Image": red_image,
        "Blue Corner Image": blue_image
    })

df = pd.DataFrame(fight_data_list)

print(df)