import { Contract, JsonRpcProvider } from "ethers";
import * as dotenv from "dotenv";
import { Decimal } from "decimal.js";
import { Chain } from "../shared/types.js";
dotenv.config();
const provider = new JsonRpcProvider(process.env.RPC_URL);
const baseProvider = new JsonRpcProvider(process.env.BASE_RPC_URL);
// Chainlink AggregatorV3 ABI (simplified)
const aggregatorV3InterfaceABI = [
    "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
    "function decimals() view returns (uint8)",
];
// Mainnet price feed addresses as an object
export const PRICE_FEEDS = {
    ETH: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
    USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    PYUSD: "0x8f1dF6D7F2db73eECE86a18b4381F4707b918FB1",
    NGN: "0xdfbb5Cbc88E382de007bfe6CE99C388176ED80aD",
};
// Token-to-provider mapping for tokens that need specific providers
const TOKEN_PROVIDERS = {
    NGN: baseProvider,
};
// Helper function to get the appropriate provider for a token
function getProviderForToken(token) {
    return TOKEN_PROVIDERS[token] || provider;
}
// Chain-specific decimal configurations
export const CHAIN_DECIMALS = {
    [Chain.ETHEREUM]: 18,
    [Chain.BSC]: 18,
    [Chain.POLYGON]: 18,
    [Chain.ARBITRUM]: 18,
    [Chain.OPTIMISM]: 18,
    [Chain.AVALANCHE]: 18,
    [Chain.BASE]: 18,
};
// Token-specific decimal configurations (overrides chain defaults if needed)
export const TOKEN_DECIMALS = {
    ETH: 18,
    SOL: 9,
    BTC: 8,
    USDC: 6,
    USDT: 6,
};
export function convertToBaseUnits(amount, token) {
    const decimals = TOKEN_DECIMALS[token.toUpperCase()] || 18;
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}
/**
 * Fetches the latest price from a Chainlink Aggregator contract.
 */
export async function getLatestPrice(feedAddress, provider) {
    const priceFeed = new Contract(feedAddress, aggregatorV3InterfaceABI, provider);
    const [, answer] = await priceFeed.latestRoundData();
    const decimals = await priceFeed.decimals();
    return Number(answer) / 10 ** Number(decimals);
}
/**
 * Formats a number to the appropriate decimal places for a given chain or token
 */
export function formatToChainDecimals(amount, destinationChain, destinationToken) {
    // First check if there's a token-specific decimal configuration
    const tokenDecimals = destinationToken
        ? TOKEN_DECIMALS[destinationToken.toUpperCase()]
        : undefined;
    // Fall back to chain-specific decimals
    const chainDecimals = CHAIN_DECIMALS[destinationChain.toLowerCase()];
    // Use token decimals if available, otherwise chain decimals, default to 18
    const decimals = tokenDecimals ?? chainDecimals ?? 18;
    const scale = Math.pow(10, decimals);
    // Round to the specified number of decimal places
    return Math.round(amount * scale) / scale;
}
// Helper method to convert source token amount to destination token equivalent
export async function getTokenEquivalent(destinationToken, sourceToken, sourceAmount, destinationChain) {
    // Validate inputs
    if (sourceAmount <= 0) {
        throw new Error(`Invalid source amount: ${sourceAmount}`);
    }
    if (!PRICE_FEEDS[sourceToken]) {
        throw new Error(`Price feed for ${sourceToken} not configured`);
    }
    if (!PRICE_FEEDS[destinationToken]) {
        throw new Error(`Price feed for ${destinationToken} not configured`);
    }
    try {
        const sourceTokenPrice = await getLatestPrice(PRICE_FEEDS[sourceToken], getProviderForToken(sourceToken));
        const destinationTokenPrice = await getLatestPrice(PRICE_FEEDS[destinationToken], getProviderForToken(destinationToken));
        // Validate prices
        if (sourceTokenPrice <= 0 || destinationTokenPrice <= 0) {
            throw new Error("Invalid price data received from price feeds");
        }
        console.log(`[${sourceToken} Price]: $${sourceTokenPrice}`);
        console.log(`[${destinationToken} Price]: $${destinationTokenPrice}`);
        console.log(`Source Amount: ${sourceAmount} ${sourceToken}`);
        const usdValueOfSourceAmount = new Decimal(sourceAmount).mul(sourceTokenPrice);
        const rawDestinationEquivalent = usdValueOfSourceAmount.div(destinationTokenPrice);
        const exchangeRate = new Decimal(sourceTokenPrice).div(destinationTokenPrice);
        console.log("rawDestinationEquivalent", rawDestinationEquivalent.toString());
        // Format the destination equivalent to the appropriate decimal places
        const destinationEquivalent = destinationChain
            ? formatToChainDecimals(rawDestinationEquivalent.toNumber(), destinationChain, destinationToken)
            : rawDestinationEquivalent.toNumber();
        console.log(`Destination Equivalent: ${destinationEquivalent} ${destinationToken}`);
        console.log(`Exchange Rate: 1 ${sourceToken} = ${exchangeRate.toString()} ${destinationToken}`);
        return { destinationEquivalent, exchangeRate: exchangeRate.toNumber() };
    }
    catch (error) {
        console.error("Error in getTokenEquivalent:", error);
        throw new Error(`Failed to calculate token equivalent: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
