import autoprefixer from "autoprefixer";
import postcss from "rollup-plugin-postcss";

const stylesConfig = {
  input: "src/styles/index.ts",
  output: {
    file: "dist/styles.css",
    format: "esm",
  },
  external: ["react", "react-dom"],
  plugins: [
    postcss({
      extract: true,
      minimize: true,
      sourceMap: true,
      plugins: [autoprefixer],
      inject: false,
    }),
  ],
};

export default [stylesConfig];
