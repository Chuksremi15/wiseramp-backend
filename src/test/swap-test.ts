import dotenv from "dotenv";
import { WalletTransferService } from "../services/wallet-transfer.service";

// Load environment variables from .env file
dotenv.config();

async function testUsdcToEthSwap() {
  console.log("🚀 Starting USDC to ETH swap test...\n");

  try {
    // Test parameters

    const swapParams = {
      chainName: "base", // Changed from "polygon"
      sellTokenSymbol: "USDC", // Remains USDC
      buyTokenSymbol: "ETH", // Changed from "MATIC" (Base uses ETH as native token)
      sellAmount: "5", // Remains 5 USDC
      recipientAddress: "0xDAADf6f9B33a1e01Be2A48765D77B116A2d5DF77", // Remains the same
    };

    console.log("📋 Swap Parameters:");
    console.log(`Chain: ${swapParams.chainName}`);
    console.log(
      `  Sell: ${swapParams.sellAmount} ${swapParams.sellTokenSymbol}`
    );
    console.log(`  Buy: ${swapParams.buyTokenSymbol}`);
    console.log("");

    // Execute the swap
    console.log("⏳ Executing swap...");
    const result = await WalletTransferService.swapTokens(swapParams);

    if (result.success) {
      console.log("✅ SWAP SUCCESSFUL!");
      console.log(`  Transaction Hash: ${result.txHash}`);
      console.log(`  Transfer Fee: ${result.transferFee} ETH`);
      console.log(
        `  View on Basescan: https://basescan.org//tx/${result.txHash}`
      );
    } else {
      console.log("❌ SWAP FAILED!");
      console.log(`  Error: ${result.error}`);
    }
  } catch (error) {
    console.error(
      "💥 Test failed with error:",
      error instanceof Error ? error.message : error
    );
  }
}

// Run the test
testUsdcToEthSwap();
