import { NativeConnection, Worker } from "@temporalio/worker";
import { activities } from "./activities.js";

async function main() {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dontopedia";

  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: require.resolve("@dontopedia/workflows/workflows"),
    activities,
  });

  console.log(`[worker] listening on ${address} ns=${namespace} queue=${taskQueue}`);
  await worker.run();
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
