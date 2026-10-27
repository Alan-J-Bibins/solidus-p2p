// Counts real lines of application code in the two Review 2 source copies
// and writes the result to src/loc-data.json for the UI to display.
//
// Methodology: each app's `index.html` loads only `src/main.ts`
// (`<script type="module" src="/src/main.ts">`) — neither app's `main.ts`
// imports `./p2p`. So `src/p2p.ts` is dead/orphaned code in BOTH source
// trees (verified by grepping for "p2p" in both main.ts files — zero
// matches). Counting it on both sides would be "consistent" but would
// inflate both numbers with code that never actually runs, so the measured
// comparison is `src/main.ts` only — the file each app's own index.html
// actually executes. `p2p.ts` is still measured and reported below,但
// but explicitly marked excluded from the headline number, for
// transparency rather than silently deleting it.
//
// Blank lines and comment-only lines (a line that is only `// ...`, or a
// line fully inside a `/* ... */` block) are excluded from the "code"
// count. A trailing inline comment on a code line (`const x = 1; // note`)
// does NOT get stripped — the whole line counts as code on both sides,
// applied identically. HTML, CSS, tsconfig and package.json are
// configuration/markup, not application logic, and are excluded from both
// sides equally. Neither app has a test file to include or exclude.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(root, '..', 'review-2-source');

function countFile(filePath) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    let blank = 0;
    let comment = 0;
    let inBlockComment = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (line === '') {
            blank++;
            continue;
        }
        if (inBlockComment) {
            comment++;
            if (line.includes('*/')) inBlockComment = false;
            continue;
        }
        if (line.startsWith('//')) {
            comment++;
            continue;
        }
        if (line.startsWith('/*')) {
            comment++;
            if (!line.includes('*/')) inBlockComment = true;
            continue;
        }
    }
    const total = lines.length;
    return { total, blank, comment, code: total - blank - comment };
}

function countImpl(name, files) {
    const perFile = files.map((relPath) => {
        const result = countFile(path.join(base, name, relPath));
        return { file: relPath, ...result };
    });
    const totals = perFile.reduce(
        (acc, f) => ({
            total: acc.total + f.total,
            blank: acc.blank + f.blank,
            comment: acc.comment + f.comment,
            code: acc.code + f.code,
        }),
        { total: 0, blank: 0, comment: 0, code: 0 },
    );
    return { files: perFile, ...totals };
}

const MEASURED_FILES = ['src/main.ts'];
const EXCLUDED_FILES = ['src/p2p.ts'];

const withSolidus = countImpl('with-solidus', MEASURED_FILES);
const withoutSolidus = countImpl('without-solidus', MEASURED_FILES);
const withSolidusExcluded = countImpl('with-solidus', EXCLUDED_FILES);
const withoutSolidusExcluded = countImpl('without-solidus', EXCLUDED_FILES);

const locSaved = withoutSolidus.code - withSolidus.code;
const reductionPct = withoutSolidus.code > 0 ? (locSaved / withoutSolidus.code) * 100 : null;

const output = {
    generatedAt: new Date().toISOString(),
    methodology:
        'Counts src/main.ts only — the file each app\'s own index.html actually loads (<script type="module" src="/src/main.ts">). Neither app\'s main.ts imports ./p2p, so src/p2p.ts is dead code on both sides and is excluded from the headline number (reported separately below for transparency). Blank lines and comment-only lines are excluded from the "code" count; a trailing inline comment on a code line does not get stripped. HTML/CSS/tsconfig/package.json are configuration, not application logic, and are excluded from both sides equally.',
    withSolidus,
    withoutSolidus,
    locSaved,
    reductionPct,
    excludedDeadCode: {
        note: 'src/p2p.ts in each review-2-source copy — present in both source trees but never imported by main.ts or referenced by index.html. Not counted above; shown here so the exclusion is auditable, not hidden.',
        withSolidus: withSolidusExcluded,
        withoutSolidus: withoutSolidusExcluded,
    },
};

console.log(JSON.stringify(output, null, 2));

import { writeFileSync } from 'node:fs';
writeFileSync(
    path.join(root, '..', 'src', 'loc-data.json'),
    JSON.stringify(output, null, 2) + '\n',
);
console.log('\nWrote src/loc-data.json');
