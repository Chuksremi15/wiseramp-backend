import { Request, Response } from "express";

export abstract class BaseController {
  /**
   * Handle async controller methods with error catching
   */
  protected asyncHandler = (
    fn: (req: Request, res: Response) => Promise<Response | void>
  ) => {
    return async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (error) {
        console.error(`[${this.constructor.name}] Error:`, error);
        return res.status(500).json({ message: "Internal server error." });
      }
    };
  };

  /**
   * Validate required fields
   */
  protected validateRequiredFields(
    data: Record<string, any>,
    requiredFields: string[]
  ): string | null {
    for (const field of requiredFields) {
      if (!data[field]) {
        return `${field} is required.`;
      }
    }
    return null;
  }

  /**
   * Send success response
   */
  protected sendSuccess(
    res: Response,
    data: any,
    message?: string,
    statusCode: number = 200
  ): Response {
    return res.status(statusCode).json({
      message: message || "Success",
      ...data,
    });
  }

  /**
   * Send error response
   */
  protected sendError(
    res: Response,
    message: string,
    statusCode: number = 400
  ): Response {
    return res.status(statusCode).json({ message });
  }
}
