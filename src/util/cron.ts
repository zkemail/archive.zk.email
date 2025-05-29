import cron, { ScheduledTask } from "node-cron";
import { updateJWKeySet } from "@/lib/db";
import { generateJWKWitness } from "@/lib/generateWitness";

let cronTask: ScheduledTask;
let initialized = false;

// Schedule the cron job to update JWKeySet every 5 minutes
export function startJWKCronJob() {
  if (initialized) {
    console.log("Cron job already started.");
    return;
  }

  cron.schedule("*/5 * * * *", async () => {
    console.log("Executing UpdateJWKCronJob...");
    const updatedJwkSet = await updateJWKeySet();
    if (updatedJwkSet) generateJWKWitness(updatedJwkSet);
  });
  initialized = true;
}

startJWKCronJob();