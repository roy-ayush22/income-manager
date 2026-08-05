import express from "express";
import z from "zod";
// import argon2 from "argon2";

const app = express();
app.use(express.json());

type User = {
  id: number;
  name: string;
  email: string;
  password: string;
  // phone: number;
};

const users: User[] = [];

app.post("/signup", (req, res) => {
  const userBody = z.object({
    name: z.string().min(6).max(30),
    email: z.email(),
    password: z.string().min(6),
    // phone: z.number(),
  });

  const parsed = userBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: z.prettifyError(parsed.error),
    });
  }

  const { email } = req.body;

  const userEmail = users.find((u) => u.email === email);
  if (userEmail) {
    return res.status(401).json({
      error: "user already exists",
    });
  }

  const newUser: User = {
    id: users.length + 1,
    ...parsed.data,
  };

  users.push(newUser);
  res.status(201).json({
    newUser,
  });
});

app.post("/signin", (req, res) => {
  const body = z.object({
    email: z.string(),
    password: z.string().min(6),
  });

  const parsedBody = body.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error: z.prettifyError(parsedBody.error),
    });
  }

  const { email, password } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.status(404).json({
      error: "user not found",
    });
  }
  if (user.password !== password) {
    return res.status(401).json({
      error: "invalid password",
    });
  }

  res.status(200).json({
    message: "signed in successfully",
    user,
  });
});

app.listen(3000, () => {
  console.log("server running on port 3000");
});
