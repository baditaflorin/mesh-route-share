import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-route-share",
  description: "Live route sharing with breadcrumb trails and checkpoint detection",
  accentHex: "#6366f1",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
