import express from "express";
import { authenticateJWT } from "../middleware/auth.js";
import { createFiatToCryptoTransaction, createCryptoToFiatTransaction, getTransactionById, getUserTransactions, } from "../controllers/transaction.controller.js";
const router = express.Router();
// Routes
router.post("/fiat-to-crypto", authenticateJWT, createFiatToCryptoTransaction);
router.post("/crypto-to-fiat", authenticateJWT, createCryptoToFiatTransaction);
// router.post(
//   "/crypto-to-crypto",
//   authenticateJWT,
//   createCryptoToCryptoTransaction
// );
router.get("/user", authenticateJWT, getUserTransactions);
router.get("/:transactionId", authenticateJWT, getTransactionById);
export default router;
