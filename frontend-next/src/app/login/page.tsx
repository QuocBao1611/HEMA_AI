"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useAuthStore } from "@/stores/auth-store";
import { getMe, login } from "@/lib/api/auth";

const loginSchema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      const tokenData = await login(values.username, values.password);
      setAuth(tokenData.access_token, {
        username: values.username,
        full_name: "",
        role: "user",
      });

      const userData = await getMe();
      setAuth(tokenData.access_token, userData);

      toast.success("Đăng nhập thành công");
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("[Login Error]", error);
      toast.error(error instanceof Error ? error.message : "Đăng nhập thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <SurfaceCard className="w-full max-w-md p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
            <LogIn size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white">Đăng nhập HemaVision</h1>
          <p className="mt-2 text-sm text-slate-400">
            Truy cập hệ thống phân tích tế bào máu AI
          </p>
        </div>

        <form 
          method="POST"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit(onSubmit)(e);
          }} 
          className="space-y-5"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Tên đăng nhập</label>
            <input
              {...form.register("username")}
              className="flex h-11 w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              placeholder="admin"
              disabled={isLoading}
            />
            {form.formState.errors.username ? (
              <p className="text-xs text-red-400">{form.formState.errors.username.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Mật khẩu</label>
            <input
              {...form.register("password")}
              type="password"
              className="flex h-11 w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              placeholder="••••••••"
              disabled={isLoading}
            />
            {form.formState.errors.password ? (
              <p className="text-xs text-red-400">{form.formState.errors.password.message}</p>
            ) : null}
          </div>

          <Button type="submit" className="h-11 w-full text-base" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang kiểm tra...
              </>
            ) : (
              "Đăng nhập"
            )}
          </Button>

          <div className="mt-4 text-center">
            <p className="text-xs text-slate-500">
              Mặc định: <code className="text-slate-400">admin</code> /{" "}
              <code className="text-slate-400">admin123</code>
            </p>
          </div>
        </form>
      </SurfaceCard>
    </main>
  );
}
