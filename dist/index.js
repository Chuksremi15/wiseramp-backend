import dotenv from "dotenv";
// Load environment variables FIRST, before any other imports
dotenv.config();
import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.routes.js";
import transactionRoute from "./routes/transaction.routes.js";
import { dbManager, initializeDatabase } from "./db/connection.js";
import bankAccountRoutes from "./routes/bank-account.routes.js";
import userAddressRoutes from "./routes/user-address.routes.js";
import tokenRoutes from "./routes/token.routes.js";
import transactionExpiryWorker from "./worker/transaction-expiry.js";
import { hypersyncWorker } from "./worker/hypersync-worker.js";
import monifyRoutes from "./routes/monify.routes.js";
const app = express();
const PORT = process.env.PORT || 3150;
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [
            "*",
            "http://localhost:2150",
            "https://wiseramp.vercel.app",
        ];
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        // Check if origin is in allowed list or is a vercel.app subdomain
        if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
app.use(express.json());
// Log every endpoint hit (method and URL) - MUST be before routes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});
(async () => {
    try {
        // Initialize enhanced database connection
        console.log("🚀 Initializing database connection...");
        await initializeDatabase();
        // Perform health check
        const healthStatus = await dbManager().healthCheck();
        if (!healthStatus.isConnected) {
            console.error("❌ Database health check failed:", healthStatus.error);
            process.exit(1);
        }
        console.log("\x1b[32m✅ Enhanced PostgreSQL connection initialized successfully.\x1b[0m");
        // Load active transactions into hypersync worker after database is ready
        await hypersyncWorker.loadActiveTransactions();
        // Start the transaction expiry worker after database connection
        transactionExpiryWorker.start();
    }
    catch (error) {
        console.error("❌ Failed to initialize database connections:", error);
        process.exit(1);
    }
})();
app.use("/auth", authRouter);
app.use("/transaction", transactionRoute);
app.use("/api/bank-account", bankAccountRoutes);
app.use("/api/user-address", userAddressRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/monify", monifyRoutes);
// Basic route
app.get("/", (req, res) => {
    res.send("Hello, World!");
});
app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});
app.listen(PORT, () => {
    // Add color to the console log using ANSI escape codes for green text
    console.log(`\x1b[33mServer running on port ${PORT}\x1b[0m`);
});
