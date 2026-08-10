import "dotenv/config";
import express from "express";
import z from "zod";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import authenticate, { AuthRequest } from "./middleware/auth";
import { safeDecode } from "zod/v4/core";

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const JWT_SECRET = process.env.SECRET;
if (!JWT_SECRET) {
  throw new Error("secret env not set");
}

const app = express();
app.use(express.json());

app.post("/signup", async (req, res) => {
  const requiredBody = z.object({
    name: z.string(),
    email: z.email(),
    password: z
      .string()
      .min(6)
      .max(24)
      .regex(/[A-Z]/, "password must contain a upper case letter")
      .regex(/[a-z]/, "password must contain a lower case letter")
      .regex(/[!@#$%^&*()<>?:]/, "password must contain a special letter"),
  });

  const parsedBody = requiredBody.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: parsedBody.error.issues.map((e) => e.message),
    });
  }

  const { name, email, password } = parsedBody.data;

  const existingUser = await client.user.findFirst({
    where: {
      email,
    },
  });

  if (existingUser) {
    return res.status(401).json({
      error: "user already exists, please signin",
    });
  }

  const securePassword = await argon2.hash(password);

  await client.user.create({
    data: {
      name,
      email,
      password: securePassword,
    },
  });
  return res.status(201).json({
    message: "user created successfully",
  });
});

app.post("/signin", async (req, res) => {
  const requiredBody = z.object({
    email: z.email(),
    password: z.string().min(6).max(24),
  });

  const parsedBody = requiredBody.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: parsedBody.error.issues.map((e) => e.message),
    });
  }

  const { email, password } = parsedBody.data;
  const existingUser = await client.user.findFirst({
    where: {
      email,
    },
  });

  if (!existingUser) {
    return res.status(404).json({
      error: "user not found, please signup",
    });
  }

  const isValidPassword = await argon2.verify(existingUser.password, password);
  if (!isValidPassword) {
    return res.status(401).json({
      error: "invalid password",
    });
  }

  if (existingUser.currentToken) {
    try {
      jwt.verify(existingUser.currentToken, JWT_SECRET);
      return res.status(409).json({
        error: "user already signed in",
      });
    } catch {}
  }

  const token = jwt.sign({ id: existingUser.id, email }, JWT_SECRET, {
    expiresIn: "1d",
  });

  await client.user.update({
    where: {
      id: existingUser.id,
    },
    data: {
      currentToken: token,
    },
  });

  return res.status(200).json({
    message: "signed in successfully",
    token,
  });
});

app.post("/signout", authenticate, async (req: AuthRequest, res) => {
  await client.user.update({
    where: {
      id: req.userId!,
    },
    data: {
      currentToken: null,
    },
  });

  return res.status(200).json({ message: "signed out successfully" });
});

app.post("/user/income", authenticate, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const requiredBody = z.object({
    salary: z.number(),
    businessIncome: z.number(),
    otherIncome: z.number(),
  });

  const parsedBody = requiredBody.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: parsedBody.error.issues.map((e) => e.message),
    });
  }

  const incomeRecord = await client.incomeRecord.create({
    data: {
      ...parsedBody.data,
      userId,
    },
  });

  return res.status(200).json({ message: "record updated", incomeRecord });
});

app.listen(3000, () => {
  console.log("server running!");
});
