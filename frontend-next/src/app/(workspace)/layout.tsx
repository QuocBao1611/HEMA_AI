import { RevealNavbar } from "@/components/layout/reveal-navbar";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-foreground transition-colors duration-500">



      <div className="relative min-h-screen">
        <RevealNavbar />
        <div className="min-h-screen transition-colors duration-500">
          <main>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
