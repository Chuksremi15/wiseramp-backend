import express, { Request, Response } from "express";
import {
  TokenConfigUtils,
  COMMON_TOKENS,
  CHAIN_TOKEN_CONFIG,
} from "../utils/token-config.js";
import { hypersyncWorker } from "../worker/hypersync-worker.js";

const router = express.Router();

// Get all supported chains
router.get("/chains", (req: Request, res: Response) => {
  try {
    const chains = TokenConfigUtils.getSupportedChains();
    const chainDetails = chains.map((chain) => {
      const config = TokenConfigUtils.getChainConfig(chain);
      return {
        name: chain,
        chainId: config?.chainId,
        tokenCount: TokenConfigUtils.getChainTokenSymbols(chain).length,
        hypersyncUrl: config?.hypersyncUrl,
      };
    });

    res.json({
      success: true,
      chains: chainDetails,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get chains" });
  }
});

// Get all tokens for a specific chain
router.get("/chains/:chain/tokens", (req: Request, res: Response) => {
  try {
    const { chain } = req.params;
    const tokens = TokenConfigUtils.getChainTokens(chain);

    if (!tokens) {
      return res.status(404).json({ error: `Chain ${chain} not supported` });
    }

    res.json({
      success: true,
      chain,
      tokens,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get tokens" });
  }
});

// Get specific token info
router.get("/chains/:chain/tokens/:symbol", (req: Request, res: Response) => {
  try {
    const { chain, symbol } = req.params;
    const tokenInfo = TokenConfigUtils.getTokenInfo(chain, symbol);

    if (!tokenInfo) {
      return res.status(404).json({
        error: `Token ${symbol} not found on ${chain}`,
      });
    }

    res.json({
      success: true,
      chain,
      symbol,
      tokenInfo,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get token info" });
  }
});

// Resolve token address from symbol
router.get("/resolve/:chain/:symbol", (req: Request, res: Response) => {
  try {
    const { chain, symbol } = req.params;
    const address = TokenConfigUtils.getTokenAddress(chain, symbol);

    if (!address) {
      return res.status(404).json({
        error: `Token ${symbol} not found on ${chain}`,
      });
    }

    res.json({
      success: true,
      chain,
      symbol,
      address,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve token address" });
  }
});

// Find token by address
router.get("/find/:address", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const result = TokenConfigUtils.findTokenByAddress(address);

    if (!result) {
      return res.status(404).json({
        error: `Token with address ${address} not found`,
      });
    }

    res.json({
      success: true,
      address,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to find token" });
  }
});

// Check if token is supported
router.get("/check/:chain/:symbol", (req: Request, res: Response) => {
  try {
    const { chain, symbol } = req.params;
    const isSupported = TokenConfigUtils.isTokenSupported(chain, symbol);

    res.json({
      success: true,
      chain,
      symbol,
      isSupported,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check token support" });
  }
});

// Get common tokens (USDT, USDC across all chains)
router.get("/common", (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      commonTokens: COMMON_TOKENS,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get common tokens" });
  }
});

// Start monitoring address for specific token
router.post("/monitor", async (req: Request, res: Response) => {
  try {
    const { address, chain, tokenSymbol } = req.body;

    if (!address || !chain) {
      return res.status(400).json({
        error: "Address and chain are required",
      });
    }

    let success: boolean;

    if (tokenSymbol) {
      // Monitor specific token
      success = await hypersyncWorker.addAddressForToken(
        address,
        chain,
        tokenSymbol
      );

      if (!success) {
        return res.status(400).json({
          error: `Token ${tokenSymbol} not supported on ${chain}`,
        });
      }
    } else {
      // Monitor ETH/native token
      success = await hypersyncWorker.addAddress(address, chain);
    }

    res.json({
      success: true,
      message: `Started monitoring ${address} on ${chain}${
        tokenSymbol ? ` for ${tokenSymbol}` : " for ETH/native token"
      }`,
      hypersyncStatus: hypersyncWorker.getStatus(),
    });
  } catch (error) {
    console.error("Error starting monitoring:", error);
    res.status(500).json({ error: "Failed to start monitoring" });
  }
});

// Stop monitoring address
router.delete("/monitor", (req: Request, res: Response) => {
  try {
    const { address, chain } = req.body;

    if (!address || !chain) {
      return res.status(400).json({
        error: "Address and chain are required",
      });
    }

    const success = hypersyncWorker.removeAddress(address, chain);

    res.json({
      success,
      message: success
        ? `Stopped monitoring ${address} on ${chain}`
        : `Address ${address} was not being monitored on ${chain}`,
      hypersyncStatus: hypersyncWorker.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to stop monitoring" });
  }
});

// Get hypersync worker status
router.get("/hypersync/status", (req: Request, res: Response) => {
  try {
    const status = hypersyncWorker.getStatus();
    res.json({
      success: true,
      hypersync: status,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get hypersync status" });
  }
});

// Format token amount with proper decimals
router.post("/format", (req: Request, res: Response) => {
  try {
    const { amount, chain, tokenSymbol } = req.body;

    if (!amount || !chain || !tokenSymbol) {
      return res.status(400).json({
        error: "Amount, chain, and tokenSymbol are required",
      });
    }

    const formattedAmount = TokenConfigUtils.formatTokenAmount(
      amount,
      chain,
      tokenSymbol
    );
    const tokenInfo = TokenConfigUtils.getTokenInfo(chain, tokenSymbol);

    if (!tokenInfo) {
      return res.status(404).json({
        error: `Token ${tokenSymbol} not found on ${chain}`,
      });
    }

    res.json({
      success: true,
      originalAmount: amount,
      formattedAmount,
      decimals: tokenInfo.decimals,
      tokenInfo,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to format amount" });
  }
});

export default router;
