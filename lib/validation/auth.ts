import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .pipe(z.email({ message: "Enter an email address like ada@example.com." }));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().max(200).optional(),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us your name.").max(80, "Keep your name under 80 characters."),
  email: emailSchema,
  password: z.string().min(10, "Use at least 10 characters.").max(200, "That password is too long."),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Only same-site paths, so ?next= can't bounce people to another website. */
export function safeNext(next: string | undefined, fallback = "/support"): string {
  return next && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) ? next : fallback;
}
