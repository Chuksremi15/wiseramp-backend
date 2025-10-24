import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";

const apiKey = process.env.MONNIFY_API_KEY;
const secretKey = process.env.MONNIFY_SECRET_KEY;
const MONIFY_BASE_URL = "https://sandbox.monnify.com";

// Encode ApiKey:SecretKey as base64
const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

class MonifyAxiosService {
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: MONIFY_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor to handle authentication
    this.axiosInstance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Skip auth for login endpoint
        if (config.url?.includes("/auth/login")) {
          config.headers.Authorization = `Basic ${credentials}`;
          return config;
        }

        // Get valid access token
        const token = await this.getValidAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to handle token expiry
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If token expired, refresh and retry
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // Clear expired token
          this.accessToken = null;
          this.tokenExpiry = 0;

          // Get new token and retry request
          const newToken = await this.getValidAccessToken();
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.axiosInstance(originalRequest);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async loginToMonnify(): Promise<string | null> {
    try {
      const response = await this.axiosInstance.post("/api/v1/auth/login", {});

      const { accessToken, expiresIn } = response.data.responseBody;

      // Set token expiry (subtract 5 minutes for safety)
      this.tokenExpiry = Date.now() + (expiresIn - 300) * 1000;

      return accessToken;
    } catch (error) {
      console.error("Monify login error:", error);
      return null;
    }
  }

  private async getValidAccessToken(): Promise<string | null> {
    // Check if current token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get new token
    this.accessToken = await this.loginToMonnify();
    return this.accessToken;
  }

  // Public method to get the configured axios instance
  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  // Convenience methods for common HTTP operations
  public async get(url: string, config?: AxiosRequestConfig) {
    return this.axiosInstance.get(url, config);
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.axiosInstance.post(url, data, config);
  }

  public async put(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.axiosInstance.put(url, data, config);
  }

  public async delete(url: string, config?: AxiosRequestConfig) {
    return this.axiosInstance.delete(url, config);
  }
}

// Export singleton instance
export const monifyAxios = new MonifyAxiosService();
export default monifyAxios;
