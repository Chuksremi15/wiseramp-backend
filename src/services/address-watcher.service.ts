import axios from "axios";

export type SupportedChain = "ethereum" | "polygon" | "bsc" | "solana"; // adjust based on your supported chains

export interface AddAddressPayload {
  address: string;
  chain: SupportedChain | string; // use SupportedChain if you want strict typing
  timeoutMs: number;
}

export class AddressWatcherService {
  private readonly watcherUrl =
    process.env.ADDRESS_WATCHER_URL || "http://localhost:4000";

  async addAddressToWatcher(payload: AddAddressPayload): Promise<void> {
    try {
      await axios.post(`${this.watcherUrl}/add-address`, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      });
    } catch (error) {
      let errorMessage = "Unknown error occurred";

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      throw new Error(`Failed to add address to watcher: ${errorMessage}`);
    }
  }
}
