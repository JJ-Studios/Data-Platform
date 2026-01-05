from pydantic_ai.mcp import MCPServerStreamableHTTP

ch_mcp_server = MCPServerStreamableHTTP('http://localhost:8001/mcp')
run_python_server = MCPServerStreamableHTTP('http://localhost:8002/mcp')
brave_search_server = MCPServerStreamableHTTP('http://localhost:8003/mcp')