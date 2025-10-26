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
    rpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        name: "USD Coin",
      },
      WETH: {
        symbol: "WETH",
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        decimals: 18,
        name: "Wrapped Ether",
      },
    },
  },

  sepolia: {
    chainId: 11155111,
    name: "Ethereum Sepolia Testnet",
    hypersyncUrl: "https://sepolia.hypersync.xyz",
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
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
  base: {
    chainId: 8453,
    name: "Base Mainnet",
    hypersyncUrl: "https://base.hypersync.xyz", // Public Hypersync endpoint for Base isn't commonly listed, may not exist/be necessary.
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`, // Using Alchemy format
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
        name: "USD Coin",
      },
      ETH: {
        symbol: "ETH",
        address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", // Represents native ETH on Base
        decimals: 18,
        name: "Ether",
      },
    },
  },
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
  },
  USDC: {
    ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  },
} as const;

// Type exports for better TypeScript support
export type SupportedChain = keyof typeof CHAIN_TOKEN_CONFIG;
export type TokenSymbol = string;
export type TokenAddress = string;
