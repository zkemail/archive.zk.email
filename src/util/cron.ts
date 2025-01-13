import cron, { ScheduledTask } from "node-cron";
import { updateJWKeySet } from "@/lib/db";

let cronTask: ScheduledTask;
let initialized = false;

// Schedule the cron job to update JWKeySet every 5 minutes
export function startJWKCronJob() {
  if (initialized) {
    console.log("Cron job already started.");
    return;
  }

  cron.schedule("*/5 * * * *", () => {
    console.log("Executing UpdateJWKCronJob...");
    updateJWKeySet();
  });
  initialized = true;
}

export const stopCronJob = () => {
  if (cronTask) {
    cronTask.stop();
    console.log("Cron job stopped.");
  }
};

startJWKCronJob();