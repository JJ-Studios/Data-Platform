import logfire
import json
import os

from typing import AsyncGenerator, Dict, Any, List, Optional
from pydantic_ai import (
    Agent,
    ModelMessage,
    ModelMessagesTypeAdapter,
    ModelRequest,
    ModelResponse,
    TextPart,
    UnexpectedModelBehavior,
    UserPromptPart,
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    RunContext,
    TextPartDelta,
    ThinkingPartDelta,
    ToolCallPartDelta,
)
from pydantic_ai.mcp import MCPServerStreamableHTTP
from pydantic_ai.models.openai import OpenAIChatModel

from dotenv import load_dotenv
from datetime import datetime, timezone


load_dotenv()

logfire.configure()
logfire.instrument_pydantic_ai()

provider = os.getenv("LLM_PROVIDER")
model = os.getenv("MODEL")

server = MCPServerStreamableHTTP('http://localhost:8001/mcp')

agent = Agent(
    model=f'{provider}:{model}',
    toolsets=[server]
    )

class ChatInteraction():
    def __init__(self):
        self.message_history = {}

    def user_check(self, user_id: str, create_user: bool = False):
        if user_id not in self.message_history:
            if create_user:
                self.message_history[user_id] = []
            return False
        return True
    
    def convert_openai_messages(self, messages: List[Dict[str, str]]) -> List[Any]:
        """
        Converts OpenAI format [{"role": "user", "content": "..."}] 
        to PydanticAI format [ModelRequest(...), ModelResponse(...)]
        """
        pydantic_messages = []
        
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content", "")
            
            if role == "user":
                pydantic_messages.append(
                    ModelRequest(parts=[UserPromptPart(content=content)])
                )
            elif role == "assistant":
                pydantic_messages.append(
                    ModelResponse(parts=[TextPart(content=content)])
                )
            # Note: System messages are typically handled by the Agent config, 
            # but simple text history conversion suffices for most chat contexts.
            
        return pydantic_messages

    async def send_message(
        self, 
        user_id: str, 
        message: str, 
        history: Optional[List[Any]] = None
    ):
        # Determine which history to use
        if history is not None:
            # Stateless mode: use provided history (from OpenAI router)
            message_history = history
        else:
            # Stateful mode: load from internal memory
            self.user_check(user_id=user_id, create_user=True)
            message_history = self.message_history[user_id]

        response = await agent.run(user_prompt=message, message_history=message_history)
        
        # Only save state if we are in stateful mode
        if history is None:
            self.message_history[user_id] = response.all_messages()
        
        return response.output
    
    async def stream_message(
        self, 
        user_id: str, 
        message: str,
        include_events: bool = True,
        history: Optional[List[Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream message responses with detailed event information.
        
        Args:
            user_id: User identifier
            message: User's message
            include_events: Whether to include tool call events (default: True)
            
        Yields:
            Dict with event information:
            - type: Event type (text, thinking, tool_call, tool_result, final)
            - content: Event content
            - metadata: Additional event data
        """
        if history is not None:
            message_history = history
        else:
            self.user_check(user_id=user_id, create_user=True)
            message_history = self.message_history[user_id]
        
        async with agent.iter(
            user_prompt=message,
            message_history=message_history
        ) as run:
            async for node in run:
                if Agent.is_user_prompt_node(node):
                    if include_events:
                        yield {
                            "type": "user_prompt",
                            "content": node.user_prompt,
                            "metadata": {}
                        }
                
                elif Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        final_result_found = False
                        
                        async for event in request_stream:
                            if isinstance(event, PartStartEvent):
                                if include_events:
                                    yield {
                                        "type": "part_start",
                                        "content": str(event.part),
                                        "metadata": {"index": event.index}
                                    }
                            
                            elif isinstance(event, PartDeltaEvent):
                                if isinstance(event.delta, TextPartDelta):
                                    yield {
                                        "type": "text",
                                        "content": event.delta.content_delta,
                                        "metadata": {"index": event.index}
                                    }
                                elif isinstance(event.delta, ThinkingPartDelta):
                                    yield {
                                        "type": "thinking",
                                        "content": event.delta.content_delta,
                                        "metadata": {"index": event.index}
                                    }
                                elif isinstance(event.delta, ToolCallPartDelta):
                                    if include_events:
                                        yield {
                                            "type": "tool_call_delta",
                                            "content": event.delta.args_delta,
                                            "metadata": {"index": event.index}
                                        }
                            
                            elif isinstance(event, FinalResultEvent):
                                final_result_found = True
                                if include_events:
                                    yield {
                                        "type": "final_result_start",
                                        "content": "",
                                        "metadata": {"tool_name": event.tool_name}
                                    }
                                break
                        
                        # Stream the final text output
                        if final_result_found:
                            previous_text = ""
                            async for output in request_stream.stream_text():
                                if output.startswith(previous_text):
                                    delta = output[len(previous_text):]
                                    if delta:
                                        yield {
                                            "type": "text",
                                            "content": delta,
                                            "metadata": {}
                                        }
                                    previous_text = output
                                else:
                                    yield {
                                        "type": "text",
                                        "content": output,
                                        "metadata": {}
                                    }
                
                elif Agent.is_call_tools_node(node):
                    if include_events:
                        async with node.stream(run.ctx) as handle_stream:
                            async for event in handle_stream:
                                if isinstance(event, FunctionToolCallEvent):
                                    yield {
                                        "type": "tool_call",
                                        "content": f"Calling {event.part.tool_name}",
                                        "metadata": {
                                            "tool_name": event.part.tool_name,
                                            "args": event.part.args,
                                            "tool_call_id": event.part.tool_call_id
                                        }
                                    }
                                elif isinstance(event, FunctionToolResultEvent):
                                    yield {
                                        "type": "tool_result",
                                        "content": str(event.result.content),
                                        "metadata": {"tool_call_id": event.tool_call_id}
                                    }
                
                elif Agent.is_end_node(node):
                    # Update message history only if running in stateful mode
                    if run.result:
                        if history is None:
                            self.message_history[user_id] = run.result.all_messages()
                        
                        yield {
                            "type": "final",
                            "content": run.result.output,
                            "metadata": {"complete": True}
                        }

    async def stream_text_only(
        self, 
        user_id: str, 
        message: str
    ) -> AsyncGenerator[str, None]:
        """
        Stream only text content (simplified version).
        
        Args:
            user_id: User identifier
            message: User's message
            
        Yields:
            Text chunks as strings
        """
        self.user_check(user_id=user_id, create_user=True)
        
        async with agent.iter(
            user_prompt=message,
            message_history=self.message_history[user_id]
        ) as run:
            async for node in run:
                if Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        final_result_found = False
                        
                        async for event in request_stream:
                            if isinstance(event, PartDeltaEvent):
                                if isinstance(event.delta, TextPartDelta):
                                    yield event.delta.content_delta
                            elif isinstance(event, FinalResultEvent):
                                final_result_found = True
                                break
                        
                        if final_result_found:
                            previous_text = ""
                            async for output in request_stream.stream_text():
                                # Only yield the new portion (delta)
                                if output.startswith(previous_text):
                                    delta = output[len(previous_text):]
                                    if delta:
                                        yield delta
                                    previous_text = output
                                else:
                                    # Fallback: yield full output if not cumulative
                                    yield output
                
                elif Agent.is_end_node(node):
                    if run.result:
                        self.message_history[user_id] = run.result.all_messages()
    
    def get_chat_history(self, user_id: str):
        active_user = self.user_check(user_id)
        if active_user:
            return self.message_history[user_id]
        return []