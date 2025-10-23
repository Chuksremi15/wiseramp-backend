// Token configuration for all supported chains
export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

export interface ChainTokens {
  [tokenSymbol: string]: TokenInfo;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  hypersyncUrl: string;
  rpcUrl?: string;
  tokens: ChainTokens;
}

// Comprehensive token mappings by chain
export const CHAIN_TOKEN_CONFIG: Record<string, ChainConfig> = {
  ethereum: {
    chainId: 1,
    name: "Ethereum Mainnet",
    hypersyncUrl: "https://eth.hypersync.xyz",
    rpcUrl: "https://eth.llamarpc.com",
    tokens: {
      USDT: {
        symbol: "USDT",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
        name: "Tether USD",
      },
      USDC: {
        symbol: "USDC",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        name: "USD Coin",
      },
      DAI: {
        symbol: "DAI",
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        decimals: 18,
        name: "Dai Stablecoin",
      },
      WETH: {
        symbol: "WETH",
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        decimals: 18,
        name: "Wrapped Ether",
      },
      WBTC: {
        symbol: "WBTC",
        address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        decimals: 8,
        name: "Wrapped BTC",
      },
    },
  },

  sepolia: {
    chainId: 11155111,
    name: "Ethereum Sepolia Testnet",
    hypersyncUrl: "https://sepolia.hypersync.xyz",
    rpcUrl: "https://sepolia.infura.io/v3/YOUR_KEY",
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238".toLowerCase(),
        decimals: 6,
        name: "USD Coin (Testnet)",
      },
      WETH: {
        symbol: "WETH",
        address: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
        decimals: 18,
        name: "Wrapped Ether (Testnet)",
      },
    },
  },

  // polygon: {
  //   chainId: 137,
  //   name: "Polygon Mainnet",
  //   hypersyncUrl: "https://polygon.hypersync.xyz",
  //   rpcUrl: "https://polygon-rpc.com",
  //   tokens: {
  //     USDT: {
  //       symbol: "USDT",
  //       address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  //       decimals: 6,
  //       name: "Tether USD (PoS)",
  //     },
  //     USDC: {
  //       symbol: "USDC",
  //       address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  //       decimals: 6,
  //       name: "USD Coin (PoS)",
  //     },
  //     DAI: {
  //       symbol: "DAI",
  //       address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
  //       decimals: 18,
  //       name: "Dai Stablecoin (PoS)",
  //     },
  //     WMATIC: {
  //       symbol: "WMATIC",
  //       address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  //       decimals: 18,
  //       name: "Wrapped Matic",
  //     },
  //     WETH: {
  //       symbol: "WETH",
  //       address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  //       decimals: 18,
  //       name: "Wrapped Ether",
  //     },
  //   },
  // },

  // bsc: {
  //   chainId: 56,
  //   name: "BNB Smart Chain",
  //   hypersyncUrl: "https://bsc.hypersync.xyz",
  //   rpcUrl: "https://bsc-dataseed1.binance.org",
  //   tokens: {
  //     USDT: {
  //       symbol: "USDT",
  //       address: "0x55d398326f99059fF775485246999027B3197955",
  //       decimals: 18,
  //       name: "Tether USD (BSC)",
  //     },
  //     USDC: {
  //       symbol: "USDC",
  //       address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  //       decimals: 18,
  //       name: "USD Coin (BSC)",
  //     },
  //     BUSD: {
  //       symbol: "BUSD",
  //       address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  //       decimals: 18,
  //       name: "Binance USD",
  //     },
  //     WBNB: {
  //       symbol: "WBNB",
  //       address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  //       decimals: 18,
  //       name: "Wrapped BNB",
  //     },
  //     BTCB: {
  //       symbol: "BTCB",
  //       address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  //       decimals: 18,
  //       name: "Bitcoin BEP2",
  //     },
  //   },
  // },

  // arbitrum: {
  //   chainId: 42161,
  //   name: "Arbitrum One",
  //   hypersyncUrl: "https://arbitrum.hypersync.xyz",
  //   rpcUrl: "https://arb1.arbitrum.io/rpc",
  //   tokens: {
  //     USDT: {
  //       symbol: "USDT",
  //       address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  //       decimals: 6,
  //       name: "Tether USD",
  //     },
  //     USDC: {
  //       symbol: "USDC",
  //       address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  //       decimals: 6,
  //       name: "USD Coin",
  //     },
  //     WETH: {
  //       symbol: "WETH",
  //       address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  //       decimals: 18,
  //       name: "Wrapped Ether",
  //     },
  //     ARB: {
  //       symbol: "ARB",
  //       address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  //       decimals: 18,
  //       name: "Arbitrum",
  //     },
  //   },
  // },

  // optimism: {
  //   chainId: 10,
  //   name: "Optimism",
  //   hypersyncUrl: "https://optimism.hypersync.xyz",
  //   rpcUrl: "https://mainnet.optimism.io",
  //   tokens: {
  //     USDT: {
  //       symbol: "USDT",
  //       address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  //       decimals: 6,
  //       name: "Tether USD",
  //     },
  //     USDC: {
  //       symbol: "USDC",
  //       address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  //       decimals: 6,
  //       name: "USD Coin",
  //     },
  //     WETH: {
  //       symbol: "WETH",
  //       address: "0x4200000000000000000000000000000000000006",
  //       decimals: 18,
  //       name: "Wrapped Ether",
  //     },
  //     OP: {
  //       symbol: "OP",
  //       address: "0x4200000000000000000000000000000000000042",
  //       decimals: 18,
  //       name: "Optimism",
  //     },
  //   },
  // },
};

