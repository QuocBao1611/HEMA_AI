import { RevealNavbar } from "@/components/layout/reveal-navbar";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-14%] top-[-10%] h-[460px] w-[460px] rounded-full bg-red-900/18 blur-[120px]" />
        <div className="absolute bottom-[-16%] right-[-12%] h-[520px] w-[520px] rounded-full bg-red-700/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_28%),linear-gradient(180deg,#090203_0%,#120405_42%,#050101_100%)]" />
      </div>

      <div className="relative min-h-screen">
        <RevealNavbar />
        <div className="min-h-screen bg-black/44 backdrop-blur-xl">
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
