import uvicorn
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

from decouple import config

from openai import OpenAI

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, status
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from settings.models import ScrapeRequest, ScrapeJob, ApprovalRequest, StoredData, DataQueryParams
from settings.database import ClickHouseDB
from services.job_manager import JobManager, JobStatus
from services.scraper import extract_data

app = FastAPI()

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],  # or ["*"] for quick testing
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

db = ClickHouseDB()
job_manager = JobManager()

def get_db():
    return db

def get_job_manager():
    return job_manager

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {
        "message": "AI Web Scraping Agent API",
        "version": "1.0.0",
        "docs": "/docs"
        }

async def process_scrape_job(
        job_id: str,
        url: str,
        instructions: Optional[str],
        auto_approve: bool,
        jm: JobManager,
        database: ClickHouseDB
):
    """Background task to process scraping job"""
    try:
        jm.update_job(job_id, status=JobStatus.PROCESSING)

        extracted = await extract_data(url, instructions)

        jm.update_job(
            job_id=job_id,
            extract_data=extracted,
            status=JobStatus.AWAITING_APPROVAL if not auto_approve else JobStatus.COMPLETED,
            completed_at=datetime.now()
        )

        if auto_approve:
            database.insert_data(extracted)

    except Exception as e:
        jm.update_job(
            job_id=job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=datetime.now()
        )
@app.post("/scrape", response_model=dict)
async def create_scrape_job(
    request: ScrapeRequest,
    background_tasks: BackgroundTasks,
    jm: JobManager = Depends(get_job_manager),
    database: ClickHouseDB = Depends(get_db)
):
    """
    Create a new web scraping job
    
    - **url**: Target URL to scrape
    - **extraction_instructions**: Optional specific extraction guidelines
    - **auto_approve**: If true, automatically save to database without approval
    """
    job_id = jm.create_job(str(request.url), request.extraction_instructions)

    background_tasks.add_task(
        process_scrape_job,
        job_id,
        str(request.url),
        request.extraction_instructions,
        request.auto_approve,
        jm,
        database
    )

    return {
        "job_id": job_id,
        "status": "created",
        "message": "Scraping job created and processing started"
    }

@app.get("/jobs/{job_id}", response_model=ScrapeJob)
async def get_job_status(
    job_id: str,
    jm: JobManager = Depends(get_job_manager)
):
    """Get status and results of a scraping job"""
    job = jm.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/jobs", response_model=List[ScrapeJob])
async def list_jobs(
    status: Optional[JobStatus] = None,
    jm: JobManager = Depends(get_job_manager)
):
    """List all scraping jobs, optionally filtered by status"""
    return jm.list_jobs(status)

@app.post("/approved", response_model=dict)
async def approve_data(
    approval: ApprovalRequest,
    jm: JobManager = Depends(get_job_manager),
    database: ClickHouseDB = Depends(get_db)
):
    """
    Approve or reject extracted data for database insertion
    
    - **job_id**: ID of the job to approve/reject
    - **approved**: Whether to approve the data
    - **feedback**: Optional feedback for rejection
    """
    job = jm.get_job(approval.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status is not JobStatus.AWAITING_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail=f"Job is not awaiting approval (current status: {job.status})"
        )
    
    if approval.approved:
        if not job.extracted_data:
            raise HTTPException(status_code=400, detail="No extracted data to approve")
        
        data_id = database.insert_data(job.extracted_data)
        jm.update_job(approval.job_id, status=JobStatus.COMPLETED)

        return {
            "status": "approved",
            "data_id": data_id,
            "message": "Data saved to database"
        }
    
    else:
        jm.update_job(approval.job_id, status=JobStatus.FAILED, error=approval.feedback or "Rejected by user")

        return {
            "status": "rejected",
            "message": "Data not saved",
            "feedback": approval.feedback
        }
    
@app.post("/data/query", response_model=List[StoredData])
async def query_stored_data(
    params: DataQueryParams,
    database: ClickHouseDB = Depends(get_db)
):
    """
    Query stored scraped data with filters
    
    - **limit**: Number of results to return (1-100)
    - **offset**: Number of results to skip
    - **url_filter**: Filter by URL substring
    - **date_from**: Filter by date range start
    - **date_to**: Filter by date range end
    """
    return database.query_data(
        limit=params.limit,
        offset=params.offset,
        url_filter=params.url_filter,
        date_from=params.date_from,
        date_to=params.date_to
    )

@app.get("/data/{data_id}", repsonse_model=StoredData)
async def get_data_by_id(
    data_id: str,
    database: ClickHouseDB = Depends(get_db)
):
    """Get specific scraped data by ID"""
    data = database.get_by_id(data_id)
    if not data:
        raise HTTPException(status_code=404, detail="Data not found")
    return data

@app.delete("/data/{data_id}")
async def delete_data(
    data_id: str,
    database: ClickHouseDB = Depends(get_db)
):
    """Delete scraped data by ID"""
    database.delete_by_id(data_id)
    return {"status": "deleted", "data_id": data_id}

@app.get("/stats")
async def get_statistics(database: ClickHouseDB = Depends(get_db)):
    """Get database statistics"""
    return database.get_stats()

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)