export type DatabaseEngine =
  | "MySql"
  | "PostgreSql"
  | "MongoDb"
  | "Redis"
  | "SqlServer"
  | "Oracle";

const engines: Record<string, DatabaseEngine> = {
  mysql: "MySql",
  mariadb: "MySql",
  postgres: "PostgreSql",
  postgresql: "PostgreSql",
  mongodb: "MongoDb",
  mongo: "MongoDb",
  redis: "Redis",
  sqlserver: "SqlServer",
  mssql: "SqlServer",
  microsoftsqlserver: "SqlServer",
  oracle: "Oracle",
};

export const databaseEngineLabels: Record<DatabaseEngine, string> = {
  MySql: "MySQL/MariaDB",
  PostgreSql: "PostgreSQL",
  MongoDb: "MongoDB",
  Redis: "Redis",
  SqlServer: "SQL Server",
  Oracle: "Oracle",
};

/** Riconosce il motore dal nome del tipo applicazione configurabile. */
export function databaseEngine(type: string): DatabaseEngine | null {
  const key = type.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  return engines[key] ?? null;
}

export function queryPlaceholder(engine: DatabaseEngine): string {
  switch (engine) {
    case "MongoDb":
      return '{\n  "collection": "users",\n  "filter": {},\n  "limit": 20\n}';
    case "Redis":
      return "SCAN 0 COUNT 20";
    case "SqlServer":
      return "SELECT TOP 20 name FROM sys.tables";
    case "Oracle":
      return "SELECT table_name FROM user_tables FETCH FIRST 20 ROWS ONLY";
    case "PostgreSql":
      return "SELECT * FROM pg_catalog.pg_tables LIMIT 20";
    default:
      return "SELECT * FROM information_schema.tables LIMIT 20";
  }
}
