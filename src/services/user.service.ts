import { eq } from "drizzle-orm";
import { getDatabase } from "../db/connection.js";
import { users, type User, type NewUser } from "../db/schema.js";

export class PostgresUserService {
  /**
   * Find a user by userId (which maps to the id field in PostgreSQL)
   */
  async findByUserId(userId: number): Promise<User | null> {
    try {
      const db = getDatabase();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error("[USER_SERVICE] Error finding user by userId:", error);
      throw error;
    }
  }

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const db = getDatabase();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error("[USER_SERVICE] Error finding user by email:", error);
      throw error;
    }
  }

  /**
   * Create a new user
   */
  async create(userData: NewUser): Promise<User> {
    try {
      const db = getDatabase();
      const result = await db.insert(users).values(userData).returning();

      return result[0];
    } catch (error) {
      console.error("[USER_SERVICE] Error creating user:", error);
      throw error;
    }
  }

  /**
   * Update user fields
   */
  async update(userId: number, updates: Partial<User>): Promise<User | null> {
    try {
      const db = getDatabase();
      const result = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning();

      return result[0] || null;
    } catch (error) {
      console.error("[USER_SERVICE] Error updating user:", error);
      throw error;
    }
  }
}
