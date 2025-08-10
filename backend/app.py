import os
import uvicorn
import requests
import logging
from pydantic import BaseModel

from openai import OpenAI

from fastapi import FastAPI
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],  # or ["*"] for quick testing
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"
)
# model = 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-1M-GGUF:Q4_K_M'
# model = 'hf.co/unsloth/Qwen3-30B-A3B-Thinking-2507-GGUF:Q4_K_M'
model = 'hf.co/unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF:Q4_K_M'
# model='llama3.2:3b'

class ModelRequest(BaseModel):
    prompt: str

@app.get("/health")
def health_check():
    return {"status": "ok"}

# @app.get("/")
# def serve_html():
#     return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))

app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Root Endpoint to Serve index.html ---
@app.get("/")
async def read_index():
    # This endpoint serves your main HTML file.
    return FileResponse('static/index.html')


@app.get("/v1/models")
def models():
    url = "http://localhost:11434/v1/models"
    response = requests.get(url)
    response.raise_for_status()
    ollama_models = response.text
    return ollama_models

@app.post("/v1/responses/{prompt}")
async def responses(prompt):
    response = client.responses.create(
        model=model,
        input=prompt
    )
    return response

@app.post("/v1/completions")
def completions(request: ModelRequest):
    messages = [
        {"role": "system", "content": "You are an expert."},
        {"role": "user", "content": request.prompt}
    ]
    completion = client.chat.completions.create(
        model=model,
        messages=messages,
    )
    return completion.choices[0].message.content

def stream_generator(prompt):
    messages = [
        {"role": "system", "content": "You are an expert."},
        {"role": "user", "content": prompt}
    ]
    logger.info(f"Starting stream generation for prompt: {prompt}")
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )

        for chunk in completion:
            content = chunk.choices[0].delta.content
            if content is not None:
                logger.debug(f"Streaming content chunk: {content}")
                yield f"data: {content}\n\n"
    except Exception as e:
        yield "data: An error occured.\n\n"

@app.post("/v1/completions/stream")
def completions_stream(request: ModelRequest):
    logger.info(f"Received request on /v1/completions/stream endpoint.")
    return StreamingResponse(stream_generator(request.prompt), media_type="text/event-stream")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000)