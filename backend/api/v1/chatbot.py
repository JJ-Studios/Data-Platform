import requests
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from pydantic import BaseModel

from services.chat_engine.chat_interaction import ChatInteraction

chatbot_router = APIRouter(prefix="/api/chatbot")
chatbot = ChatInteraction()

class MessageRequest(BaseModel):
    user_id: str
    message: str

class MessageResponse(BaseModel):
    output: str
    user_id: str

@chatbot_router.get("/get_models")
def get_models():
    url = "http://localhost:11434/v1/models"
    response = requests.get(url)
    response.raise_for_status()
    ollama_models = response.text
    return ollama_models

@chatbot_router.post("/chat")
async def chat(request: MessageRequest):
    response = await chatbot.send_message(user_id=request.user_id, message=request.message)
    return response

@chatbot_router.post("/chat/stream")
async def chat_stream(request: MessageRequest):
    async def event_generator():
        try:
            async for event in chatbot.stream_message(
                user_id=request.user_id,
                message = request.message,
                include_events=True
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@chatbot_router.post("/chat/stream/text")
async def chat_stream_text_endpoint(request: MessageRequest):
    async def text_generator():
        try:
            async for text_chunk in chatbot.stream_text_only(
                user_id=request.user_id,
                message=request.message
            ):
                yield text_chunk
        except Exception as e:
            yield f"\n\nError: {str(e)}"
    
    return StreamingResponse(
        text_generator(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@chatbot_router.get("/get_chat_history")
def get_chat_history(user_id: str):
    message_history = chatbot.get_chat_history(user_id=user_id)
    return message_history