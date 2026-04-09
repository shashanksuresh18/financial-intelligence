export interface DatabaseClient {
  kind: "stub";
  query<T = unknown>(statement: string): Promise<T[]>;
}

export const db: DatabaseClient = {
  kind: "stub",
  async query<T = unknown>(_statement: string): Promise<T[]> {
    return [];
  },
};

export default db;
