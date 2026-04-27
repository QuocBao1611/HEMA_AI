export type NavigationItem = {
  href: string;
  label: string;
  eyebrow: string;
  description: string;
};

export const workspaceNavigation: NavigationItem[] = [
  {
    href: "/",
    label: "Phân tích",
    eyebrow: "01",
    description: "Trạm điều khiển chính cho ca phân tích mới.",
  },
  {
    href: "/compare",
    label: "So sánh",
    eyebrow: "02",
    description: "Đối chiếu nhiều model trên cùng một ảnh smear.",
  },
  {
    href: "/dashboard",
    label: "Lịch sử",
    eyebrow: "03",
    description: "Tổng quan hệ thống, lịch sử và sức khỏe vận hành.",
  },
  {
    href: "/guide",
    label: "Hướng dẫn",
    eyebrow: "04",
    description: "Hướng dẫn quy trình, checklist và cách đọc kết quả.",
  },
];

export const secondaryNavigation: NavigationItem[] = [
  {
    href: "/login",
    label: "Đăng nhập",
    eyebrow: "AUTH",
    description: "Xác thực người dùng hệ thống.",
  },
  {
    href: "/admin",
    label: "Quản trị",
    eyebrow: "OPS",
    description: "Khu vực quản trị hệ thống và cấu hình.",
  },
];
