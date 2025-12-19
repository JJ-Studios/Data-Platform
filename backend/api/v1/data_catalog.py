from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

# Import the service
from services.data_operations.catalog_service import CatalogService

catalog_service_router = APIRouter(prefix="/api/catalog", tags=["Catalog"])
catalog_service = CatalogService()

# --- Pydantic Models (Contract with Frontend) ---

class TableMeta(BaseModel):
    id: str
    name: str
    rowCount: int
    description: Optional[str] = None
    lastUpdated: Optional[datetime] = None

class ColumnDef(BaseModel):
    name: str
    type: str
    nullable: bool
    description: Optional[str] = None

# --- Endpoints ---

@catalog_service_router.get("/tables", response_model=List[TableMeta])
async def get_tables():
    """
    Returns list of tables for the Sidebar.
    """
    try:
        tables = catalog_service.list_all_tables()
        return tables
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@catalog_service_router.get("/schema", response_model=List[ColumnDef])
async def get_schema(table_id: str):
    """
    Returns column definitions for the Schema Tab.
    """
    try:
        schema = catalog_service.get_table_schema(table_id)
        return schema
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@catalog_service_router.get("/data")
async def get_data(table_id: str, limit: int = 100):
    """
    Returns actual rows for the Data Grid.
    Returns List[Dict] (JSON objects).
    """
    try:
        data = catalog_service.get_table_data(table_id, limit)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))