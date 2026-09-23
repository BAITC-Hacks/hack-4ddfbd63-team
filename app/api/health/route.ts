import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    services: {
      ekt: Boolean(
        process.env.EKT_API_URL &&
          process.env.EKT_API_USER &&
          process.env.EKT_API_PASSWORD,
      ),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
  });
}

