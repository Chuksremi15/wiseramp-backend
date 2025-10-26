import { UserAddressService } from "../services/user-address.service.js";
import { BaseController } from "./base.controller.js";
export class UserAddressController extends BaseController {
    constructor() {
        super();
    }
    /**
     * Create a new user address
     */
    createUserAddress = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const { chain, addressName, userAddress } = req.body;
        // Validate required fields
        const validationError = this.validateRequiredFields(req.body, [
            "chain",
            "addressName",
            "userAddress",
        ]);
        if (validationError) {
            return this.sendError(res, validationError);
        }
        try {
            const data = await UserAddressService.createUserAddress({
                userId,
                chain: chain?.trim(),
                addressName: addressName?.trim(),
                userAddress: userAddress?.trim(),
            });
            return this.sendSuccess(res, { data }, "User address created successfully", 201);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes("not found")) {
                return this.sendError(res, error.message, 404);
            }
            throw error;
        }
    });
    /**
     * Get all addresses for the authenticated user
     */
    getUserAddresses = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const addresses = await UserAddressService.getUserAddresses(userId);
        return this.sendSuccess(res, {
            data: addresses,
            total: addresses.length,
        });
    });
    /**
     * Get a specific address by ID
     */
    getAddressById = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const { addressId } = req.params;
        if (!addressId) {
            return this.sendError(res, "Address ID is required");
        }
        const address = await UserAddressService.getAddressById(addressId, userId);
        if (!address) {
            return this.sendError(res, "Address not found", 404);
        }
        return this.sendSuccess(res, { data: address });
    });
    /**
     * Get addresses by chain
     */
    getAddressesByChain = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const { chain } = req.params;
        if (!chain) {
            return this.sendError(res, "Chain is required");
        }
        const addresses = await UserAddressService.getAddressesByChain(chain, userId);
        return this.sendSuccess(res, {
            data: addresses,
            total: addresses.length,
        });
    });
    /**
     * Update a user address
     */
    updateUserAddress = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const { addressId } = req.params;
        const { chain, addressName, userAddress } = req.body;
        if (!addressId) {
            return this.sendError(res, "Address ID is required");
        }
        // Prepare updates object
        const updates = {};
        if (chain !== undefined)
            updates.chain = chain.trim();
        if (addressName !== undefined)
            updates.addressName = addressName.trim();
        if (userAddress !== undefined)
            updates.userAddress = userAddress.trim();
        // Check if there are any updates
        if (Object.keys(updates).length === 0) {
            return this.sendError(res, "No valid fields to update");
        }
        try {
            const updatedAddress = await UserAddressService.updateUserAddress(addressId, userId, updates);
            if (!updatedAddress) {
                return this.sendError(res, "Address not found or access denied", 404);
            }
            return this.sendSuccess(res, { data: updatedAddress }, "Address updated successfully");
        }
        catch (error) {
            if (error instanceof Error &&
                (error.message.includes("not found") ||
                    error.message.includes("access denied"))) {
                return this.sendError(res, error.message, 404);
            }
            throw error;
        }
    });
    /**
     * Delete a user address
     */
    deleteUserAddress = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const { addressId } = req.params;
        if (!addressId) {
            return this.sendError(res, "Address ID is required");
        }
        const deleted = await UserAddressService.deleteUserAddress(addressId, userId);
        if (!deleted) {
            return this.sendError(res, "Address not found or access denied", 404);
        }
        return this.sendSuccess(res, {}, "Address deleted successfully");
    });
    /**
     * Check if user has addresses
     */
    checkUserHasAddresses = this.asyncHandler(async (req, res) => {
        if (!req.user) {
            return this.sendError(res, "User not authenticated", 401);
        }
        const { id: userId } = req.user;
        const hasAddresses = await UserAddressService.userHasAddresses(userId);
        const addressCount = await UserAddressService.getUserAddressCount(userId);
        return this.sendSuccess(res, {
            data: { hasAddresses, addressCount },
        });
    });
}
// Export controller instance methods for backward compatibility
const userAddressController = new UserAddressController();
export const { createUserAddress, getUserAddresses, getAddressById, getAddressesByChain, updateUserAddress, deleteUserAddress, checkUserHasAddresses, } = userAddressController;
