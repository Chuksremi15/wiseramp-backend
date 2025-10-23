export enum AddressStatus {
  WATCHING = "watching",
  PENDING = "pending",
  CONFIRMED = "confirmed",
  FAILED = "failed",
}

export enum TransactionType {
  CRYPTO_TO_FIAT = "crypto_to_fiat",
  CRYPTO_TO_CRYPTO = "crypto_to_crypto",
  FIAT_TO_CRYPTO = "fiat_to_crypto",
}

export enum TransactionStatus {
  // Initial status
  PENDING = "pending",

  // Crypto-related statuses
  WAITING_FOR_CRYPTO = "waiting_for_crypto",
  CRYPTO_PENDING = "crypto_pending",
  CRYPTO_CONFIRMED = "crypto_confirmed",

  // Processing statuses
  PROCESSING = "processing",
  PROCESSING_PAYOUT = "processing_payout",

  // Fiat-related statuses
  WAITING_FOR_FIAT = "waiting_for_fiat",
  FIAT_PENDING = "fiat_pending",
  FIAT_CONFIRMED = "fiat_confirmed",

  // Contract and balance verification statuses
  BALANCE_VERIFICATION_FAILED = "balance_verification_failed",
  TOKEN_TO_VAULT_TRANSFER_FAILED = "token_to_vault_transfer_failed",
  TOKEN_FROM_VAULT_TRANSFER_FAILED = "token_from_vault_transfer_failed",
  TOKEN_TO_VAULT_TRANSFER_QUEUED = "token_to_vault_transfer_queued",
  INTERNAL_SUPPLY_FAILED = "internal_supply_failed",
  INTERNAL_SUPPLY_COMPLETED = "internal_supply_completed",

  // Final statuses
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  FAILED = "failed",
  EXPIRED = "expired",
}

export enum Chain {
  ETHEREUM = "ethereum",
  BSC = "bsc",
  POLYGON = "polygon",
  ARBITRUM = "arbitrum",
  OPTIMISM = "optimism",
  AVALANCHE = "avalanche",
  BASE = "base",
  FIAT = "fiat",
  SEPOLIA = "sepolia",
  // Add more chains as needed
}
