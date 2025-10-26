import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDatabase } from "../db/connection.js";
import { users } from "../db/schema.js";
import { PostgresUserService } from "./user.service.js";
export class AuthService {
    userService;
    saltRounds = 10;
    constructor(userService) {
        this.userService = userService || new PostgresUserService();
    }
    /**
     * Find user by email with normalized email
     */
    async findByEmailNormalized(email) {
        const normalizedEmail = email.toLowerCase();
        return this.userService.findByEmail(normalizedEmail);
    }
    /**
     * Check if user exists by email or phone
     */
    async findByEmailOrPhone(email, phone) {
        try {
            const db = getDatabase();
            const normalizedEmail = email.toLowerCase();
            const result = await db
                .select()
                .from(users)
                .where(or(eq(users.email, normalizedEmail), eq(users.phone, phone)))
                .limit(1);
            return result[0] || null;
        }
        catch (error) {
            console.error("[AUTH_SERVICE] Error finding user by email or phone:", error);
            throw error;
        }
    }
    /**
     * Hash password
     */
    async hashPassword(password) {
        return bcrypt.hash(password, this.saltRounds);
    }
    /**
     * Compare password with hash
     */
    async comparePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }
    /**
     * Create user with hashed password
     */
    async createUser(userData) {
        const hashedPassword = await this.hashPassword(userData.password);
        const userToCreate = {
            ...userData,
            email: userData.email.toLowerCase(),
            password: hashedPassword,
        };
        return this.userService.create(userToCreate);
    }
    /**
     * Format user response (excluding password)
     */
    formatUserResponse(user) {
        return {
            id: user.id,
            name: user.name,
            phone: user.phone,
            email: user.email,
            avatar: user.avatar,
        };
    }
}
