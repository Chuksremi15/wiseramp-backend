import axios from "axios";
export class AddressWatcherService {
    watcherUrl = process.env.ADDRESS_WATCHER_URL || "http://localhost:4000";
    async addAddressToWatcher(payload) {
        try {
            await axios.post(`${this.watcherUrl}/add-address`, payload, {
                headers: { "Content-Type": "application/json" },
                timeout: 5000,
            });
        }
        catch (error) {
            let errorMessage = "Unknown error occurred";
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            else if (typeof error === "string") {
                errorMessage = error;
            }
            throw new Error(`Failed to add address to watcher: ${errorMessage}`);
        }
    }
}
