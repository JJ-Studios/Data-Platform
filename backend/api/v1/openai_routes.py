import json
import time
import uuid
from typing import List, Optional, Literal, Union, Dict, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

# Import your existing chatbot instance
from api.v1.chatbot import chatbot

openai_router = APIRouter(prefix="/api/openai", tags=["OpenAI Compatible"])

# --- OpenAI Pydantic Models ---

class ChatMessage(BaseModel):
    role: str
    content: str

class OpenAIRequest(BaseModel):
    model: str = "default"
    messages: List[ChatMessage]
    stream: bool = False
    user: Optional[str] = "default_user" 
    temperature: Optional[float] = 0.7
    # NEW: Option to toggle stateless mode
    stateless: bool = False 

class OpenAIModel(BaseModel):
    id: str
    object: str = "model"
    created: int = int(time.time())
    owned_by: str = "system"

class ModelList(BaseModel):
    object: str = "list"
    data: List[OpenAIModel]

# --- Endpoints ---

@openai_router.get("/models", response_model=ModelList)
async def list_models():
    """
    Standard endpoint used by OpenWebUI/LibreChat to discover available models.
    """
    return ModelList(data=[
        OpenAIModel(id="sql-agent", owned_by="vanna"),
    ])

@openai_router.post("/chat/completions")
async def chat_completions(request: OpenAIRequest):
    """
    OpenAI-compatible chat completion endpoint.
    Supports both stateful (server memory) and stateless (client memory) modes.
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    
    # 1. Extract Prompt (Last Message)
    last_message = request.messages[-1]
    user_prompt = last_message.content
    user_id = request.user or "openai_user"
    
    # 2. Determine History Mode
    history_context = None
    
    # If stateless is requested OR if we see a significant history sent by the client
    # (heuristically, if >1 message and stateless flag wasn't explicitly set to False),
    # we can opt to use the client's history.
    # For now, we rely on the explicit flag 'stateless=True' OR if the user explicitly
    # asks for it via the '/stateless' path logic if we had one. 
    # Let's use the explicit flag from the request body.
    
    if request.stateless:
        # Convert previous messages (all except the last one) to Pydantic format
        previous_messages = [
            {"role": m.role, "content": m.content} 
            for m in request.messages[:-1]
        ]
        history_context = chatbot.convert_openai_messages(previous_messages)

    # 3. Handle Streaming Request
    if request.stream:
        return await handle_streaming(user_id, user_prompt, request.model, history_context)

    # 4. Handle Non-Streaming Request
    full_response = await chatbot.send_message(
        user_id=user_id, 
        message=user_prompt,
        history=history_context
    )
    
    return {
        "id": f"chatcmpl-{uuid.uuid4()}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": request.model,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": full_response
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": len(user_prompt), 
            "completion_tokens": len(full_response),
            "total_tokens": len(user_prompt) + len(full_response)
        }
    }

async def handle_streaming(user_id: str, prompt: str, model: str, history_context: Optional[List[Any]]):
    """
    Translates your internal stream_message events into OpenAI Chunk format.
    """
    async def openai_stream_generator():
        run_id = f"chatcmpl-{uuid.uuid4()}"
        created_time = int(time.time())

        # 1. Send initial role chunk
        role_chunk = {
            "id": run_id,
            "object": "chat.completion.chunk",
            "created": created_time,
            "model": model,
            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]
        }
        yield f"data: {json.dumps(role_chunk)}\n\n"

        # 2. Iterate through internal generator with optional history
        async for event in chatbot.stream_message(
            user_id, 
            prompt, 
            include_events=True, 
            history=history_context
        ):
            content_to_yield = None

            if event["type"] == "text":
                content_to_yield = event["content"]
            
            elif event["type"] == "thinking":
                # Some UIs support <think> tags, but blockquote is safer universal fallback
                content_to_yield = f"{event['content']}" 

            elif event["type"] == "tool_call":
                # Use HTML details for collapsible sections
                metadata = event.get("metadata", {})
                tool_name = metadata.get("tool_name", "Unknown Tool")
                tool_args = metadata.get("args", {})
                
                # Format arguments nicely for display
                if isinstance(tool_args, (dict, list)):
                    args_display = json.dumps(tool_args, indent=2)
                else:
                    args_display = str(tool_args)

                content_to_yield = f"\n<details><summary>🛠️ Running: {tool_name}</summary>\n\n```json\n{args_display}\n```\n</details>\n\n"
            
            elif event["type"] == "tool_result":
                content_to_yield = f"\n<details><summary>📋 Tool Result</summary>\n\n```json\n{event['content']}\n```\n</details>\n\n"
            
            elif event["type"] == "error":
                content_to_yield = f"\n\n**Error:** {event['content']}\n\n"

            if content_to_yield:
                chunk = {
                    "id": run_id,
                    "object": "chat.completion.chunk",
                    "created": created_time,
                    "model": model,
                    "choices": [{
                        "index": 0, 
                        "delta": {"content": content_to_yield}, 
                        "finish_reason": None
                    }]
                }
                yield f"data: {json.dumps(chunk)}\n\n"

        # 3. Send [DONE]
        final_chunk = {
            "id": run_id,
            "object": "chat.completion.chunk",
            "created": created_time,
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
        }
        yield f"data: {json.dumps(final_chunk)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        openai_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )