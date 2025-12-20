from pydantic import BaseModel, HttpUrl, Field
from typing import Optional, List, Any
from enum import Enum
from datetime import datetime

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    AWAITING_APPROVAL = "awaiting_approval"

class ScrapeRequest(BaseModel):
    url: HttpUrl
    extraction_instructions: Optional[str] = Field(
        None,
        description="Specific instructions for data extraction"
    )
    auto_approve: bool = Field(
        False,
        description="Automatically approve and save to databse"
    )

class ExtractedData(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    extracted_at: datetime = Field(default_factory=datetime.now)
    source_url: str

class ScrapeJob(BaseModel):
    job_id: str
    url: str
    status: JobStatus
    extraction_instructions: Optional[str] = None
    extracted_data: Optional[ExtractedData] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

class ApprovalRequest(BaseModel):
    job_id: str
    approved: bool
    feedback: Optional[str] = None

class DataQueryParams(BaseModel):
    limit: int = Field(10, ge=1, le=100)
    offset: int = Field(0, ge=0)
    url_filter: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None

class StoredData(BaseModel):
    id: str
    source_url: str
    title: Optional[str]
    description: Optional[str]
    metadata: dict[str, Any]
    extracted_at: datetime
    inserted_at: datetime