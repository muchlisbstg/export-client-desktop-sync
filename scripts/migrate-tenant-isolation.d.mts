import type Database from "better-sqlite3";
export function migrateTenantIsolation(db: Database.Database): {
  applied: boolean;
  legacyRowsRemainUnassigned: boolean;
};
