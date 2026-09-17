import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import z from "zod";
import argon2 from "argon2";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import authenticate, { AuthRequest } from "./middleware/auth";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("session secret not set env");
}

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
const PgSession = connectPgSimple(session);

const app = express();
app.use(express.json());

app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

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

  req.session.userId = existingUser.id;

  return res.status(200).json({
    message: "signed in successfully",
  });
});

app.post("/signout", authenticate, async (req: AuthRequest, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        error: "could not sign out",
      });
    }
    res.clearCookie("cookie.sid");
    return res.status(200).json({
      message: "signout out successfully",
    });
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

  const { salary, businessIncome, otherIncome } = parsedBody.data;

  const incomeRecord = await client.incomeRecord.upsert({
    where: { userId },
    create: {
      income: salary,
      businessIncome,
      otherIncome,
      userId,
    },
    update: {
      income: salary,
      businessIncome,
      otherIncome,
    },
  });

  return res.status(200).json({ message: "record updated", incomeRecord });
});

app.listen(3000, () => {
  console.log("server running!");
});
