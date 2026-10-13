import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Feature-Sliced Design import rules.
 *
 * Layers, from lowest to highest:  shared < entities < features < widgets < views
 * (`app/` is the Next.js routing layer and may import anything through public APIs).
 *  - A layer may only import from layers BELOW it.
 *  - Slices are used through their public API (`@/entities/room`), never their internals
 *    (`@/entities/room/ui/...`). The one extra entry point is `server`, for code that
 *    must never reach a client bundle.
 */
const LAYERS = ["shared", "entities", "features", "widgets", "views"];

const forbidUpward = (layer) => {
  const above = LAYERS.slice(LAYERS.indexOf(layer) + 1);
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...above.map((upper) => ({
              group: [`@/${upper}`, `@/${upper}/*`],
              message: `FSD: "${layer}" must not import from the higher layer "${upper}".`,
            })),
            ...(layer === "shared"
              ? []
              : [
                  {
                    group: ["@/*/*/*", "!@/*/*/server", "!@/shared/**"],
                    message:
                      "FSD: import a slice through its public API (index.ts or server.ts).",
                  },
                ]),
          ],
        },
      ],
    },
  };
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...LAYERS.slice(0, -1).map(forbidUpward),
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
