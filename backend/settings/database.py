import clickhouse_connect
import json
import uuid
from typing import List, Optional
from datetime import datetime

from settings.models import ExtractedData, StoredData

class ClickHouseDB:
    def __init__(
            self,
            host: str = "localhost",
            port: int = 8123,
            database: str = "scraped_data",
            username: str = "default",
            password: str = ""
    ):
        self.client = clickhouse_connect.get_client(
            host=host,
            port=port,
            username=username,
            password=password
        )
        self.database = database
        self._ensure_database()

    def _ensure_database(self):
        """Create database and table if they don't exist"""
        self.client.command(f"CREATE DATABSE IF NOT EXISTS {self.database}")
        self.client.command(f"""
                CREATE TABLE IF NOT EXISTS {self.database}.scraped_content (
                id String,
                source_url String,
                title String,
                description String,
                metadata String,
                extracted_at DateTime,
                inserted_at DateTime DEFAULT now(),
                INDEX idx_url source_url TYPE bloom_filter GRANULARITY 1,
                INDEX idx_date extracted_at TYPE minmax GRANULARITY 3
                ) ENGINE = MergeTree()
                ORDER BY (inserted_at, source_url)
                            """)
        
    def insert_data(self, data: ExtractedData) -> str:
        """Insert extracted data and return the ID"""
        data_id = str(uuid.uuid4())

        self.client.insert(
            f"{self.database}.scraped_content",
            [[
                data_id,
                data.source_url,
                data.title or "",
                data.description or "",
                json.dumps(data.metadata),
                data.extracted_at
            ]],
            column_names=["id", "source_url", "title", "description", "metadata", "extracted_at"]
        )
        return data_id
    
    def query_data(
            self,
            limit: int = 10,
            offset: int = 0,
            url_filter: Optional[str] = None,
            date_from: Optional[datetime] = None,
            date_to: Optional[datetime] = None
    ) -> List[StoredData]:
        """Query scraped data with filters"""
        where_clauses = []

        if url_filter:
            where_clauses.append(f"source_url LIKE '%{url_filter}%'")
        if date_from:
            where_clauses.append(f"extracted_at >= '{date_from.isoformat()}'")
        if date_to:
            where_clauses.append(f"extracted_at <= '{date_to.isoformat()}'")
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        query = f"""
            SELECT id, source_url, title, description, metadata, extracted_at, inserted_at
            FROM {self.database}.scraped_content
            WHERE {where_sql}
            ORDER BY inserted_at DESC
            LIMIT {limit} OFFSET {offset}
        """

        result = self.client.query(query)

        data_list = []
        for row in result.named_results():
            data_list.append(StoredData(
                id=row["id"],
                source_url=row["source_url"],
                title=row["title"] if row["title"] else None,
                description=row["description"] if row["description"] else None,
                metadata=json.loads(row["metadata"]),
                extracted_at=row["extracted_at"],
                inserted_at=row["inserted_at"]
            ))

        return data_list
    
    def get_by_id(self, data_id: str) -> Optional[StoredData]:
        """Get specific data by ID"""
        query = f"""
            SELECT id, source_url, title, description, metadata, extracted_at, inserted_at
            FROM {self.database.scraped_content}
            WHERE id = '{data_id}'
            LIMIT 1
        """

        result = self.client.query(query)
        rows = result.named_results()

        if not rows:
            return None
        
        row = rows[0]

        return StoredData(
            id=row["id"],
            source_url=row["source_url"],
            title=row["title"] if row["title"] else None,
            description=row["description"] if row["description"] else None,
            metadata=json.loads(row["metadata"]),
            extracted_at=row["extracted_at"],
            inserted_at=row["inserted_at"]
        )
    
    def delete_by_id(self, data_id: str) -> bool:
        """Delete data by ID"""
        self.client.command(
            f"ALTER TABLE {self.database}.scraped_content DELETE WHERE id = '{data_id}'"
        )
        return True
    
    def get_stats(self) -> dict:
        """Get database statistics"""
        total = self.client.query("SELECT count() as count FROM {sedlf.database}.scraped_content").first_row[0]

        recent = self.client.query(f"""
                                   SELECT count() as count FROM {self.database}.scraped_content
                                   WHERE inserted_at >= now() - INTERVAL 24 HOUR
                                   """).first_row[0]
        
        return {
            "total_records": total,
            "records_last_24h": recent
        }