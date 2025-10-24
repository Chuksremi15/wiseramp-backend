import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";

import { BaseController } from "./base.controller.js";
import { generateToken } from "../middleware/auth.js";

export class AuthController extends BaseController {
  private authService: AuthService;

  constructor() {
    super();
    this.authService = new AuthService();
  }

  registerUser = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      const { name, email, password } = req.body as {
        name: string;
        email: string;
        password: string;
      };

      // Basic validation
      const validationError = this.validateRequiredFields(req.body, [
        "name",
        "email",
        "password",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      // Check if user already exists by email or phone
      const existingUser = await this.authService.findByEmailNormalized(email);
      if (existingUser) {
        return this.sendError(
          res,
          "User with this email or phone already exists.",
          409
        );
      }

      // Create new user
      const newUser = await this.authService.createUser({
        name,
        email,
        password,
      });

      // Respond with created user info (excluding password)
      const userResponse = this.authService.formatUserResponse(newUser);

      return this.sendSuccess(
        res,
        {
          token: generateToken(userResponse),
          user: userResponse,
        },
        "User registered successfully.",
        201
      );
    }
  );

  loginUser = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      const { email, password } = req.body;

      // Basic validation
      const validationError = this.validateRequiredFields(req.body, [
        "email",
        "password",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      // Find user by email
      const user = await this.authService.findByEmailNormalized(email);
      if (!user) {
        return this.sendError(res, "Invalid email or password.", 401);
      }

      // Check if user has a password (local auth users)
      if (!user.password) {
        return this.sendError(
          res,
          "Please use Google login for this account.",
          401
        );
      }

      // Compare password
      const isMatch = await this.authService.comparePassword(
        password,
        user.password
      );
      if (!isMatch) {
        return this.sendError(res, "Invalid email or password.", 401);
      }

      // Respond with user info (excluding password)
      const userResponse = this.authService.formatUserResponse(user);

      return this.sendSuccess(
        res,
        {
          token: generateToken(userResponse),
          user: userResponse,
        },
        "Login successful."
      );
    }
  );
}

// Export controller instance methods for backward compatibility
const authController = new AuthController();
export const { registerUser, loginUser } = authController;
