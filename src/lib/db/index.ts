import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __imapMcpPool: Pool | undefined;
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!global.__imapMcpPool) {
    global.__imapMcpPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }
  return global.__imapMcpPool;
}

export const db = drizzle(getPool(), { schema });
export { schema };
