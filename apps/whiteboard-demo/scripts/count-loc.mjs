#!/usr/bin/env node
// Recalculates the "With vs. Without Solidus" LOC comparison shown at the
// bottom of the whiteboard demo. Source of truth for src/loc-stats.json —
// rerun this (`npm run loc`) after editing any of the files listed below.
//
// Methodology (see apps/whiteboard-demo/README.md for the full writeup):
//   - LOC = non-blank, non-comment source lines (block + line comments
//     stripped for .ts/.css; .html has none to strip).
//   - "With Solidus": this app's own source (src/main.ts, src/style.css,
//     index.html) — the actual whiteboard, as committed.
//   - "Without Solidus": the same app files (assumed unchanged — the
//     canvas/UI/connection-control code doesn't depend on Solidus) PLUS a
//     MEASURED count of the packages/core source files that actually
//     implement the networking + CRDT/state-sync behavior this demo
//     currently gets from Solidus (traced from main.ts's imports: solidus(),
//     webrtc(), merkleEGWalker(), createState()). This is real, measured
//     code — not a guess — but it is library-grade (handles more generality
//     than this one demo strictly needs, e.g. every Array.prototype method,
//     Map/Set support nothing here uses). A hand-rolled one-off could come
//     in smaller or, if done less carefully, larger; we don't fabricate a
//     trimmed number for that, we label this figure for what it is.
//   - Deliberately excluded from the "equivalent functionality" closure:
//     asset store/reference-tracker, fastcdc/swarm-chunking features, the
//     yjs integration, and networking/server.ts — none of them are
//     exercised by this demo (no assets, no alternate CRDT, no
//     solidus-hosted signaling server; this demo's signaling server is a
//     plain `ws` relay with no Solidus dependency, so it's common
//     infrastructure counted on neither side).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
const demoRoot = join(__dirname, '..');

function stripTsComments(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    let inLine = false;
    let inBlock = false;
    let inStr = null; // '"', "'", or '`'
    while (i < n) {
        const c = src[i];
        const c2 = src[i + 1];
        if (inLine) {
            if (c === '\n') {
                inLine = false;
                out += c;
            }
            i++;
            continue;
        }
        if (inBlock) {
            if (c === '*' && c2 === '/') {
                inBlock = false;
                i += 2;
                continue;
            }
            if (c === '\n') out += c;
            i++;
            continue;
        }
        if (inStr) {
            out += c;
            if (c === '\\') {
                out += src[i + 1] ?? '';
                i += 2;
                continue;
            }
            if (c === inStr) inStr = null;
            i++;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            inStr = c;
            out += c;
            i++;
            continue;
        }
        if (c === '/' && c2 === '/') {
            inLine = true;
            i += 2;
            continue;
        }
        if (c === '/' && c2 === '*') {
            inBlock = true;
            i += 2;
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

function stripCssComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

function countLoc(absPath) {
    const raw = readFileSync(absPath, 'utf8');
    const ext = absPath.slice(absPath.lastIndexOf('.'));
    const stripped =
        ext === '.css' ? stripCssComments(raw) : ext === '.ts' ? stripTsComments(raw) : raw;
    const loc = stripped.split('\n').filter((l) => l.trim().length > 0).length;
    return loc;
}

function countGroup(root, relPaths) {
    const files = relPaths.map((p) => ({ path: p, loc: countLoc(join(root, p)) }));
    const total = files.reduce((sum, f) => sum + f.loc, 0);
    return { files, total };
}

// --- "With Solidus": this demo's own application source ---
const withSolidus = countGroup(demoRoot, ['src/main.ts', 'src/style.css', 'index.html']);

// --- "Without Solidus": measured equivalent-functionality closure in packages/core ---
// Traced from apps/whiteboard-demo/src/main.ts's imports:
//   solidus, webrtc  <- @solidus-p2p/core
//   merkleEGWalker   <- @solidus-p2p/core/state-sync/integrations
const equivalentClosure = countGroup(join(repoRoot, 'packages/core/src'), [
    // solidus() factory: event bus, plugin wiring, createState() call-through
    'index.ts',
    'types.ts',
    // webrtc() + network.create('peer-network'): signaling + WebRTC mesh transport
    'networking/create-networking-plugin.ts',
    'networking/signaling-client.ts',
    'networking/types.ts',
    'networking/webrtc/index.ts',
    'networking/webrtc/peer.ts',
    'networking/webrtc/send-queue.ts',
    'networking/webrtc/transport.ts',
    'networking/webrtc/types.ts',
    // createState(): mutation-tracking proxy -> StateOperation log
    'state-sync/index.ts',
    'state-sync/apply-operation.ts',
    'state-sync/datatypes/array.ts',
    'state-sync/types.ts',
    // merkleEGWalker(): CRDT merge (Merkle DAG, LCA, operational transform)
    'state-sync/integrations/merkle-eg-walker/dag-syncer.ts',
    'state-sync/integrations/merkle-eg-walker/eg-walker.ts',
    'state-sync/integrations/merkle-eg-walker/event-graph.ts',
    'state-sync/integrations/merkle-eg-walker/handlers.ts',
    'state-sync/integrations/merkle-eg-walker/index.ts',
    'state-sync/integrations/merkle-eg-walker/types.ts',
    'state-sync/integrations/merkle-eg-walker/utils.ts',
]);

const withoutSolidusTotal = withSolidus.total + equivalentClosure.total;
const linesSaved = withoutSolidusTotal - withSolidus.total; // === equivalentClosure.total
const percentReduction = (linesSaved / withoutSolidusTotal) * 100;

const result = {
    generatedAt: new Date().toISOString(),
    methodology: {
        unit: 'non-blank, non-comment source lines',
        withSolidus: "This demo's own application source (src/main.ts, src/style.css, index.html).",
        withoutSolidus:
            'withSolidus total + a MEASURED count of the packages/core files that implement the ' +
            'networking + CRDT/state-sync behavior this demo gets from Solidus, traced from its ' +
            "imports (solidus, webrtc, merkleEGWalker, createState). Assumes the app's own " +
            'UI/canvas/connection-control code is unchanged either way. See README.md for the full ' +
            'writeup and known caveats (the measured closure is library-grade, more general than ' +
            'this one demo strictly needs, so a hand-minimized rewrite could differ from it).',
        valueType: 'measured', // both sides are counted from real source files, not guessed
    },
    withSolidus,
    withoutSolidus: {
        appFiles: withSolidus.files,
        equivalentClosure,
        total: withoutSolidusTotal,
    },
    linesSaved,
    percentReduction,
};

console.log(JSON.stringify(result, null, 2));

if (process.argv.includes('--write')) {
    const { writeFileSync } = await import('node:fs');
    const outPath = join(demoRoot, 'src/loc-stats.json');
    writeFileSync(outPath, JSON.stringify(result, null, 4) + '\n');
    console.error(`\nWrote ${outPath}`);
}
