// Pin the base path so @tailwindcss/postcss resolves `@import "tailwindcss"`
// (and @source paths) from this project's node_modules. It otherwise falls
// back to process.cwd(), which under Turbopack resolves to the parent
// directory and fails with "Can't resolve 'tailwindcss'".
const config = {
  plugins: {
    "@tailwindcss/postcss": {
      base: import.meta.dirname,
    },
  },
};

export default config;
