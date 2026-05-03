import { runPreviewWorker } from "@/lib/server/previews/worker";

const result = await runPreviewWorker();
console.log(JSON.stringify(result, null, 2));
