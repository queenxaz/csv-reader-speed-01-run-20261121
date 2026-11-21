// The harness runs `node main.ts` (node 22+). It answers every case in
// /input/cases.json with run() from solve.js and writes the answers, in the
// cases' order, to /output/answers.json. Outside a container,
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.
//
// The answers are streamed to the file one case at a time, so only one
// answer is held at once: writing '[' then each answer's JSON, comma
// separated, then ']' is byte for byte what stringifying the whole array
// of answers would write.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Switch V8's incremental marking off before solve.js loads, so the whole
// parse runs under it (the rules allow an entry to tune V8's flags this way).
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inDir, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

const outPath = join(outDir, 'answers.json');
writeFileSync(outPath, '[');
cases.forEach((c, i) => {
  appendFileSync(outPath, (i === 0 ? '' : ',') + JSON.stringify(run(c.input)));
});
appendFileSync(outPath, ']');
