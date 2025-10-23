import { EventEmitter } from "events";

// Event types
export interface TransactionCreatedEvent {
  transactionId: string;
  sourceAddress: string;
  sourceChain: string;
  sourceCurrency?: string;
  tokenAddress?: string;
}

export interface TransactionCompletedEvent {
  transactionId: string;
  sourceAddress: string;
  sourceChain: string;
}

// Event emitter for transaction-related events
class TransactionEventEmitter extends EventEmitter {
  // Emit when a new transaction is created
  emitTransactionCreated(event: TransactionCreatedEvent) {
    this.emit("transaction:created", event);
  }

  // Emit when a transaction is completed/expired
  emitTransactionCompleted(event: TransactionCompletedEvent) {
    this.emit("transaction:completed", event);
  }

  // Listen for transaction created events
  onTransactionCreated(callback: (event: TransactionCreatedEvent) => void) {
    this.on("transaction:created", callback);
  }

  // Listen for transaction completed events
  onTransactionCompleted(callback: (event: TransactionCompletedEvent) => void) {
    this.on("transaction:completed", callback);
  }
}

export const transactionEvents = new TransactionEventEmitter();
