import clickhouse_connect

class ClickhouseConnection(object):
    def __init__(
            self,
            host: str = "localhost",
            port: int = 18123,
            # database: str = "scraped_data",
            username: str = "default",
            password: str = "password",
            verify: bool = False):

        try:
            self._client = clickhouse_connect.get_client(
                host=host,
                port=port,
                username=username,
                password=password,
                # database=database,
                verify=verify
            )
        except Exception as e:
            raise e
        
    @property 
    def client(self):
        return self._client