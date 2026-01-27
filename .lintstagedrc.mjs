export default {
    "*.{j,t}s": ["eslint --no-warn-ignored", "prettier --write"],
    "src/schemas/{*,**/*}.ts": [() => "tsc -b -v", () => "node scripts/schema.js", () => "node scripts/openapi.js"],
};
