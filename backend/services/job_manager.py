import uuid
from typing import Dict, Optional, List, Any

from settings.models import ScrapeJob, JobStatus

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, ScrapeJob] = {}
    
    def create_job(self, url: str, instructions: Optional[str] = None) -> str:
        """Create a new scraping job"""
        job_id = str(uuid.uuid4())
        job = ScrapeJob(
            job_id=job_id,
            url=url,
            status=JobStatus.PENDING,
            extraction_instructions=instructions
            )
        self.jobs[job_id] = job
        return job_id
    
    def get_job(self, job_id: str) -> Optional[ScrapeJob]:
        """Get job by ID"""
        return self.jobs.get(job_id)
    
    def update_job(self, job_id: str, **kwargs):
        """Update job fields"""
        if job_id in self.jobs:
            job = self.jobs[job_id]
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)

    def list_jobs(self, status: Optional[JobStatus] = None) -> List[ScrapeJob]:
        """List all jobs, optionally filtered by status"""
        jobs = list(self.jobs.values())
        if status:
            jobs = [j for j in jobs if j.status == status]
        return sorted(jobs, key=lambda x: x.created_at, reverse=True)