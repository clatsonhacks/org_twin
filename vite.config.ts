import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];
/**
 * The dev-only motion provenance plugin stamps every lowercase JSX tag with data-agent-native-motion-*
 * attributes. In the 3D world those tags are three.js objects (<mesh>, <group>…), and React Three Fiber
 * reads the dashes as a nested property path and fails to create the object. Remove them there.
 */
function threeJsxWithoutProvenance(): Plugin {
  return {
    name: "orgtwin-three-jsx-without-provenance",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]app[\\/]components[\\/]orgtwin[\\/]world[\\/][^\\/]+\.tsx(\?|$)/.test(id)) return null;
      if (!code.includes("data-agent-native-motion-")) return null;
      return { code: code.replace(/ data-agent-native-motion-[a-z-]+="[^"]*"/g, ""), map: null };
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    entries: [
      "app/entry.client.tsx",
      "app/root.tsx",
      "app/components/layout/{Layout,Sidebar}.tsx",
      "app/components/chat/ChatRouteContent.tsx",
      "app/routes/{home,chat.$threadId}.tsx",
      "app/components/orgtwin/world/World.tsx",
    ],
    // The 3D world is lazy-loaded; pre-bundle it so react-reconciler's CommonJS files are converted.
    include: ["three", "@react-three/fiber", "@react-three/drei"],
  },
  plugins: [
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      ssrStubs: ["shiki"],
    }),
    threeJsxWithoutProvenance(),
  ],
});
