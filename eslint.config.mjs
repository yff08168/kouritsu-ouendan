import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 意図的に使わない引数・変数は _ 始まりで明示する
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
      ★別セッションの作業ツリー（2026-09-24）。Claude の Code タブは並行作業を
      `.claude/worktrees/<名前>/` に置き、そこで `next build` が走ると `.next/` ができる。
      上の `.next/**` はリポジトリ直下しか見ないので、**そちらのビルド出力を1,692件のエラーとして拾い、
      `npm run check` が落ちた**（自分の変更とは無関係）。
    */
    ".claude/**",
  ]),
]);

export default eslintConfig;
