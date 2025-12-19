from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from services.data_operations.query_service import QueryService

query_service_router = APIRouter(prefix="/api/lab", tags=["Lab"])
query_service = QueryService()

class QueryRequest(BaseModel):
    query: str

@query_service_router.post("/execute")
async def execute_query(request: QueryRequest):
    try:
        result = query_service.execute_query(request.query)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal Server Error")