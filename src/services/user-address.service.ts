import { eq, and } from "drizzle-orm";
import { getDatabase } from "../db/connection.js";
import { UserAddress, users } from "../db/schema.js";

export type UserAddressData = typeof UserAddress.$inferSelect;
export type NewUserAddressData = typeof UserAddress.$inferInsert;

export class UserAddressService {
  /**
   * Create a new user address
   */
  static async createUserAddress(data: {
    userId: number;
    chain?: string;
    addressName?: string;
    userAddress?: string;
  }): Promise<UserAddressData> {
    try {
      const db = getDatabase();
      // Check if user exists
      const user = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, data.userId))
        .limit(1);

      if (!user.length) {
        throw new Error("User not found");
      }

      const [newAddress] = await db
        .insert(UserAddress)
        .values({
          userId: data.userId,
          chain: data.chain,
          addressName: data.addressName,
          userAddress: data.userAddress,
        })
        .returning();

      return newAddress;
    } catch (error) {
      console.error("Error creating user address:", error);
      throw error;
    }
  }

  /**
   * Get all addresses for a user
   */
  static async getUserAddresses(userId: number): Promise<UserAddressData[]> {
    try {
      const db = getDatabase();
      const addresses = await db
        .select()
        .from(UserAddress)
        .where(eq(UserAddress.userId, userId));

      return addresses;
    } catch (error) {
      console.error("Error getting user addresses:", error);
      throw new Error("Failed to get user addresses");
    }
  }

  /**
   * Get a specific address by ID
   */
  static async getAddressById(
    addressId: string,
    userId?: number
  ): Promise<UserAddressData | null> {
    try {
      const db = getDatabase();
      const conditions = [eq(UserAddress.id, addressId)];
      if (userId) {
        conditions.push(eq(UserAddress.userId, userId));
      }

      const [address] = await db
        .select()
        .from(UserAddress)
        .where(and(...conditions))
        .limit(1);

      return address || null;
    } catch (error) {
      console.error("Error getting address by ID:", error);
      throw new Error("Failed to get address");
    }
  }

  /**
   * Get addresses by chain
   */
  static async getAddressesByChain(
    chain: string,
    userId?: number
  ): Promise<UserAddressData[]> {
    try {
      const db = getDatabase();
      const conditions = [eq(UserAddress.chain, chain)];
      if (userId) {
        conditions.push(eq(UserAddress.userId, userId));
      }

      const addresses = await db
        .select()
        .from(UserAddress)
        .where(and(...conditions));

      return addresses;
    } catch (error) {
      console.error("Error getting addresses by chain:", error);
      throw new Error("Failed to get addresses by chain");
    }
  }

  /**
   * Update a user address
   */
  static async updateUserAddress(
    addressId: string,
    userId: number,
    updates: {
      chain?: string;
      addressName?: string;
      userAddress?: string;
    }
  ): Promise<UserAddressData | null> {
    try {
      // Verify ownership
      const existingAddress = await this.getAddressById(addressId, userId);
      if (!existingAddress) {
        throw new Error("Address not found or access denied");
      }

      const db = getDatabase();
      const [updatedAddress] = await db
        .update(UserAddress)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(
          and(eq(UserAddress.id, addressId), eq(UserAddress.userId, userId))
        )
        .returning();

      return updatedAddress || null;
    } catch (error) {
      console.error("Error updating user address:", error);
      throw error;
    }
  }

  /**
   * Delete a user address
   */
  static async deleteUserAddress(
    addressId: string,
    userId: number
  ): Promise<boolean> {
    try {
      const db = getDatabase();
      const result = await db
        .delete(UserAddress)
        .where(
          and(eq(UserAddress.id, addressId), eq(UserAddress.userId, userId))
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Error deleting user address:", error);
      throw new Error("Failed to delete user address");
    }
  }

  /**
   * Check if user has any addresses
   */
  static async userHasAddresses(userId: number): Promise<boolean> {
    try {
      const db = getDatabase();
      const [address] = await db
        .select({ id: UserAddress.id })
        .from(UserAddress)
        .where(eq(UserAddress.userId, userId))
        .limit(1);

      return !!address;
    } catch (error) {
      console.error("Error checking user addresses:", error);
      return false;
    }
  }

  /**
   * Get address count for user
   */
  static async getUserAddressCount(userId: number): Promise<number> {
    try {
      const db = getDatabase();
      const addresses = await db
        .select({ id: UserAddress.id })
        .from(UserAddress)
        .where(eq(UserAddress.userId, userId));

      return addresses.length;
    } catch (error) {
      console.error("Error getting user address count:", error);
      return 0;
    }
  }
}
