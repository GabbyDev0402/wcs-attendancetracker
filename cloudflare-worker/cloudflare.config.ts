/**
 * Reference Cloudflare Worker Configuration for `wsi-media-worker`.
 * Documents the exact R2 bucket binding, Cron Trigger, environment variable,
 * and observability settings deployed to Cloudflare.
 */
export default {
  name: "wsi-media-worker",
  main: "src/index.js",
  compatibilityDate: "2026-11-27",
  vars: {
    FIREBASE_PROJECT_ID: "wcs-attendance-tracker"
  },
  r2Buckets: [
    {
      binding: "MEDIA_BUCKET",
      bucketName: "washingtonschool"
    }
  ],
  triggers: {
    // Runs every day at 18:00 UTC = 2:00 AM Manila time
    crons: ["0 18 * * *"]
  },
  observability: {
    enabled: true,
    traces: {
      enabled: true
    }
  }
};
