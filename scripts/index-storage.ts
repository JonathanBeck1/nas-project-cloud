import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { reconcileStorage } from "@/lib/server/indexer";

const result = await reconcileStorage({
  db: getDatabase(),
  storageRoot: appConfig.storageRoot
});

console.log(
  `Scanned ${result.scanned} files: ${result.indexed} indexed, ${result.relinked} relinked, ${result.restored} restored, ${result.missing} missing, ${result.deferred} deferred.`
);
