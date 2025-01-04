import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NextAuthProvider } from "./session-provider";
import { startJWKCronJob, stopCronJob } from "@/util/cron";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DKIM Archive",
  description: "DKIM archive website",
};

const DevModeNotice: React.FC = () => {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  return (
    <span
      style={{
        color: "white",
        backgroundColor: "orange",
        paddingLeft: "0.5rem",
        paddingRight: "0.5rem",
        marginLeft: "1rem",
      }}
    >
      development
    </span>
  );
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // To ensure it runs only on the server side
  if (typeof window === "undefined") {  
    // console.log("Starting UpdateJWKCronJob...");
    startJWKCronJob();

    // Handles graceful termination of cron job.
    process.on("SIGINT", () => {
      console.log("Received SIGINT. Gracefully shutting down...");
      stopCronJob();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("Received SIGTERM. Gracefully shutting down...");
      stopCronJob();
      process.exit(0);
    });
  }
  
  return (
    <html lang="en">
      <NextAuthProvider>
        <body className={inter.className} style={{ margin: 0, overflowY: "scroll" }}>
          <header
            style={{
              background: "#fcfdfe",
              padding: "0.5rem",
              borderBottom: "1px solid #aaa",
              display: "flex",
            }}
          >
            <Link href="/" className="defaultcolor" style={{ display: "flex", fontWeight: 600 }} prefetch={false}>
              <img
                src="/proof_of_email_logo_cropped.png"
                alt="Proof of Email logotype"
                style={{ width: "2.5rem", paddingRight: "0.5rem" }}
              />
              DKIM Archive
            </Link>
            <DevModeNotice />
          </header>
          <main style={{ margin: "0.5rem", alignItems: "center", display: "flex", flexDirection: "column" }}>
            <div style={{ maxWidth: "50rem" }}>{children}</div>
          </main>
        </body>
      </NextAuthProvider>
    </html>
  );
}
