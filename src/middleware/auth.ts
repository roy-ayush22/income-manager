import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SECRET;

if (!JWT_SECRET) throw new Error("secret not set");

const SECRET: string = JWT_SECRET;

export interface AuthRequest extends Request {
  userId?: number;
}

export default function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: "no token provided",
    });
  }

  const token = authHeader.replace("Bearer ", "");

  let decoded: { id: number };

  try {
    decoded = jwt.verify(token, SECRET) as { id: number };
  } catch {
    return res.status(401).json({
      error: "invalid or expired token",
    });
  }

  req.userId = decoded.id;
  next();
}
