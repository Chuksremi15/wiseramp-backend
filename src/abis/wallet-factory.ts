export const deployedContracts = {
  11155111: {
    WalletFactory: {
      address: "0xFd623280520C401533629D91c95B28576282263c",
      abi: [
        {
          inputs: [
            {
              internalType: "address",
              name: "_sweeper",
              type: "address",
            },
          ],
          stateMutability: "nonpayable",
          type: "constructor",
        },
        {
          inputs: [],
          name: "FailedDeployment",
          type: "error",
        },
        {
          inputs: [
            {
              internalType: "uint256",
              name: "balance",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "needed",
              type: "uint256",
            },
          ],
          name: "InsufficientBalance",
          type: "error",
        },
        {
          anonymous: false,
          inputs: [
            {
              indexed: true,
              internalType: "address",
              name: "wallet",
              type: "address",
            },
            {
              indexed: true,
              internalType: "bytes32",
              name: "salt",
              type: "bytes32",
            },
          ],
          name: "WalletCreated",
          type: "event",
        },
        {
          inputs: [
            {
              internalType: "bytes32",
              name: "_salt",
              type: "bytes32",
            },
            {
              internalType: "address",
              name: "_tokenAddress",
              type: "address",
            },
            {
              internalType: "address",
              name: "_to",
              type: "address",
            },
          ],
          name: "deployAndSweep",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          inputs: [
            {
              internalType: "bytes32",
              name: "_salt",
              type: "bytes32",
            },
          ],
          name: "getDeterministicAddress",
          outputs: [
            {
              internalType: "address",
              name: "",
              type: "address",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [],
          name: "implementation",
          outputs: [
            {
              internalType: "address",
              name: "",
              type: "address",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [],
          name: "sweeper",
          outputs: [
            {
              internalType: "address",
              name: "",
              type: "address",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ],
      inheritedFunctions: {},
    },
  },
} as const;
