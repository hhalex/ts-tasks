import typescript from 'rollup-plugin-typescript2';

export default {
    input: `src/index.ts`,
    output: [
      { file: "lib/index.js", name: "pledge-ts", format: 'umd', sourcemap: true }
    ],
    // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
    external: [],
    watch: {
      include: 'src/**',
    },
    plugins: [
      // Compile TypeScript files
      typescript({ useTsconfigDeclarationDir: true })
    ],
  }