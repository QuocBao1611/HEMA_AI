import { apiRequest, apiGet } from "./client";
import { z } from "zod";

export const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
});

export const UserSchema = z.object({
  username: z.string(),
  full_name: z.string().nullable(),
  role: z.string(),
});

export type TokenResponse = z.infer<typeof TokenSchema>;
export type UserResponse = z.infer<typeof UserSchema>;

export async function login(username: string, password: string): Promise<TokenResponse> {
  const params = new URLSearchParams();
  params.append("username", username);
  params.append("password", password);
  
  return apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    body: params.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    schema: TokenSchema,
  });
}

export async function getMe(): Promise<UserResponse> {
  return apiGet<UserResponse>("/auth/me", UserSchema);
}
