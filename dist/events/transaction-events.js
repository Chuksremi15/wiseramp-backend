import { EventEmitter } from "events";
// Event emitter for transaction-related events
class TransactionEventEmitter extends EventEmitter {
    // Emit when a new transaction is created
    emitTransactionCreated(event) {
        this.emit("transaction:created", event);
    }
    // Emit when a transaction is completed/expired
    emitTransactionCompleted(event) {
        this.emit("transaction:completed", event);
    }
    // Listen for transaction created events
    onTransactionCreated(callback) {
        this.on("transaction:created", callback);
    }
    // Listen for transaction completed events
    onTransactionCompleted(callback) {
        this.on("transaction:completed", callback);
    }
}
export const transactionEvents = new TransactionEventEmitter();
