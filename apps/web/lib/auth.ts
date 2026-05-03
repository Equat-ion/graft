import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID!,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
    },
  },
  plugins: [
    organization({
      sendInvitationEmail: async (data) => {
        if (!process.env.RESEND_API_KEY) return;
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "noreply@graft.dev",
          to: data.email,
          subject: `You've been invited to ${data.organization.name} on Graft`,
          html: `
            <p>Hi,</p>
            <p><strong>${data.inviter.user.name}</strong> has invited you to join <strong>${data.organization.name}</strong> on Graft.</p>
            <p><a href="${process.env.BETTER_AUTH_URL}/org/invite/${data.id}">Accept Invitation</a></p>
          `,
        });
      },
    }),
  ],
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    "https://graft-wraap.vercel.app",
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
