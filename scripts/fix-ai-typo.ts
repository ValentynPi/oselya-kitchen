import { readFileSync, writeFileSync } from "fs";

const p = "src/lib/ai.ts";
let s = readFileSync(p, "utf8");
s = s.replace(', "туцювати"', "");
writeFileSync(p, s);
console.log(s.match(/body: \["обсмажити".*?\]/)?.[0]);
