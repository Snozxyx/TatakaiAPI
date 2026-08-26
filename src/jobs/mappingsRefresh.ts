import "dotenv/config";
import { ingestFribbMappings } from "../services/mapping/fribbIngest.js";

async function main() {
  const result = await ingestFribbMappings();
  console.log("mappings refreshed", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});