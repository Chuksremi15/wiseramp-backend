import express, { Router } from "express";
import { authenticateJWT } from "../middleware/auth.js";
import {
  createBankAccount,
  getUserBankAccounts,
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
  getBankAccountByNumber,
  checkUserHasBankAccounts,
} from "../controllers/bank-account.controller.js";

const router: Router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Create a new bank account
router.post("/", createBankAccount);

// Get all bank accounts for the authenticated user
router.get("/", getUserBankAccounts);

// Check if user has bank accounts (utility endpoint)
router.get("/check", checkUserHasBankAccounts);

// Get bank account by account number
router.get("/number/:accountNumber", getBankAccountByNumber);

// Get specific bank account by ID
router.get("/:accountId", getBankAccountById);

// Update a bank account
router.put("/:accountId", updateBankAccount);

// Delete a bank account
router.delete("/:accountId", deleteBankAccount);

export default router;
