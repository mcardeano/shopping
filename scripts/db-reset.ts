// Deletes the embedded local database; it is recreated (with the demo household) on next start.
import fs from "node:fs";
fs.rmSync(".data", { recursive: true, force: true });
console.log("Local database removed. Start the app to recreate it.");
