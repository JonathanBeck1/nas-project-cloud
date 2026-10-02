import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { reconcileStorage } from "@/lib/server/indexer";

async function main() {
  // Someone ran this on purpose, after copying files in; don't make them wait out the background quiet period.
  const result = await reconcileStorage({
    db: getDatabase(),
    storageRoot: appConfig.storageRoot,
    quietMs: 0
  });

  console.log(
    `Scanned ${result.scanned} files: ${result.indexed} indexed, ${result.relinked} relinked, ${result.restored} restored, ${result.missing} missing, ${result.deferred} deferred.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
