import express from "express";
import { MonifyController } from "../controllers/monify.controller.js";
const router = express.Router();
const monifyController = new MonifyController();
// POST /api/monify/reserve-account - Create a reserve account
router.post("/reserve-account", 
//   authenticateJWT,
async (req, res) => {
    await monifyController.createReserveAccount(req, res);
});
// POST /api/monify/confirm-transfer - Confirm Transfer to reserve account
router.post("/confirm-transfer", 
//   authenticateJWT,
async (req, res) => {
    await monifyController.confirmTransfer(req, res);
});
// POST /api/monify/webhook - Handle payment webhooks (no auth required)
router.post("/webhook", async (req, res) => {
    await monifyController.handlePaymentWebhook(req, res);
});
export default router;
