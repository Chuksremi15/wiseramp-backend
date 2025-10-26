export var AddressStatus;
(function (AddressStatus) {
    AddressStatus["WATCHING"] = "watching";
    AddressStatus["PENDING"] = "pending";
    AddressStatus["CONFIRMED"] = "confirmed";
    AddressStatus["FAILED"] = "failed";
})(AddressStatus || (AddressStatus = {}));
export var TransactionType;
(function (TransactionType) {
    TransactionType["CRYPTO_TO_FIAT"] = "crypto_to_fiat";
    TransactionType["CRYPTO_TO_CRYPTO"] = "crypto_to_crypto";
    TransactionType["FIAT_TO_CRYPTO"] = "fiat_to_crypto";
})(TransactionType || (TransactionType = {}));
export var TransactionStatus;
(function (TransactionStatus) {
    // Initial status
    TransactionStatus["PENDING"] = "pending";
    // Crypto-related statuses
    TransactionStatus["WAITING_FOR_CRYPTO"] = "waiting_for_crypto";
    TransactionStatus["CRYPTO_PENDING"] = "crypto_pending";
    TransactionStatus["CRYPTO_CONFIRMED"] = "crypto_confirmed";
    // Processing statuses
    TransactionStatus["PROCESSING"] = "processing";
    TransactionStatus["PROCESSING_PAYOUT"] = "processing_payout";
    // Fiat-related statuses
    TransactionStatus["WAITING_FOR_FIAT"] = "waiting_for_fiat";
    TransactionStatus["FIAT_PENDING"] = "fiat_pending";
    TransactionStatus["FIAT_CONFIRMED"] = "fiat_confirmed";
    // Contract and balance verification statuses
    TransactionStatus["BALANCE_VERIFICATION_FAILED"] = "balance_verification_failed";
    TransactionStatus["TOKEN_TO_VAULT_TRANSFER_FAILED"] = "token_to_vault_transfer_failed";
    TransactionStatus["TOKEN_FROM_VAULT_TRANSFER_FAILED"] = "token_from_vault_transfer_failed";
    TransactionStatus["TOKEN_TO_VAULT_TRANSFER_QUEUED"] = "token_to_vault_transfer_queued";
    TransactionStatus["INTERNAL_SUPPLY_FAILED"] = "internal_supply_failed";
    TransactionStatus["INTERNAL_SUPPLY_COMPLETED"] = "internal_supply_completed";
    // Final statuses
    TransactionStatus["COMPLETED"] = "completed";
    TransactionStatus["CANCELLED"] = "cancelled";
    TransactionStatus["FAILED"] = "failed";
    TransactionStatus["EXPIRED"] = "expired";
})(TransactionStatus || (TransactionStatus = {}));
export var Chain;
(function (Chain) {
    Chain["ETHEREUM"] = "ethereum";
    Chain["BSC"] = "bsc";
    Chain["POLYGON"] = "polygon";
    Chain["ARBITRUM"] = "arbitrum";
    Chain["OPTIMISM"] = "optimism";
    Chain["AVALANCHE"] = "avalanche";
    Chain["BASE"] = "base";
    Chain["FIAT"] = "fiat";
    Chain["SEPOLIA"] = "sepolia";
    // Add more chains as needed
})(Chain || (Chain = {}));
