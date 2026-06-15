import type { TokenPayload } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      auth: () => {
        userId: string;
        has: (permission: any) => boolean;
      };
      plan?: string;
      file: any;
      user: TokenPayload;
    }
  }
}
export {};