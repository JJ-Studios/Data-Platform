import clickhouse_connect

class ClickhouseConnection(object):
    def __init__(self):
        self._host = ""
        self._port = ""
        self._username = ""
        self._password = ""
        self._database = ""
        self._verify = False

        try:
            self._client = clickhouse_connect.get_client(
                host=self._host,
                port=self._port,
                username=self._username,
                password=self._password,
                databse=self._database,
                verify=False
            )
        except Exception as e:
            raise e
        
    @property 
    def client(self):
        return self._client