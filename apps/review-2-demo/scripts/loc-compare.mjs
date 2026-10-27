// Measures the actual line-count cost of each implementation by counting
// non-blank, non-comment lines in the real, unmodified entry point of each
// demo. Run with `npm run loc` whenever either main.ts changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function countLines(path) {
    const lines = readFileSync(path, 'utf-8').split('\n');
    let code = 0;
    let comment = 0;
    let blank = 0;

    for (const raw of lines) {
        const line = raw.trim();
        if (line === '') {
            blank++;
        } else if (line.startsWith('//')) {
            comment++;
        } else {
            code++;
        }
    }

    return { total: lines.length, code, comment, blank };
}

const withSolidusPath = join(here, '..', 'src', 'main.ts');
const withoutSolidusPath = join(here, '..', '..', 'review-2-demo-raw', 'src', 'main.ts');

const withSolidus = countLines(withSolidusPath);
const withoutSolidus = countLines(withoutSolidusPath);
const locSaved = withoutSolidus.code - withSolidus.code;
const reductionPct = (locSaved / withoutSolidus.code) * 100;

const data = {
    generatedAt: new Date().toISOString(),
    withSolidus,
    withoutSolidus,
    locSaved,
    reductionPct,
};

writeFileSync(join(here, '..', 'src', 'loc-data.json'), JSON.stringify(data, null, 2));
console.log(data);
