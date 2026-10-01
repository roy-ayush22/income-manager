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

interface TaxCalculationResult {
  grossIncome: number;
  standardDeduction: number;
  netTaxableIncome: number;
  grossTax: number;
  rebate87A: number;
  taxAfterRebate: number;
  finalTaxPayable: number;
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

app.get("/user/income", authenticate, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const record = await client.incomeRecord.findUnique({
    where: { userId },
  });
  if (!record) {
    return res.status(404).json({
      error: "no income found, add income record first",
    });
  }

  const totalIncome =
    record.income + record.businessIncome + record.otherIncome;

  res.status(200).json({
    income: record.income,
    businessIncome: record.businessIncome,
    otherIncome: record.otherIncome,
    totalIncome,
  });
});

app.get("/user/tax", authenticate, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const incomeRecord = await client.incomeRecord.findUnique({
    where: { userId },
  });
  if (!incomeRecord) {
    return res.status(404).json({
      error: "no income record, please add income details first",
    });
  }

  const grossIncome =
    incomeRecord.otherIncome +
    incomeRecord.businessIncome +
    incomeRecord.otherIncome;

  function calculateIncomeTax(grossIncome: number): TaxCalculationResult {
    const standardDeduction = 75000;
    const netTaxableIncome = Math.max(0, grossIncome - standardDeduction);

    const slabs = [
      { limit: 400000, rate: 0.0 }, // Up to 4L
      { limit: 800000, rate: 0.05 }, // 4L to 8L
      { limit: 1200000, rate: 0.1 }, // 8L to 12L
      { limit: 1600000, rate: 0.15 }, // 12L to 16L
      { limit: 2000000, rate: 0.2 }, // 16L to 20L
      { limit: 2400000, rate: 0.25 }, // 20L to 24L
      { limit: Infinity, rate: 0.3 }, // Above 24L
    ];

    let grossTax = 0;
    let previousLimit = 0;

    for (const slab of slabs) {
      if (netTaxableIncome > previousLimit) {
        const taxableInThisSlab =
          Math.min(netTaxableIncome, slab.limit) - previousLimit;
        grossTax += taxableInThisSlab * slab.rate;
        previousLimit = slab.limit;
      } else {
        break;
      }
    }

    // 3. Section 87A Rebate
    // (Available if net taxable income is up to ₹12,00,000, capped at ₹60,000 or actual tax)
    let rebate87A = 0;
    if (netTaxableIncome <= 1200000) {
      rebate87A = Math.min(grossTax, 60000);
    }

    const taxAfterRebate = Math.max(0, grossTax - rebate87A);

    const finalTaxPayable = Math.round(taxAfterRebate);

    return {
      grossIncome,
      standardDeduction,
      netTaxableIncome,
      grossTax,
      rebate87A,
      taxAfterRebate,
      finalTaxPayable,
    };
  }

  const result = calculateIncomeTax(grossIncome);
  console.log(result)
});

app.listen(3000, () => {
  console.log("server running!");
});
