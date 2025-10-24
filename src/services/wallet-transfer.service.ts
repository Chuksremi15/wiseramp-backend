import { ethers, HDNodeWallet, Mnemonic } from "ethers";
import { TokenConfigUtils } from "../utils/token-config";
import { deployedContracts } from "../abis/wallet-factory";

// Token configuration
export const TOKEN_CONFIG = {
  SOL: {
    type: "native",
    decimals: 9,
    mintAddress: null,
  },
  USDC: {
    type: "spl",
    decimals: 6,
    mintAddress: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
  },
} as const;

export type TokenType = keyof typeof TOKEN_CONFIG;

export class WalletTransferService {
  /**
   * Get provider for a specific chain
   */
  private static getProvider(chainName: string): ethers.JsonRpcProvider {
    const chainConfig = TokenConfigUtils.getChainConfig(chainName);

    if (!chainConfig?.rpcUrl) {
      throw new Error(`Unsupported chain: ${chainName}`);
    }

    return new ethers.JsonRpcProvider(chainConfig?.rpcUrl);
  }

  /**
   * Transfer ETH from user wallet to hot wallet
   */
  static async transferEthToHotWallet(
    userId: number,
    fromAddress: string,
    amount: number,
    chainName: string = "sepolia"
  ): Promise<{
    success: boolean;
    txHash?: string;
    transferFee?: string;
    error?: string;
  }> {
    try {
      const { ETH_HOT_WALLET_ADDRESS, MNEMONIC } = process.env;

      if (!ETH_HOT_WALLET_ADDRESS || !MNEMONIC) {
        return {
          success: false,
          error: "ETH hot wallet address or mnemonic not configured",
        };
      }

      // Derive user's wallet from mnemonic
      const mnemonic = Mnemonic.fromPhrase(MNEMONIC);
      const hdWallet = HDNodeWallet.fromMnemonic(
        mnemonic,
        `m/44'/60'/0'/0/${userId}`
      );

      // Verify the derived wallet matches the fromAddress
      if (hdWallet.address.toLowerCase() !== fromAddress.toLowerCase()) {
        return {
          success: false,
          error: `Derived wallet address ${hdWallet.address} does not match fromAddress ${fromAddress}`,
        };
      }

      const provider = this.getProvider(chainName);
      const wallet = hdWallet.connect(provider);
      const amountInWei = ethers.parseEther(amount.toString());

      // Get current gas price
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits("20", "gwei");

      // Estimate gas for the transaction
      const gasLimit = await provider.estimateGas({
        to: ETH_HOT_WALLET_ADDRESS,
        value: amountInWei,
        from: wallet.address,
      });

      const gasCost = gasPrice * gasLimit;
      const totalCost = amountInWei + gasCost;

      // Check if wallet has enough balance
      const balance = await provider.getBalance(wallet.address);
      if (balance < amountInWei) {
        return {
          success: false,
          error: `Insufficient balance. Required: ${ethers.formatEther(
            amountInWei
          )} ETH, Available: ${ethers.formatEther(balance)} ETH`,
        };
      }

      console.log(
        `[ETH_TO_HOT_WALLET] Transferring ${amount} ETH from ${fromAddress} to hot wallet`
      );

      // Add 10% buffer to gas cost to account for price fluctuations
      const gasBuffer = gasCost / 10n; // 10% buffer
      const totalGasCostWithBuffer = gasCost + gasBuffer;
      const remaindedOfGasFeeSubstract = amountInWei - totalGasCostWithBuffer;

      // Ensure we have a positive amount to send
      if (remaindedOfGasFeeSubstract <= 0n) {
        return {
          success: false,
          error: `Insufficient balance after gas costs. Required gas (with buffer): ${ethers.formatEther(
            totalGasCostWithBuffer
          )} ETH, Available: ${ethers.formatEther(amountInWei)} ETH`,
        };
      }

      // Send transaction
      const tx = await wallet.sendTransaction({
        to: ETH_HOT_WALLET_ADDRESS,
        value: remaindedOfGasFeeSubstract,
        gasPrice: gasPrice,
        gasLimit: gasLimit,
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (!receipt) {
        return {
          success: false,
          error: "Transaction receipt not available",
        };
      }

      const gasPrice_ = (receipt as any).effectiveGasPrice ?? receipt.gasPrice; // pick whichever exists
      const actualGasCost = receipt.gasUsed * gasPrice_;

      const transferFee = ethers.formatEther(actualGasCost);

      console.log(`[ETH_TO_HOT_WALLET] Transaction successful: ${tx.hash}`);

      return {
        success: true,
        txHash: tx.hash,
        transferFee: transferFee,
      };
    } catch (error) {
      console.error(
        "[ETH_TO_HOT_WALLET] Error transferring ETH to hot wallet:",
        error
      );
      return {
        success: false,
        error: `ETH hot wallet transfer failed: ${error}`,
      };
    }
  }

  /**
   * Derive a Ethereum Keypair for a given userId using the mnemonic.
   */
  private static getUserEthWallet(
    userId: number,
    chainName: string = "sepolia"
  ): ethers.Wallet {
    const mnemonic = process.env.MNEMONIC!;
    const ethMnemonic = Mnemonic.fromPhrase(mnemonic);
    const path = `m/44'/60'/0'/0/${userId}`;
    const ethWallet = HDNodeWallet.fromMnemonic(ethMnemonic, path);
    const provider = this.getProvider(chainName);
    return new ethers.Wallet(ethWallet.privateKey, provider);
  }

  static async setUpContract({ chainName }: { chainName: string }): Promise<
    | {
        success: true;
        sweeperWallet: ethers.Wallet;
        walletFactoryContract: ethers.Contract;
      }
    | {
        success: false;
        error: string;
      }
  > {
    if (!process.env.SWEEPER_PRIVATE_KEY) {
      return {
        success: false,
        error: "Sweeper private key not found",
      };
    }

    const provider = this.getProvider(chainName);
    const sweeperWallet = new ethers.Wallet(
      process.env.SWEEPER_PRIVATE_KEY!,
      provider
    );

    const chainConfig = TokenConfigUtils.getChainConfig(chainName);

    if (!chainConfig) {
      return {
        success: false,
        error: "Sweeper private key not found",
      };
    }

    // Get the contract configuration for the chain
    const contractConfig =
      deployedContracts[chainConfig.chainId as keyof typeof deployedContracts];

    if (!contractConfig) {
      return {
        success: false,
        error: `No contract deployed on chain ${chainName} (chainId: ${chainConfig.chainId})`,
      };
    }

    const walletFactoryContract = new ethers.Contract(
      contractConfig.WalletFactory.address,
      contractConfig.WalletFactory.abi,
      sweeperWallet
    );

    return {
      success: true,
      sweeperWallet,
      walletFactoryContract,
    };
  }

  static async getUserDeterministicAddress({
    userId,
    chainName,
  }: {
    userId: string;
    chainName: string;
  }): Promise<{
    success: boolean;
    address?: string;
    error?: string;
  }> {
    try {
      const salt = ethers.id(`WISERAMP_USER_SALT:${userId}`);

      const contractSetup = await this.setUpContract({
        chainName,
      });

      if (!contractSetup.success) {
        return {
          success: false,
          error: contractSetup.error,
        };
      }

      const { walletFactoryContract } = contractSetup;

      const predictedAddress =
        await walletFactoryContract.getDeterministicAddress(salt);

      return {
        success: true,
        address: predictedAddress,
      };
    } catch (error) {
      console.error("[GET_DETERMINISTIC_ADDRESS] Error:", error);
      return {
        success: false,
        error: `Failed to get deterministic address: ${
          error instanceof Error ? error.message : error
        }`,
      };
    }
  }

  /**
   * Verify token balance for both native tokens (ETH) and ERC-20 tokens
   */
  static async verifyTokenBalance(
    address: string,
    expectedAmount: number,
    tokenSymbol: string,
    tokenAddress?: string,
    chainName: string = "sepolia"
  ): Promise<{
    success: boolean;
    balance?: string;
    balanceFormatted?: string;
    error?: string;
  }> {
    try {
      const provider = this.getProvider(chainName);
      let balance: bigint;
      let decimals: number;
      let balanceFormatted: string;

      // Handle native ETH
      if (tokenSymbol.toLowerCase() === "eth" || !tokenAddress) {
        balance = await provider.getBalance(address);
        decimals = 18;
        balanceFormatted = ethers.formatEther(balance);

        console.log(
          `[TOKEN_BALANCE_CHECK] Address ${address} has ${balanceFormatted} ETH on ${chainName}`
        );
      }
      // Handle ERC-20 tokens
      else {
        // ERC-20 ABI for balanceOf and decimals functions
        const erc20Abi = [
          "function balanceOf(address owner) view returns (uint256)",
          "function decimals() view returns (uint8)",
          "function symbol() view returns (string)",
        ];

        const tokenContract = new ethers.Contract(
          tokenAddress,
          erc20Abi,
          provider
        );

        // Get token decimals and balance
        [decimals, balance] = await Promise.all([
          tokenContract.decimals(),
          tokenContract.balanceOf(address),
        ]);

        balanceFormatted = ethers.formatUnits(balance, decimals);

        console.log(
          `[TOKEN_BALANCE_CHECK] Address ${address} has ${balanceFormatted} ${tokenSymbol} on ${chainName}`
        );
      }

      const balanceNumber = Number(balanceFormatted);

      // Exact balance check
      if (balanceNumber >= expectedAmount) {
        return {
          success: true,
          balance: balance.toString(),
          balanceFormatted: balanceFormatted,
        };
      } else {
        return {
          success: false,
          error: `Insufficient ${tokenSymbol} balance. Expected: ${expectedAmount}, Actual: ${balanceFormatted}`,
        };
      }
    } catch (error) {
      console.error(
        `[TOKEN_BALANCE_CHECK] Error checking ${tokenSymbol} balance:`,
        error
      );
      return {
        success: false,
        error: `Failed to check ${tokenSymbol} balance: ${
          error instanceof Error ? error.message : error
        }`,
      };
    }
  }

  private static toFixed18(num: number | string): string {
    // Convert to number first to handle scientific notation properly
    const numValue = typeof num === "string" ? parseFloat(num) : num;
    // Use toFixed to convert to decimal string, then remove trailing zeros
    return numValue.toFixed(18).replace(/\.?0+$/, "");
  }

  /**
   * Transfer ETH directly from hot wallet (not using vault contract)
   */
  static async transferEthFromHotWallet(
    toAddress: string,
    amount: number,
    chainName: string = "sepolia"
  ): Promise<{
    success: boolean;
    txHash?: string;
    transferFee?: string;
    error?: string;
  }> {
    try {
      const provider = this.getProvider(chainName);
      // Create a wallet with the hot wallet private key
      const hotWallet = new ethers.Wallet(
        process.env.ETH_HOT_WALLET_PRIVATE_KEY!,
        provider
      );

      const amountStr = this.toFixed18(amount);
      const amountInWei = ethers.parseEther(amountStr);

      console.log(
        `[ETH_HOT_WALLET] Transferring ${amount} ETH from hot wallet to ${toAddress}`
      );

      // Create transaction object
      const tx = await hotWallet.sendTransaction({
        to: toAddress,
        value: amountInWei,
      });

      console.log(`[ETH_HOT_WALLET] Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        const gasPrice_ =
          (receipt as any).effectiveGasPrice ?? receipt.gasPrice; // pick whichever exists
        const actualGasCost = receipt.gasUsed * gasPrice_;

        const transferFee = ethers.formatEther(actualGasCost);

        console.log(`[ETH_HOT_WALLET] Transaction confirmed: ${tx.hash}`);

        return {
          success: true,
          txHash: tx.hash,
          transferFee,
        };
      } else {
        return {
          success: false,
          error: "ETH hot wallet transfer failed",
        };
      }
    } catch (error) {
      console.error(
        "[ETH_HOT_WALLET] Error transferring ETH from hot wallet:",
        error
      );
      return {
        success: false,
        error: `ETH hot wallet transfer failed: ${error}`,
      };
    }
  }
}
