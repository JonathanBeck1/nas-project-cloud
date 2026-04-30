import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { scanStorageRoot } from "@/lib/server/indexer";

const result = await scanStorageRoot({
  db: getDatabase(),
  storageRoot: appConfig.storageRoot
});

console.log(`Scanned ${result.scanned} files, indexed ${result.indexed} new files.`);
