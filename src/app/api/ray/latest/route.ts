import { NextResponse } from "next/server";

const RAY_BASE = "https://lotto.api.rayriffy.com";

export async function GET() {
  try {
    const res = await fetch(`${RAY_BASE}/latest`);
    if (!res.ok)
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: 502 },
      );
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
