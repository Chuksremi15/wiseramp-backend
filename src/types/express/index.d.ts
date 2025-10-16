import { Request } from "express";

interface UserPayload {
  id: number; // Or other properties from your JWT payload
  // Add other user properties as needed
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload; // Make it optional as it might not be present on all requests
    }
  }
}
