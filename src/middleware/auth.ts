import { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  userId?: number;
}

export default function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "not signed in" });
  }

  req.userId = req.session.userId;
  next();
}
