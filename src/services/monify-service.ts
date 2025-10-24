import monifyAxios from "../services/monify-axios.service.js";
import { PostgresUserService } from "./user.service.js";
import { generateMonifyReference } from "../utils/reference-generator.js";
import type { User } from "../db/schema.js";

const CONTRACT_CODE = "6525620582";
const MONIFY_VAULT_ACCOUNT = "5782214614";

interface CreateReserveAccountData {
  email: string;
}

interface MonifyReserveAccountResponse {
  requestSuccessful: boolean;
  responseBody: {
    accountReference: string;
    accounts: any[];
  };
}

export class MonifyService {
  private userService: PostgresUserService;

  constructor() {
    this.userService = new PostgresUserService();
  }

  /**
   * Creates a reserve account for a user via Monify API
   * @param data - Object containing user email
   * @returns Promise with the created account data
   * @throws Error if user not found or API call fails
   */
  async createReserveAccount(
    data: CreateReserveAccountData
  ): Promise<MonifyReserveAccountResponse> {
    const { email } = data;

    if (!email) {
      throw new Error("Missing required field: email");
    }

    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new Error("User not found");
    }

    const accountRequestData = {
      accountReference: generateMonifyReference(),
      accountName: `Coinbox/${user.name}`,
      currencyCode: "NGN",
      contractCode: CONTRACT_CODE,
      customerEmail: user.email,
      customerName: user.name,
      bvn: "21212121212",
      getAllAvailableBanks: true,
      preferredBanks: ["50515"],
      // incomeSplitConfig: [
      //   {
      //     subAccountCode: "MFY_SUB_322165393053",
      //     feePercentage: 10.5,
      //     splitAmount: 20,
      //     feeBearer: true,
      //   },
      // ],
      // metaData: {
      //   ipAddress: "127.0.0.1",
      //   deviceType: "mobile",
      // },
    };

    try {
      const response = await monifyAxios.post(
        "/api/v2/bank-transfer/reserved-accounts",
        accountRequestData
      );

      if (response.data.requestSuccessful) {
        const { accountReference, accounts } = response.data.responseBody;

        // Update user with reserve account information
        await this.userService.update(user.id, {
          reserveAccountRef: accountReference,
          reserveAccounts: accounts,
        });

        return response.data;
      } else {
        throw new Error("Monify API request was not successful");
      }
    } catch (error: any) {
      console.error("Create reserve account error:", error);
      throw new Error(
        `Failed to create reserve account: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Reusable method for transferring from Monify vault to any account
  async executeVaultTransfer(params: {
    amount: number;
    accountNumber: string;
    bankCode: string;
    narration?: string;
    customReference?: string;
  }): Promise<{
    success: boolean;
    data?: any;
    txHash?: string;
    error?: string;
  }> {
    try {
      const { amount: rawAmount, accountNumber, bankCode, narration } = params;
      const amount = parseFloat(rawAmount.toFixed(2));

      let customReference = generateMonifyReference();

      // Prepare the transfer data
      const transferData = {
        amount,
        reference: customReference,
        narration: narration || "911 Transaction",
        destinationBankCode: bankCode,
        destinationAccountNumber: accountNumber,
        currency: "NGN",
        sourceAccountNumber: MONIFY_VAULT_ACCOUNT,
      };

      try {
        // Make POST request to the transfer API
        const response = await monifyAxios.post(
          "/api/v2/disbursements/single",
          transferData
        );

        const { responseBody } = response.data;

        if (!responseBody) {
          return {
            success: false,
            error: "Invalid response format from Monify API",
          };
        }

        if (responseBody.status === "SUCCESS") {
          return {
            success: true,
            data: responseBody,
            txHash: responseBody.reference,
          };
        } else {
          return {
            success: false,
            error: "Transfer not successful",
          };
        }
      } catch (error: any) {
        console.error("Monify API Error:", {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            headers: error.config?.headers,
          },
        });
        return {
          success: false,
          error:
            error.response?.data?.responseMessage ||
            error.message ||
            "API request failed",
        };
      }
    } catch (error: any) {
      console.error("Vault transfer error:", error);
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Gets reserve account details for a user via Monify API
   * @param data - Object containing user email
   * @returns Promise with the reserve account data
   * @throws Error if user not found or API call fails
   */
  async getReserveAccount(data: { email: string }): Promise<any> {
    const { email } = data;

    if (!email) {
      throw new Error("Missing required field: email");
    }

    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.reserveAccountRef) {
      throw new Error("User does not have a reserve account reference");
    }

    try {
      const response = await monifyAxios.get(
        `/api/v2/bank-transfer/reserved-accounts/${user.reserveAccountRef}`
      );

      return response.data;
    } catch (error: any) {
      console.error("Get reserve account error:", error);
      throw new Error(
        `Failed to get reserve account: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }
}
