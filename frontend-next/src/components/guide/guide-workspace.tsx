"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  FileImage,
  Microscope,
  Scale,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";

const workflowSteps = [
  {
    icon: FileImage,
    title: "1. Tiêu chuẩn ảnh đầu vào",
    desc: "Tối ưu nhất với ảnh Smear nhuộm Giemsa. Lựa chọn khu vực 'vùng làm việc' (working area) nơi tế bào rải đều, ít bị chồng lấp lên nhau.",
  },
  {
    icon: Microscope,
    title: "2. Pipeline 2 Bước (Detect & Classify)",
    desc: "Hệ thống kết hợp bộ phát hiện YOLO và bộ phân loại CNN/ONNX. Kích thước tế bào rác <18px hoặc background >25% ảnh sẽ tự động bị loại bỏ.",
  },
  {
    icon: Scale,
    title: "3. Tinh chỉnh & So sánh",
    desc: "Bạn có thể chỉnh Ngưỡng tin cậy (Threshold) để lọc kết quả. Dùng tab 'So sánh' để đối chiếu trực tiếp hiệu năng giữa 2 phiên bản AI khác nhau.",
  },
];

const bestPractices = [
  {
    icon: Zap,
    title: "Tối ưu Hiệu năng (NMS)",
    desc: "Backend đã được tăng tốc bằng C++ cv2.dnn.NMSBoxes. Khuyên dùng ảnh đã resize sẵn (tối đa 1536px) để tránh hiện tượng tràn RAM khi phân tích hàng ngàn bounding boxes.",
  },
  {
    icon: ShieldCheck,
    title: "An toàn & Bảo mật",
    desc: "Toàn bộ thuật toán được chạy Local (FastAPI). File tải lên được quét bằng Magic Bytes để tránh mã độc và tự động xoá sau khi phiên làm việc kết thúc.",
  },
];

const faqItems = [
  {
    q: "Hệ thống có tự động lưu lịch sử phân tích không?",
    a: "Hiện tại để bảo mật và tối đa hóa tốc độ xử lý, kết quả tạm lưu trên RAM của trình duyệt (mất khi F5). Bạn có thể dùng tính năng 'Xuất PDF Report' để lưu trữ vĩnh viễn.",
  },
  {
    q: "Bounding box thỉnh thoảng khoanh vùng toàn bộ nền?",
    a: "Lỗi này (False Positive khổng lồ) đã được khắc phục tự động bằng thuật toán Adaptive Max Area (25%). Nếu bạn vẫn gặp rác nhỏ, hãy nâng nhẹ 'Ngưỡng tin cậy' lên 0.25.",
  },
  {
    q: "Trang so sánh Model hoạt động như thế nào?",
    a: "Trong quá trình train, Model A có thể giỏi bắt RBC nhưng kém WBC. Chức năng so sánh đặt 2 Model lên bàn cân trên cùng 1 bức ảnh duy nhất để bạn có góc nhìn trực quan.",
  },
];

export function GuideWorkspace() {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070101] pt-32 pb-20 px-6 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl space-y-12">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
            <BookOpen className="h-4 w-4" /> HEMA-AI Documentation
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Làm chủ công cụ phân tích
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            Khám phá luồng làm việc chuẩn mực, các tuỳ chỉnh nâng cao và nắm rõ các giới hạn của thuật toán AI trong chẩn đoán huyết học.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/">
              <Button size="lg">Bắt đầu phân tích</Button>
            </Link>
            <Link href="/compare">
              <Button size="lg" variant="secondary">So sánh Model</Button>
            </Link>
          </div>
        </div>

        {/* Workflow */}
        <section>
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white">Quy trình chuẩn mực</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {workflowSteps.map((step, i) => (
              <SurfaceCard key={i} className="p-6 transition-all hover:border-red-500/30 hover:shadow-lg dark:hover:shadow-red-500/5">
                <div className="mb-5 inline-flex rounded-2xl bg-red-100 p-3.5 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {step.desc}
                </p>
              </SurfaceCard>
            ))}
          </div>
        </section>

        {/* Best Practices */}
        <section className="grid gap-6 md:grid-cols-2">
          {bestPractices.map((bp, i) => (
            <SurfaceCard key={i} className="p-6 bg-white/50 dark:bg-white/[0.02]">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-slate-200 p-3.5 dark:bg-white/10">
                  <bp.icon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{bp.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {bp.desc}
                  </p>
                </div>
              </div>
            </SurfaceCard>
          ))}
        </section>

        {/* FAQ Section */}
        <section>
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white">Câu hỏi thường gặp</h2>
          <SurfaceCard className="p-2">
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {faqItems.map((item, index) => {
                const isActive = activeFaq === index;
                return (
                  <div key={index} className="overflow-hidden">
                    <button
                      onClick={() => setActiveFaq(isActive ? null : index)}
                      className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                    >
                      <span className="font-semibold text-slate-900 dark:text-white">{item.q}</span>
                      <ChevronDown
                        className={`h-5 w-5 text-slate-500 transition-transform ${isActive ? "rotate-180 text-red-500" : ""}`}
                      />
                    </button>
                    {isActive && (
                      <div className="px-5 pb-5 pt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </section>
      </div>
    </div>
  );
}
