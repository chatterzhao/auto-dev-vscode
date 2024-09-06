import react from "@vitejs/plugin-react-swc";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Change the output .js filename to not include a hash
    rollupOptions: {
      // external: ["vscode-webview"],
      //不要尝试打包 "vscode" 模块，因为它是一个外部依赖，在 VS Code 环境中运行时会提供
      external: ["vscode"],
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
});
