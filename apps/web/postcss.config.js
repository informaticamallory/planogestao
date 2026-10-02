import postcssGlobalData from "@csstools/postcss-global-data";
import postcssCustomMedia from "postcss-custom-media";

// Breakpoints oficiais (src/styles/breakpoints.css) disponíveis em todo CSS como `@media (--mobile)`.
export default {
  plugins: [postcssGlobalData({ files: ["./src/styles/breakpoints.css"] }), postcssCustomMedia()],
};
