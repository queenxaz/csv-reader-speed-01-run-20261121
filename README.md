# csv-reader, faster

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/queenxaz/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/queenxaz/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: `solve.js` reads a CSV text exactly the
way csv-reader does — same broken-row policy, same `{columns, rows, errors}`
answers — but with indexOf-driven runs instead of one character at a time.
`main.ts` answers every case in `/input/cases.json` and writes
`/output/answers.json`.

Built for the make.fun bounty `csv-reader-speed-01-run-20261121`.
