import os
import json
import uvicorn
import requests
import logging
import sqlite3
import aiosqlite
from pydantic import BaseModel

from decouple import config

from openai import OpenAI

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from scrapegraphai.graphs import SmartScraperGraph

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

OPENAI_BASE_URL = config("OPENAI_BASE_URL", default="http://localhost:11434/v1", cast=str)
OPENAI_API_KEY = config("OPENAI_API_KEY", default="ollama", cast=str)
OPENAI_MODEL = config("OPENAI_MODEL", default="ollama/hf.co/unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF:Q4_K_M", cast=str)

client = OpenAI(
    base_url=OPENAI_BASE_URL,
    api_key=OPENAI_API_KEY
)

graph_config = {
    "llm": {
        "model": OPENAI_MODEL,
        "model_tokens": 8192,
        # "temperature": 0.1,
        # "format": "json",
    },
    "embedder_model": {
        "model": "nomic-embed-text:latest"
    },
    "verbose": True,
    "headless": False,
}

class ModelRequest(BaseModel):
    prompt: str

class ScrapeRequest(BaseModel):
    url: str
    prompt: str

class SQL(BaseModel):
    create_statement: str
    insert_statement: str

class SQLQuery(BaseModel):
    query: str

class SaveResultsRequest(BaseModel):
    table_name: str
    data: list
    columns: dict  # Mapping of original column names to new column names

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
async def health_check():
    return {"status": "healthy"}


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
        model=OPENAI_MODEL,
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
        model=OPENAI_MODEL,
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
            model=OPENAI_MODEL,
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

@app.post("/v1/scrape")
def scrape(request: ScrapeRequest):
    smart_scraper_graph = SmartScraperGraph(
        prompt=request.prompt,
        # source="http://ufcstats.com/event-details/421ccfc6ddb17958",
        source=request.url,
        config=graph_config,
        # schema=UFCEvent,
    )
    result = smart_scraper_graph.run()
    try:
        final_result = json.dumps(result, indent=4)
        return final_result
    except Exception as e:
        print(f"json error: {e}")
        return result


@app.post("/v1/query")
def execute_query(request: SQLQuery):
    conn = None
    try:
        # Connect to the SQLite database
        conn = sqlite3.connect('generic.db')
        conn.row_factory = sqlite3.Row  # This allows us to access columns by name
        cursor = conn.cursor()
        
        # Execute the query
        cursor.execute(request.query)
        
        # If it's a SELECT query, fetch results
        if request.query.strip().upper().startswith("SELECT"):
            rows = cursor.fetchall()
            # Convert rows to list of dictionaries
            results = [dict(row) for row in rows]
            return {"results": results, "columns": list(rows[0].keys()) if rows else []}
        else:
            # For INSERT, UPDATE, DELETE, return the number of affected rows
            conn.commit()
            return {"message": f"Query executed successfully. {cursor.rowcount} rows affected."}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if conn:
            conn.close()


@app.post("/v1/save-results")
def save_results(request: SaveResultsRequest):
    conn = None
    try:
        # Connect to the SQLite database
        conn = sqlite3.connect('generic.db')
        cursor = conn.cursor()
        
        if not request.data or len(request.data) == 0:
            raise HTTPException(status_code=400, detail="No data provided to save")
        
        if not request.columns or len(request.columns) == 0:
            raise HTTPException(status_code=400, detail="No columns specified for saving")
        
        # Get the selected columns (keys) and their new names (values)
        original_columns = list(request.columns.keys())
        renamed_columns = list(request.columns.values())
        
        # Create table with dynamic columns
        # Using TEXT for all columns for simplicity - in production you might want to infer types
        column_defs = ", ".join([f'"{col}" TEXT' for col in renamed_columns])
        create_table_query = f'CREATE TABLE IF NOT EXISTS "{request.table_name}" (id INTEGER PRIMARY KEY, {column_defs})'
        cursor.execute(create_table_query)
        
        # Insert data
        placeholders = ", ".join(["?"] * len(renamed_columns))
        column_names = ", ".join([f'"{col}"' for col in renamed_columns])
        insert_query = f'INSERT INTO "{request.table_name}" ({column_names}) VALUES ({placeholders})'
        
        # Prepare data tuples with renamed columns
        data_tuples = []
        for row in request.data:
            tuple_data = tuple(row.get(orig_col, None) for orig_col in original_columns)
            data_tuples.append(tuple_data)
        
        cursor.executemany(insert_query, data_tuples)
        conn.commit()
        
        return {"message": f"Successfully saved {len(request.data)} rows to table '{request.table_name}' with columns: {', '.join(renamed_columns)}"}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)