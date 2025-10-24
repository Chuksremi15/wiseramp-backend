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
              internalType: "address payable",
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
    SweepWallet: {
      abi: {
        abi: [
          {
            inputs: [],
            stateMutability: "nonpayable",
            type: "constructor",
          },
          {
            inputs: [],
            name: "FailedCall",
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
            inputs: [],
            name: "InvalidInitialization",
            type: "error",
          },
          {
            inputs: [],
            name: "NotInitializing",
            type: "error",
          },
          {
            inputs: [
              {
                internalType: "address",
                name: "owner",
                type: "address",
              },
            ],
            name: "OwnableInvalidOwner",
            type: "error",
          },
          {
            inputs: [
              {
                internalType: "address",
                name: "account",
                type: "address",
              },
            ],
            name: "OwnableUnauthorizedAccount",
            type: "error",
          },
          {
            anonymous: false,
            inputs: [
              {
                indexed: false,
                internalType: "uint64",
                name: "version",
                type: "uint64",
              },
            ],
            name: "Initialized",
            type: "event",
          },
          {
            anonymous: false,
            inputs: [
              {
                indexed: true,
                internalType: "address",
                name: "previousOwner",
                type: "address",
              },
              {
                indexed: true,
                internalType: "address",
                name: "newOwner",
                type: "address",
              },
            ],
            name: "OwnershipTransferred",
            type: "event",
          },
          {
            inputs: [
              {
                internalType: "address",
                name: "_newOwner",
                type: "address",
              },
            ],
            name: "initialize",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
          {
            inputs: [],
            name: "owner",
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
            name: "renounceOwnership",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
          {
            inputs: [
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
            name: "sweep",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
          {
            inputs: [
              {
                internalType: "address payable",
                name: "_to",
                type: "address",
              },
            ],
            name: "sweepETH",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
          {
            inputs: [
              {
                internalType: "address",
                name: "newOwner",
                type: "address",
              },
            ],
            name: "transferOwnership",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
          {
            stateMutability: "payable",
            type: "receive",
          },
        ],
      },
    },
  },
} as const;