// Utility functions
export class TokenConfigUtils {
  /**
   * Get token address by symbol and chain
   */
  static getTokenAddress(chain: string, tokenSymbol: string): string | null {
    const chainConfig = CHAIN_TOKEN_CONFIG[chain.toLowerCase()];
    if (!chainConfig) return null;

    const token = chainConfig.tokens[tokenSymbol.toUpperCase()];
    return token?.address || null;
  }

  /**
   * Get token info by symbol and chain
   */
  static getTokenInfo(chain: string, tokenSymbol: string): TokenInfo | null {
    const chainConfig = CHAIN_TOKEN_CONFIG[chain.toLowerCase()];
    if (!chainConfig) return null;

    return chainConfig.tokens[tokenSymbol.toUpperCase()] || null;
  }

  /**
   * Get all tokens for a specific chain
   */
  static getChainTokens(chain: string): ChainTokens | null {
    const chainConfig = CHAIN_TOKEN_CONFIG[chain.toLowerCase()];
    return chainConfig?.tokens || null;
  }

  /**
   * Get all token addresses for a specific chain
   */
  static getChainTokenAddresses(chain: string): string[] {
    const tokens = this.getChainTokens(chain);
    if (!tokens) return [];

    return Object.values(tokens).map((token) => token.address);
  }

  /**
   * Get all token symbols for a specific chain
   */
  static getChainTokenSymbols(chain: string): string[] {
    const tokens = this.getChainTokens(chain);
    if (!tokens) return [];

    return Object.keys(tokens);
  }

  /**
   * Check if a token is supported on a chain
   */
  static isTokenSupported(chain: string, tokenSymbol: string): boolean {
    return this.getTokenAddress(chain, tokenSymbol) !== null;
  }

  /**
   * Get chain config by chain name
   */
  static getChainConfig(chain: string): ChainConfig | null {
    return CHAIN_TOKEN_CONFIG[chain.toLowerCase()] || null;
  }

  /**
   * Get all supported chains
   */
  static getSupportedChains(): string[] {
    return Object.keys(CHAIN_TOKEN_CONFIG);
  }

  /**
   * Find token by address across all chains
   */
  static findTokenByAddress(
    address: string
  ): { chain: string; token: TokenInfo } | null {
    const normalizedAddress = address.toLowerCase();

    for (const [chainName, chainConfig] of Object.entries(CHAIN_TOKEN_CONFIG)) {
      for (const [symbol, tokenInfo] of Object.entries(chainConfig.tokens)) {
        if (tokenInfo.address.toLowerCase() === normalizedAddress) {
          return { chain: chainName, token: tokenInfo };
        }
      }
    }

    return null;
  }

  /**
   * Get hypersync URL for a chain
   */
  static getHypersyncUrl(chain: string): string | null {
    const chainConfig = this.getChainConfig(chain);
    return chainConfig?.hypersyncUrl || null;
  }

  /**
   * Get RPC URL for a chain
   */
  static getRpcUrl(chain: string): string | null {
    const chainConfig = this.getChainConfig(chain);
    return chainConfig?.rpcUrl || null;
  }

  /**
   * Validate token address format
   */
  static isValidTokenAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Format token amount with proper decimals
   */
  static formatTokenAmount(
    amount: string | number,
    chain: string,
    tokenSymbol: string
  ): string {
    const tokenInfo = this.getTokenInfo(chain, tokenSymbol);
    if (!tokenInfo) return amount.toString();

    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    return numAmount.toFixed(tokenInfo.decimals);
  }
}

// Export commonly used token addresses for quick access
export const COMMON_TOKENS = {
  USDT: {
    ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    bsc: "0x55d398326f99059fF775485246999027B3197955",
    arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    optimism: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  },
  USDC: {
    ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
} as const;

// Type exports for better TypeScript support
export type SupportedChain = keyof typeof CHAIN_TOKEN_CONFIG;
export type TokenSymbol = string;
export type TokenAddress = string;
