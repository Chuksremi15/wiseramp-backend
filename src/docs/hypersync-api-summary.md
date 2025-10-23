# Hypersync Worker API Summary

## Refactored Methods

### 1. `addAddress(address: string, chain: string)`

**Purpose**: Watch an address for ETH/native token transactions only
**Parameters**:

- `address`: The wallet address to monitor
- `chain`: The blockchain network (e.g., "ethereum", "polygon")

**Example**:

```typescript
hypersyncWorker.addAddress(
  "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87",
  "ethereum"
);
```

### 2. `addAddressForToken(address: string, chain: string, tokenSymbol: string)`

**Purpose**: Watch an address for specific ERC20 token transactions
**Parameters**:

- `address`: The wallet address to monitor
- `chain`: The blockchain network
- `tokenSymbol`: The token symbol (e.g., "USDT", "USDC")

**Example**:

```typescript
hypersyncWorker.addAddressForToken(
  "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87",
  "ethereum",
  "USDT"
);
```

### 3. `addAddressForAllTokens(address: string, chain: string)`

**Purpose**: Watch an address for ALL supported token transactions on a chain
**Parameters**:

- `address`: The wallet address to monitor
- `chain`: The blockchain network

**Example**:

```typescript
hypersyncWorker.addAddressForAllTokens(
  "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87",
  "polygon"
);
```

## Key Changes

### ✅ **Simplified API**

- No more confusion between token addresses and symbols
- Clear separation between ETH and token monitoring
- Token symbols are automatically resolved to addresses

### ✅ **Type Safety**

- Only accepts valid token symbols from configuration
- Validates chain support before adding addresses
- Clear error messages for unsupported tokens

### ✅ **Better Error Handling**

- Returns `false` for unsupported tokens/chains
- Logs clear error messages
- Prevents invalid configurations

## Usage Patterns

### **For Transaction Creation**

```typescript
// ETH transaction
hypersyncWorker.addAddress(userAddress, "ethereum");

// Token transaction
hypersyncWorker.addAddressForToken(userAddress, "ethereum", "USDT");
```

### **For API Endpoints**

```bash
# Monitor ETH
POST /api/tokens/monitor
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87",
  "chain": "ethereum"
}

# Monitor USDT
POST /api/tokens/monitor
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96590c6C87",
  "chain": "ethereum",
  "tokenSymbol": "USDT"
}
```

### **For Loading Active Transactions**

The worker automatically:

1. Loads pending transactions from database
2. Resolves token addresses to symbols using `TokenConfigUtils.findTokenByAddress()`
3. Adds appropriate monitoring based on transaction type

## Supported Tokens

### **Ethereum**

- USDT, USDC, DAI, WETH, WBTC

### **Polygon**

- USDT, USDC, DAI, WMATIC, WETH

### **BSC**

- USDT, USDC, BUSD, WBNB, BTCB

### **Arbitrum**

- USDT, USDC, WETH, ARB

### **Optimism**

- USDT, USDC, WETH, OP

### **Sepolia (Testnet)**

- USDT, USDC, WETH

## Benefits

1. **Clean API**: No ambiguity about parameters
2. **Automatic Resolution**: Symbols → addresses handled internally
3. **Validation**: Only supported tokens can be monitored
4. **Extensible**: Easy to add new tokens/chains in config
5. **Type Safe**: Full TypeScript support with proper interfaces
