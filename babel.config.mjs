export default function (api) {
  const isCJS = api.env("cjs");

  api.cache(true);

  return {
    presets: [
      ["@babel/preset-env", { modules: isCJS ? "commonjs" : false }],
      ["@babel/preset-react", { runtime: "automatic" }],
      ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./src"],
          alias: {
            "@": "./src",
          },
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      ],
      ["inline-import", { extensions: [".glsl"] }],
    ],
    ignore: ["**/*.test.tsx", "**/*.stories.tsx"],
  };
}
