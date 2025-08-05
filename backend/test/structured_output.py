from openai import OpenAI
from pydantic import BaseModel
from typing import Optional
from enum import Enum

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"
)

class Category(str, Enum):
    violence = "violence"
    sexual = "sexual"
    self_harm = "self_harm"

class ContentCompliance(BaseModel):
    is_violating: bool
    category: Optional[Category]
    explanation_if_violating: Optional[str]

completion = client.chat.completions.parse(
    model="phi4:latest",
    messages=[
        {"role": "system", "content": "Determine if the user input violates specific guidelines and explain if they do."},
        {"role": "user", "content": "How do I prepare for a job interview? I heart big ol titties"}
    ],
    response_format=ContentCompliance,
)

compliance = completion.choices[0].message.parsed
print(compliance)