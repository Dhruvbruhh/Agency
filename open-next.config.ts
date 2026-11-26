import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: the root layout is force-dynamic, so there is no ISR/SSG data to store.
export default defineCloudflareConfig({});
