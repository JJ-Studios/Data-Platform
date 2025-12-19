from settings.database_connection import ClickhouseConnection
from typing import List, Dict, Any

class CatalogService():
    def __init__(self):
        self.c = ClickhouseConnection()

    def list_all_tables(self) -> List[Dict[str, Any]]:
        """
        Queries ClickHouse system tables to get a list of all existing tables,
        their row counts, and modification times.
        """
        query = """
        SELECT 
            name, 
            total_rows, 
            comment, 
            metadata_modification_time
        FROM system.tables 
        WHERE database = currentDatabase()
        AND name NOT LIKE '.inner%' 
        ORDER BY name
        """
        result = self.c.client.query(query)
        
        tables = []
        for row in result.result_rows:
            # Map ClickHouse system cols to our internal dict
            tables.append({
                "id": row[0],
                "name": row[0], # Using ID as name for now, or humanize it if needed
                "rowCount": row[1] or 0,
                "description": row[2] or "No description",
                "lastUpdated": row[3]
            })
        return tables

    def get_table_schema(self, table_id: str) -> List[Dict[str, Any]]:
        """
        Runs 'DESCRIBE {table}' to get column info.
        """
        # SECURITY NOTE: Validate table_id to prevent injection if exposing publicly
        # ClickHouse params don't work for identifiers, so we use f-string with strict check
        self._validate_table_exists(table_id)
        
        query = f"DESCRIBE TABLE {table_id}"
        result = self.c.client.query(query)
        
        schema = []
        for row in result.result_rows:
            # row structure: name, type, default_type, default_expression, comment, codec_expression, ttl_expression
            schema.append({
                "name": row[0],
                "type": row[1],
                "nullable": "Nullable" in row[1], # Simple check for ClickHouse Nullable type
                "description": row[4] or ""
            })
        return schema

    def get_table_data(self, table_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Selects raw rows from the table.
        """
        self._validate_table_exists(table_id)
        
        # 1. Get raw data
        query = f"SELECT * FROM {table_id} LIMIT {limit}"
        result = self.c.client.query(query)
        
        # 2. Get column names to map the result to a list of dicts
        columns = result.column_names
        
        data = []
        for row in result.result_rows:
            row_dict = dict(zip(columns, row))
            data.append(row_dict)
            
        return data

    def _validate_table_exists(self, table_id: str):
        """Helper to ensure table exists and sanitize input"""
        exists_query = "EXISTS TABLE {table:Identifier}"
        result = self.c.client.query(exists_query, parameters={'table': table_id})
        if result.result_rows[0][0] == 0:
            raise ValueError(f"Table '{table_id}' does not exist")
