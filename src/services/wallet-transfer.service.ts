import { ethers } from "ethers";
import { TokenConfigUtils } from "../utils/token-config";
import { deployedContracts } from "../abis/wallet-factory";

export class WalletTransferService {
  // Cache for contract instances to avoid recreating them
  private static contractCache = new Map<
    string,
    {
      walletFactoryContract: ethers.Contract;
    }
  >();

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

  static async getWalletFactoryContract({
    chainName,
  }: {
    chainName: string;
  }): Promise<
    | {
        success: true;

        walletFactoryContract: ethers.Contract;
      }
    | {
        success: false;
        error: string;
      }
  > {
    // Check if contract is already cached
    const cached = this.contractCache.get(chainName);
    if (cached) {
      return {
        success: true,
        ...cached,
      };
    }

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
        error: "Chain configuration not found",
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
      contractConfig.WalletFactory.abi as any,
      sweeperWallet
    );

    // Cache the contract for future use
    const contractInstance = {
      walletFactoryContract,
    };
    this.contractCache.set(chainName, contractInstance);

    return {
      success: true,
      ...contractInstance,
    };
  }
  static async getWalletContract({
    chainName,
    walletAddress,
  }: {
    chainName: string;
    walletAddress: string;
  }): Promise<
    | {
        success: true;
        walletContract: ethers.Contract;
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
        error: "Chain configuration not found",
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

    const walletContract = new ethers.Contract(
      walletAddress,
      contractConfig.SweepWallet.abi as any,
      sweeperWallet
    );

    return {
      success: true,
      walletContract,
    };
  }

  static async triggerSweep({
    chainName,
    userId,
    tokenSymbol,
    sourceAddress,
  }: {
    chainName: string;
    userId: string;
    tokenSymbol: string;
    sourceAddress: string;
  }): Promise<{
    success: boolean;
    txHash?: string;
    transferFee?: string;
    error?: string;
  }> {
    try {
      const provider = this.getProvider(chainName);

      const salt = this.generateUserSalt(userId);

      const contractSetup = await this.getWalletFactoryContract({
        chainName,
      });

      if (!contractSetup.success) {
        return {
          success: false,
          error: contractSetup.error,
        };
      }

      // Determine token address - use address(0) for ETH, actual address for ERC20
      let tokenAddress;
      if (tokenSymbol.toLowerCase() === "eth") {
        tokenAddress = ethers.ZeroAddress; // address(0) for ETH
      } else {
        tokenAddress = TokenConfigUtils.getTokenInfo(
          chainName,
          tokenSymbol
        )?.address;
        if (!tokenAddress) {
          return {
            success: false,
            error: `Token address not found for ${tokenSymbol} on ${chainName}`,
          };
        }
      }

      if (!process.env.VAULT_ADDRESS) {
        return {
          success: false,
          error: "VAULT_ADDRESS not configured in environment",
        };
      }

      const { walletFactoryContract } = contractSetup;

      const predictedAddress =
        await walletFactoryContract.getDeterministicAddress(salt);

      const code = await provider.getCode(predictedAddress);

      let tx;

      if (code === "0x") {
        // Wallet doesn't exist yet - deploy and sweep in one transaction
        console.log(
          `[Sweeper] Deploying and sweeping wallet for user ${userId}, token: ${tokenSymbol}`
        );

        // 1. Estimate Gas
        const gasLimit = await walletFactoryContract.deployAndSweep.estimateGas(
          salt,
          tokenAddress,
          process.env.VAULT_ADDRESS
        );

        // 2. Send the deploy and sweep transaction
        tx = await walletFactoryContract.deployAndSweep(
          salt,
          tokenAddress,
          process.env.VAULT_ADDRESS,
          {
            gasLimit: gasLimit + BigInt(20000), // Add a 20k buffer
          }
        );

        console.log(`[Sweeper] Deploy and sweep transaction sent: ${tx.hash}`);
        console.log(
          `[Sweeper] SUCCESS: Deployed wallet and swept ${tokenSymbol} from ${sourceAddress} to vault!`
        );
      } else {
        // Wallet already exists - just sweep
        console.log(
          `[Sweeper] Wallet already exists, sweeping ${tokenSymbol} for user ${userId}`
        );

        // Get the wallet contract to call sweep directly
        const walletContractSetup = await this.getWalletContract({
          chainName,
          walletAddress: predictedAddress,
        });

        if (!walletContractSetup.success) {
          return {
            success: false,
            error: walletContractSetup.error,
          };
        }

        const { walletContract } = walletContractSetup;

        // Call the appropriate sweep method based on token type
        if (tokenSymbol.toLowerCase() === "eth") {
          // 1. Estimate Gas for ETH sweep
          const gasLimit = await walletContract.sweepETH.estimateGas(
            process.env.VAULT_ADDRESS
          );

          // 2. Sweep ETH
          tx = await walletContract.sweepETH(process.env.VAULT_ADDRESS, {
            gasLimit: gasLimit + BigInt(20000),
          });
        } else {
          // 1. Estimate Gas for ERC20 sweep
          const gasLimit = await walletContract.sweep.estimateGas(
            tokenAddress,
            process.env.VAULT_ADDRESS
          );

          // 2. Sweep ERC20 token
          tx = await walletContract.sweep(
            tokenAddress,
            process.env.VAULT_ADDRESS,
            {
              gasLimit: gasLimit + BigInt(20000),
            }
          );
        }

        console.log(`[Sweeper] Sweep transaction sent: ${tx.hash}`);
        console.log(
          `[Sweeper] SUCCESS: Swept ${tokenSymbol} from ${sourceAddress} to vault!`
        );
      }

      const receipt = await tx.wait();

      return {
        success: true,
        txHash: tx.hash,
        transferFee: receipt
          ? ethers.formatEther(
              receipt.gasUsed *
                (receipt.effectiveGasPrice || receipt.gasPrice || 0n)
            )
          : undefined,
      };
    } catch (error) {
      console.error(
        `[Sweeper] FAILED to sweep ${sourceAddress}:`,
        error instanceof Error ? error.message : error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a deterministic salt for a user
   * @param userId - The user ID
   * @returns The salt hash for the user
   */
  private static generateUserSalt(userId: string): string {
    return ethers.id(`WISERAMP_USER_SALT:${userId}`);
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
    salt?: string;
    error?: string;
  }> {
    try {
      const salt = this.generateUserSalt(userId);

      const contractSetup = await this.getWalletFactoryContract({
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
        salt,
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
}
