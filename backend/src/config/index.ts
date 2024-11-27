import { CookieOptions } from "express";

export const cookieConfig: CookieOptions = {
  maxAge: 10000 * 60 * 15,
  httpOnly: true,
  sameSite: "strict",
  secure: true,
};