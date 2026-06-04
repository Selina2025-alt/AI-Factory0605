import type { Metadata } from "next";

import AgentTopNav from "@/components/app-shell/agent-top-nav";

import "./content-creation-globals.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent内容工厂",
  description: "内容采集选题与内容创作分发一体化工作台"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="agent-shell">
          <AgentTopNav />
          <main className="agent-shell__content">{children}</main>
        </div>
      </body>
    </html>
  );
}
