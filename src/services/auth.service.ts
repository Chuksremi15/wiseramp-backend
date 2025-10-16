import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDatabase } from "../db/connection.js";
import { users, User, NewUser } from "../db/schema.js";
import { PostgresUserService } from "./user.service.js";

export class AuthService {
  private userService: PostgresUserService;
  private saltRounds = 10;

  constructor(userService?: PostgresUserService) {
    this.userService = userService || new PostgresUserService();
  }

  /**
   * Find user by email with normalized email
   */
  async findByEmailNormalized(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();
    return this.userService.findByEmail(normalizedEmail);
  }

  /**
   * Check if user exists by email or phone
   */
  async findByEmailOrPhone(email: string, phone: string): Promise<User | null> {
    try {
      const db = getDatabase();
      const normalizedEmail = email.toLowerCase();
      const result = await db
        .select()
        .from(users)
        .where(or(eq(users.email, normalizedEmail), eq(users.phone, phone)))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error(
        "[AUTH_SERVICE] Error finding user by email or phone:",
        error
      );
      throw error;
    }
  }

  /**
   * Hash password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Create user with hashed password
   */
  async createUser(
    userData: Omit<NewUser, "password"> & { password: string }
  ): Promise<User> {
    const hashedPassword = await this.hashPassword(userData.password);
    const userToCreate: NewUser = {
      ...userData,
      email: userData.email.toLowerCase(),
      password: hashedPassword,
    };

    return this.userService.create(userToCreate);
  }

  /**
   * Format user response (excluding password)
   */
  formatUserResponse(user: User) {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
    };
  }
}
