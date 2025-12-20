from settings.database_connection import ClickhouseConnection
from typing import List, Dict, Any

class QueryService:
    def __init__(self):
        self.c = ClickhouseConnection()

    def execute_query(self, sql: str) -> Dict[str, Any]:
        """
        Executes arbitrary SQL.
        WARNING: In a real app, you need strict permissions here (Read-Only user).
        """
        try:
            result = self.c.client.query(sql)
            
            # Map columns and data
            columns = result.column_names
            data = []
            for row in result.result_rows:
                data.append(dict(zip(columns, row)))
                
            return {
                "columns": columns,
                "rows": data,
                "row_count": len(data)
            }
        except Exception as e:
            # Return the error message clearly so the UI can show it
            raise ValueError(str(e))