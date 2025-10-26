export class BaseController {
    /**
     * Handle async controller methods with error catching
     */
    asyncHandler = (fn) => {
        return async (req, res) => {
            try {
                await fn(req, res);
            }
            catch (error) {
                console.error(`[${this.constructor.name}] Error:`, error);
                return res.status(500).json({ message: "Internal server error." });
            }
        };
    };
    /**
     * Validate required fields
     */
    validateRequiredFields(data, requiredFields) {
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
    sendSuccess(res, data, message, statusCode = 200) {
        return res.status(statusCode).json({
            message: message || "Success",
            ...data,
        });
    }
    /**
     * Send error response
     */
    sendError(res, message, statusCode = 400) {
        return res.status(statusCode).json({ message });
    }
}
