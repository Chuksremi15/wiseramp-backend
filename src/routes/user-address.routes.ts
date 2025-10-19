import express, { Router } from "express";
import { authenticateJWT } from "../middleware/auth.js";
import {
  createUserAddress,
  getUserAddresses,
  getAddressById,
  getAddressesByChain,
  updateUserAddress,
  deleteUserAddress,
  checkUserHasAddresses,
} from "../controllers/user-address.controller.js";

const router: Router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Create a new user address
router.post("/", createUserAddress);

// Get all addresses for the authenticated user
router.get("/", getUserAddresses);

// Check if user has addresses (utility endpoint)
router.get("/check", checkUserHasAddresses);

// Get addresses by chain
router.get("/chain/:chain", getAddressesByChain);

// Get specific address by ID
router.get("/:addressId", getAddressById);

// Update a user address
router.put("/:addressId", updateUserAddress);

// Delete a user address
router.delete("/:addressId", deleteUserAddress);

export default router;
