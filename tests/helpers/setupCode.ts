import Database from "better-sqlite3";

// The server prints the setup code at boot; e2e tests read it from the database the test server uses.
export function readSetupCode(dbPath = ".data/e2e/nas-cloud.sqlite"): string {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("select code from setup_codes").get() as { code: string } | undefined;
    return row?.code ?? "";
  } finally {
    db.close();
  }
}
