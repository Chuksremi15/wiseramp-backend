// Examples of how to use the token configuration utility

import {
  TokenConfigUtils,
  COMMON_TOKENS,
  CHAIN_TOKEN_CONFIG,
} from "../utils/token-config.js";
import { hypersyncWorker } from "../worker/hypersync-worker.js";

// Example 1: Get token address by symbol
export function getUSDTAddress() {
  const usdtOnEthereum = TokenConfigUtils.getTokenAddress("ethereum", "USDT");
  console.log("USDT on Ethereum:", usdtOnEthereum);
  // Output: 0xdAC17F958D2ee523a2206206994597C13D831ec7

  const usdtOnPolygon = TokenConfigUtils.getTokenAddress("polygon", "USDT");
  console.log("USDT on Polygon:", usdtOnPolygon);
  // Output: 0xc2132D05D31c914a87C6611C10748AEb04B58e8F
}

// Example 2: Get all tokens for a chain
export function getChainTokens() {
  const ethereumTokens = TokenConfigUtils.getChainTokens("ethereum");
  console.log("Ethereum tokens:", ethereumTokens);

  const polygonTokenSymbols = TokenConfigUtils.getChainTokenSymbols("polygon");
  console.log("Polygon token symbols:", polygonTokenSymbols);
  // Output: ['USDT', 'USDC', 'DAI', 'WMATIC', 'WETH']
}

// Example 3: Check if token is supported
export function checkTokenSupport() {
  const isUSDTSupported = TokenConfigUtils.isTokenSupported("ethereum", "USDT");
  console.log("Is USDT supported on Ethereum?", isUSDTSupported); // true

  const isRandomSupported = TokenConfigUtils.isTokenSupported(
    "ethereum",
    "RANDOM"
  );
  console.log("Is RANDOM supported on Ethereum?", isRandomSupported); // false
}

// Example 4: Find token by address
export function findTokenByAddress() {
  const tokenInfo = TokenConfigUtils.findTokenByAddress(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  );
  console.log("Token info:", tokenInfo);
  // Output: { chain: 'ethereum', token: { symbol: 'USDT', address: '0x...', decimals: 6, name: 'Tether USD' } }
}

// Example 5: Get token info with decimals
export function getTokenInfo() {
  const usdtInfo = TokenConfigUtils.getTokenInfo("ethereum", "USDT");
  console.log("USDT info:", usdtInfo);
  // Output: { symbol: 'USDT', address: '0x...', decimals: 6, name: 'Tether USD' }

  // Format amount with proper decimals
  const formattedAmount = TokenConfigUtils.formatTokenAmount(
    1000.123456789,
    "ethereum",
    "USDT"
  );
  console.log("Formatted USDT amount:", formattedAmount); // "1000.123457" (6 decimals)
}

// Example 6: Using with Hypersync Worker
export function hypersyncExamples() {
  const userAddress = "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87";

  // Add address to watch for specific token by symbol
  hypersyncWorker.addAddressForToken(userAddress, "ethereum", "USDT");

  // Add address to watch for ETH/native token
  hypersyncWorker.addAddress(userAddress, "ethereum");

  // Add address to watch for all tokens on a chain
  hypersyncWorker.addAddressForAllTokens(userAddress, "polygon");
}

// Example 7: Using COMMON_TOKENS for quick access
export function commonTokensExample() {
  // Quick access to USDT addresses across chains
  console.log("USDT addresses:", COMMON_TOKENS.USDT);
  // Output: { ethereum: '0x...', polygon: '0x...', bsc: '0x...', ... }

  // Get USDC on specific chain
  const usdcOnArbitrum = COMMON_TOKENS.USDC.arbitrum;
  console.log("USDC on Arbitrum:", usdcOnArbitrum);
}

// Example 8: Iterate through all chains and tokens
export function iterateAllTokens() {
  console.log("All supported tokens:");

  Object.entries(CHAIN_TOKEN_CONFIG).forEach(([chainName, chainConfig]) => {
    console.log(
      `\n${chainName.toUpperCase()} (Chain ID: ${chainConfig.chainId}):`
    );

    Object.entries(chainConfig.tokens).forEach(([symbol, tokenInfo]) => {
      console.log(
        `  ${symbol}: ${tokenInfo.address} (${tokenInfo.decimals} decimals)`
      );
    });
  });
}

// Example 9: Validation helpers
export function validationExamples() {
  // Validate token address format
  const isValid1 = TokenConfigUtils.isValidTokenAddress(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  );
  console.log("Valid address?", isValid1); // true

  const isValid2 = TokenConfigUtils.isValidTokenAddress("invalid-address");
  console.log("Valid address?", isValid2); // false

  // Get supported chains
  const supportedChains = TokenConfigUtils.getSupportedChains();
  console.log("Supported chains:", supportedChains);
  // Output: ['ethereum', 'sepolia', 'polygon', 'bsc', 'arbitrum', 'optimism']
}

// Example 10: Transaction service integration
export function transactionServiceExample() {
  // Example of how you might use this in your transaction service

  interface CreateTransactionData {
    sourceAddress: string;
    sourceChain: string;
    tokenSymbol?: string;
    amount: string;
  }

  function createTransaction(data: CreateTransactionData) {
    // Resolve token address from symbol
    let tokenAddress: string | null;

    if (data.tokenSymbol) {
      tokenAddress = TokenConfigUtils.getTokenAddress(
        data.sourceChain,
        data.tokenSymbol
      );

      if (!tokenAddress) {
        throw new Error(
          `Token ${data.tokenSymbol} not supported on ${data.sourceChain}`
        );
      }

      console.log(
        `Resolved ${data.tokenSymbol} to ${tokenAddress} on ${data.sourceChain}`
      );
    }

    // Start hypersync monitoring
    if (data.tokenSymbol) {
      hypersyncWorker.addAddressForToken(
        data.sourceAddress,
        data.sourceChain,
        data.tokenSymbol
      );
    } else {
      // ETH transaction
      hypersyncWorker.addAddress(data.sourceAddress, data.sourceChain);
    }

    // Create transaction in database...
    console.log("Transaction created and monitoring started");
  }

  // Usage
  createTransaction({
    sourceAddress: "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87",
    sourceChain: "ethereum",
    tokenSymbol: "USDT",
    amount: "100.50",
  });
}
