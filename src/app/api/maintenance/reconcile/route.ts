import { NextResponse } from "next/server";
import { requireMaintenanceAuth } from "@/lib/server/auth/maintenance";
import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { reconcileStorage } from "@/lib/server/indexer";

// Keeps a request bounded when a large drop needs hashing; the rest is picked up by the next run.
const RECONCILE_BUDGET_MS = 20_000;

export async function POST(request: Request) {
  const auth = await requireMaintenanceAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await reconcileStorage({
      db: getDatabase(),
      storageRoot: appConfig.storageRoot,
      budgetMs: RECONCILE_BUDGET_MS
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "reconcile failed" }, { status: 503 });
  }
}
