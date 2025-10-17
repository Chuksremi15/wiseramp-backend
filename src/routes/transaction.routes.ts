import express, { Router } from "express";
import { authenticateJWT } from "../middleware/auth.js";
import { TransactionController } from "../controllers/transaction.controller.js";

const router: Router = express.Router();

// Routes
router.post("/fiat-to-crypto", authenticateJWT, (req, res) =>
  TransactionController.createFiatToCryptoTransaction(req, res)
);

router.post("/crypto-to-fiat", authenticateJWT, (req, res) =>
  TransactionController.createCryptoToFiatTransaction(req, res)
);

router.post("/crypto-to-crypto", authenticateJWT, (req, res) =>
  TransactionController.createCryptoToCryptoTransaction(req, res)
);

router.get("/user", authenticateJWT, (req, res) =>
  TransactionController.getUserTransactions(req, res)
);

router.get("/:transactionId", authenticateJWT, (req, res) =>
  TransactionController.getTransactionById(req, res)
);

export default router;
