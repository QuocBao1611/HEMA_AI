"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpenCheck,
  ChevronDown,
  ClipboardList,
  Route,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";

const guideSteps = [
  {
    index: "Bước 01",
    title: "Chuẩn bị ảnh",
    description:
      "Ưu tiên ảnh smear rõ nét, ánh sáng cân bằng và tiêu bản có vùng tế bào tách biệt tương đối.",
    bullets: [
      "Nên dùng JPG hoặc PNG cho luồng thao tác thông thường.",
      "Tránh ảnh mờ, rung, quá tối hoặc vùng tế bào chồng lấp dày đặc.",
    ],
  },
  {
    index: "Bước 02",
    title: "Chạy phân tích",
    description:
      "Tại trang chủ, tải ảnh lên, chọn model phù hợp và dùng 'Phân tích slide' để lấy số lượng, nhóm chẩn đoán và cờ cảnh báo.",
    bullets: [
      "'Dự đoán nhanh' phù hợp khi bạn chỉ muốn xem phản ứng của bộ phân loại.",
      "Ngưỡng tin cậy càng cao thì số tế bào được tính càng chặt chẽ hơn.",
    ],
  },
  {
    index: "Bước 03",
    title: "So sánh model",
    description:
      "Vào trang compare khi cần đối chiếu nhiều model trên cùng một bộ crop để đánh giá công bằng hơn.",
    bullets: [
      "Nên chọn ít nhất 2 model để có ý nghĩa so sánh.",
      "Xem đồng thời số lượng phát hiện, tin cậy trung bình và nhãn trội.",
    ],
  },
];

const interpretationRows = [
  {
    title: "Dùng tốt cho",
    text: "Đếm tương đối, xem nhóm trội, hỗ trợ rà soát bất thường trên ảnh smear.",
  },
  {
    title: "Không nên suy ra trực tiếp",
    text: "WBC/uL, RBC M/uL, PLT K/uL hoặc chẩn đoán bệnh học chính thức.",
  },
  {
    title: "Bước tiếp theo hợp lý",
    text: "Kết hợp bác sĩ huyết học, CBC và đối chiếu nhiều ca thật để xây thêm quy tắc lâm sàng.",
  },
];

const faqItems = [
  {
    question: "Tại sao số lượng hiển thị không phải là CBC tuyệt đối?",
    answer:
      "Hệ thống đang đếm tế bào từ ảnh và các vùng cắt phát hiện được. Điều này phù hợp cho tỉ lệ tương đối trong field ảnh, nhưng chưa đủ để quy đổi trực tiếp sang chỉ số xét nghiệm theo thể tích máu.",
  },
  {
    question: "Khi nào nên dùng trang so sánh mô hình?",
    answer:
      "Khi bạn muốn kiểm tra model nào ổn hơn trên cùng một ca, nhất là trong giai đoạn tinh chỉnh hoặc chọn model mặc định.",
  },
  {
    question: "Nếu cơ sở dữ liệu chưa kết nối thì sao?",
    answer:
      "Các route phân tích vẫn có thể chạy, nhưng lịch sử và một số dữ liệu lưu trữ sẽ chưa được ghi lại đến khi cơ sở dữ liệu sẵn sàng.",
  },
];

export function GuideWorkspace() {
  const [activeFaq, setActiveFaq] = useState(0);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <SurfaceCard className="p-8">
          <div className="max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-orange-200/72">
              Hướng Dẫn
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Hướng dẫn sử dụng
            </h1>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/">
              <Button>Mở trang phân tích</Button>
            </Link>
            <Link href="/compare">
              <Button variant="secondary">Đi tới so sánh</Button>
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <div className="mb-4 inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
            <Route className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold text-white">
            Tính Năng Nổi Bật
          </h2>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Viết hoá chuẩn",
              "Nội dung bám route thật",
              "FAQ gọn và dễ quét",
            ].map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200"
              >
                {pill}
              </span>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {guideSteps.map((step, index) => {
          const Icon = index === 0 ? ClipboardList : index === 1 ? BookOpenCheck : ScrollText;

          return (
            <SurfaceCard key={step.title} className="p-6">
              <div className="mb-4 inline-flex rounded-2xl border border-white/10 bg-white/8 p-3 text-orange-300">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
                {step.index}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">{step.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300/78">
                {step.description}
              </p>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-slate-200/82">
                {step.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-orange-300" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SurfaceCard className="p-6">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
              Cách hiểu kết quả
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Nên đọc kết quả như một công cụ sàng lọc từ ảnh.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300/78">
              Hệ thống hiện phù hợp cho sàng lọc và rà soát trên ảnh smear, không
              thay thế CBC định lượng hay kết luận lâm sàng chính thức.
            </p>
          </div>

          <div className="grid gap-3">
            {interpretationRows.map((row) => (
              <div
                key={row.title}
                className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4"
              >
                <h3 className="font-semibold text-white">{row.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-300/78">
                  {row.text}
                </p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden p-0">
          <div className="h-full bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.26),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-200/72">
              Quick Reminder
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Dùng đúng việc, đọc đúng nghĩa.
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-200/82">
              Số lượng và nhóm chẩn đoán được rút ra từ ảnh và crop detector, vì
              vậy giá trị lớn nhất của hệ thống là ở tốc độ rà soát và so sánh,
              không phải thay thế quy trình xét nghiệm định lượng.
            </p>
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard className="p-6">
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
            FAQ
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Câu hỏi thường gặp
          </h2>
        </div>

        <div className="space-y-3">
          {faqItems.map((item, index) => {
            const isActive = activeFaq === index;

            return (
              <article
                key={item.question}
                className={`rounded-[22px] border transition ${
                  isActive
                    ? "border-orange-300/24 bg-orange-400/8"
                    : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(isActive ? -1 : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-white sm:text-base">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-300 transition ${
                      isActive ? "rotate-180 text-orange-200" : ""
                    }`}
                  />
                </button>
                {isActive ? (
                  <div className="px-5 pb-5 text-sm leading-7 text-slate-300/78">
                    {item.answer}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </SurfaceCard>
    </div>
  );
}
