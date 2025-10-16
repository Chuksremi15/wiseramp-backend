import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
  ssl?: boolean | "require";
  prepare?: boolean;
}

export interface ConnectionHealth {
  isConnected: boolean;
  lastCheck: Date;
  error?: string;
}

/**
 * Database connection manager for PostgreSQL with Drizzle ORM
 * Provides connection pooling, health checks, and graceful shutdown
 */
export class DatabaseManager {
  private client: postgres.Sql | null = null;
  private database: ReturnType<typeof drizzle> | null = null;
  private config: DatabaseConfig;
  private healthStatus: ConnectionHealth = {
    isConnected: false,
    lastCheck: new Date(),
  };

  constructor(config: DatabaseConfig) {
    this.config = {
      maxConnections: 20,
      idleTimeout: 20,
      connectTimeout: 30,
      ssl: false,
      prepare: false,
      ...config,
    };
  }

  /**
   * Initialize database connection
   */
  async connect(): Promise<ReturnType<typeof drizzle>> {
    try {
      if (this.database && this.healthStatus.isConnected) {
        return this.database;
      }

      console.log("🔌 Connecting to PostgreSQL database...");

      this.client = postgres(this.config.connectionString, {
        max: this.config.maxConnections,
        idle_timeout: this.config.idleTimeout,
        connect_timeout: this.config.connectTimeout,
        ssl: this.config.ssl,
        prepare: this.config.prepare,
      });

      this.database = drizzle(this.client, { schema });

      // Test connection
      await this.healthCheck();

      if (!this.healthStatus.isConnected) {
        throw new Error("Failed to establish database connection");
      }

      console.log("✅ PostgreSQL database connected successfully");
      return this.database;
    } catch (error) {
      console.error("❌ Failed to connect to PostgreSQL:", error);
      this.healthStatus = {
        isConnected: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDatabase(): ReturnType<typeof drizzle> {
    if (!this.database || !this.healthStatus.isConnected) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.database;
  }

  /**
   * Get raw client instance
   */
  getClient(): postgres.Sql {
    if (!this.client || !this.healthStatus.isConnected) {
      throw new Error("Database client not available. Call connect() first.");
    }
    return this.client;
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<ConnectionHealth> {
    try {
      if (!this.client) {
        throw new Error("Database client not initialized");
      }

      await this.client`SELECT 1`;

      this.healthStatus = {
        isConnected: true,
        lastCheck: new Date(),
      };
    } catch (error) {
      console.error("Database health check failed:", error);
      this.healthStatus = {
        isConnected: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    return this.healthStatus;
  }

  /**
   * Get current health status
   */
  getHealthStatus(): ConnectionHealth {
    return { ...this.healthStatus };
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.end();
        console.log("📦 PostgreSQL connection closed");
      }
    } catch (error) {
      console.error("Error closing PostgreSQL connection:", error);
    } finally {
      this.client = null;
      this.database = null;
      this.healthStatus = {
        isConnected: false,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Closing database connection...`);
      await this.disconnect();
      process.exit(0);
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async executeTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const db = this.getDatabase();

    return await db.transaction(async (tx) => {
      return await callback(tx);
    });
  }
}

// Create default database manager instance with lazy configuration
let dbManager: DatabaseManager | null = null;

function getDbManager(): DatabaseManager {
  if (!dbManager) {
    const defaultConfig: DatabaseConfig = {
      connectionString:
        process.env.POSTGRES_URL ||
        "postgresql://localhost:5432/cash_my_crypto",
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "20"),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || "20"),
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || "30"),
      ssl: process.env.POSTGRES_URL?.includes("sslmode=require")
        ? "require"
        : false,
      prepare: false,
    };

    dbManager = new DatabaseManager(defaultConfig);
    dbManager.setupGracefulShutdown();
  }
  return dbManager;
}

export { getDbManager as dbManager };

/**
 * Initialize database connection with default configuration
 */
export async function initializeDatabase(): Promise<
  ReturnType<typeof drizzle>
> {
  return await getDbManager().connect();
}

/**
 * Get database instance (shorthand)
 */
export function getDatabase(): ReturnType<typeof drizzle> {
  return getDbManager().getDatabase();
}

/**
 * Close database connection (shorthand)
 */
export async function closeDatabase(): Promise<void> {
  return await getDbManager().disconnect();
}
