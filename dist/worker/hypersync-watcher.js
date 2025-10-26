import { HypersyncClient, Decoder, BlockField, LogField, TransactionField, } from "@envio-dev/hypersync-client";
// The addresses we want to monitor
const addresses = [
    "0x775b1b8a06eba4633c979a4042a9192fffefd1c3".toLowerCase(),
    "0xc0A101c4E9Bb4463BD2F5d6833c2276C36914Fb6".toLowerCase(),
    "0x000000000004444c5dc75cB358380D2e3dE08A90".toLowerCase(),
    "0xdadB0d80178819F2319190D340ce9A924f783711".toLowerCase(),
];
// Convert address to topic for filtering (ERC20 indexed topics)
function addressToTopic(address) {
    return "0x000000000000000000000000" + address.slice(2);
}
const mainneturl = "https://eth.hypersync.xyz";
const sepoliaurl = "https://sepolia.hypersync.xyz";
async function main() {
    const client = HypersyncClient.new({ url: sepoliaurl });
    // Start from current chain tip
    let fromBlock = await client.getHeight();
    const addressTopicFilter = addresses.map(addressToTopic);
    const query = {
        fromBlock,
        logs: [
            // ERC20 transfers TO addresses
            {
                topics: [
                    [
                        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    ], // Transfer signature
                    [], // from
                    addressTopicFilter, // to
                    [], // extra topic
                ],
            },
            // ERC20 transfers FROM addresses
            {
                topics: [
                    [
                        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    ], // Transfer signature
                    addressTopicFilter, // from
                    [], // to
                    [],
                ],
            },
        ],
        transactions: [{ from: addresses }, { to: addresses }],
        fieldSelection: {
            block: [BlockField.Number, BlockField.Timestamp, BlockField.Hash],
            log: [
                LogField.Data,
                LogField.Address,
                LogField.Topic0,
                LogField.Topic1,
                LogField.Topic2,
                LogField.Topic3,
                LogField.BlockNumber,
                LogField.TransactionHash,
            ],
            transaction: [
                TransactionField.BlockNumber,
                TransactionField.TransactionIndex,
                TransactionField.Hash,
                TransactionField.From,
                TransactionField.To,
                TransactionField.Value,
                TransactionField.Input,
            ],
        },
    };
    const decoder = Decoder.fromSignatures([
        "Transfer(address indexed from, address indexed to, uint amount)",
    ]);
    // ERC20 totals per token per address
    let totalERC20Volume = {};
    let totalWeiVolume = {};
    for (const addr of addresses) {
        totalERC20Volume[addr] = {}; // tokenAddress => amount
        totalWeiVolume[addr] = BigInt(0);
    }
    while (true) {
        const res = await client.get(query);
        // Decode logs
        if (res.data.logs.length > 0) {
            for (const log of res.data.logs) {
                // Skip logs without address
                if (!log.address)
                    continue;
                // decode single log
                const decoded = await decoder.decodeLogs([log]); // returns array with 1 element
                const event = decoded[0];
                if (!event)
                    continue;
                const tokenAddress = log.address.toLowerCase();
                const from = event.indexed[0].val;
                const to = event.indexed[1].val;
                const amount = event.body[0].val;
                // Update ERC20 totals per token per address
                if (addresses.includes(from)) {
                    totalERC20Volume[from][tokenAddress] =
                        (totalERC20Volume[from][tokenAddress] || BigInt(0)) + amount;
                }
                if (addresses.includes(to)) {
                    totalERC20Volume[to][tokenAddress] =
                        (totalERC20Volume[to][tokenAddress] || BigInt(0)) + amount;
                }
                // Optional: log the transfer
                if (addresses.includes(from) || addresses.includes(to)) {
                    console.log(`\x1b[90mERC20 Transfer: ${tokenAddress} from ${from} to ${to}, amount: ${amount}\x1b[0m`);
                }
            }
        }
        // Process ETH transactions
        for (const tx of res.data.transactions) {
            // Skip transactions without required fields
            if (!tx.from || tx.value === undefined)
                continue;
            const from = tx.from.toLowerCase();
            const to = tx.to?.toLowerCase() || "";
            const value = BigInt(tx.value);
            if (addresses.includes(from)) {
                totalWeiVolume[from] += value;
            }
            if (addresses.includes(to)) {
                totalWeiVolume[to] += value;
            }
            // Log transaction details if it involves monitored addresses
            if (addresses.includes(from) || addresses.includes(to)) {
                console.log(`\x1b[31mETH TX: ${tx.hash} from ${from} to ${to}, value: ${value} wei\x1b[0m`);
            }
        }
        // Print summary per address
        console.log(`Scanned up to block ${res.nextBlock}`);
        for (const addr of addresses) {
            console.log(`\nAddress: ${addr}`);
            console.log(`ETH total: ${totalWeiVolume[addr]} wei`);
            console.log("ERC20 totals:");
            for (const [token, amt] of Object.entries(totalERC20Volume[addr])) {
                console.log(`  Token ${token}: ${amt}`);
            }
        }
        // Wait if we are at the chain tip
        let currentHeight = await client.getHeight();
        while (currentHeight <= res.nextBlock) {
            console.log(`Waiting for new blocks. Current height: ${currentHeight}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            currentHeight = await client.getHeight();
        }
        // Continue from next block
        query.fromBlock = res.nextBlock;
    }
}
main();
