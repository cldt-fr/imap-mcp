import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["imapflow", "nodemailer", "mailparser"],
};

export default config;
