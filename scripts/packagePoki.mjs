import { deflateRawSync } from 'node:zlib';
import {
    cp,
    mkdir,
    readFile,
    readdir,
    rename,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.join(projectRoot, '.next-poki');
const submissionDir = path.join(projectRoot, 'builds-submission');
const stagedBuildDir = path.join(submissionDir, 'poki');
const archivePath = path.join(submissionDir, 'worldguessr-poki.zip');
const temporaryArchivePath = `${archivePath}.tmp`;

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
}

function crc32(buffer) {
    let value = 0xffffffff;
    for (const byte of buffer) {
        value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
}

function assertSafeOutputPath(candidate) {
    const relative = path.relative(submissionDir, candidate);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Refusing to replace unsafe output path: ${candidate}`);
    }
}

function toDosTimestamp(date) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime =
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
}

// public/music-96k/ is the mobile app's low-bitrate music mirror — web builds
// (Poki included) stream the full-quality masters from music/, so shipping the
// mirror would add ~24MB of dead audio to the zip.
const excludedArchiveDirs = new Set(['music-96k']);

async function collectFiles(directory, prefix = '') {
    const files = [];
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const archiveName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (excludedArchiveDirs.has(archiveName)) continue;

        if (entry.isDirectory()) {
            files.push(...(await collectFiles(absolutePath, archiveName)));
        } else if (entry.isFile()) {
            files.push({ absolutePath, archiveName });
        } else {
            throw new Error(`Unsupported file type in Poki export: ${absolutePath}`);
        }
    }

    return files;
}

// CSS url() references resolve relative to the CSS FILE's directory, not the
// document. Next emits font/media refs as `url(_next/static/media/...)` (or
// `/`- or `./`-prefixed), which from `_next/static/css/` resolves to the bogus
// `_next/static/css/_next/static/media/...` — every font and Leaflet icon
// 404s on Poki's nested per-deploy path. Rewrite them to `../media/...`,
// which is correct from the css/ directory at ANY hosting depth.
async function rewriteCssMediaUrls(cssDir) {
    const entries = await readdir(cssDir, { withFileTypes: true }).catch(() => []);
    let rewritten = 0;
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.css')) continue;
        const cssPath = path.join(cssDir, entry.name);
        const source = await readFile(cssPath, 'utf8');
        const output = source.replace(
            /url\((['"]?)(?:\.\/|\/)?_next\/static\/media\//g,
            'url($1../media/',
        );
        if (output !== source) {
            await writeFile(cssPath, output);
            rewritten += 1;
        }
    }
    return rewritten;
}

// Prerendered HTML references public assets root-absolutely (src="/loader.webp",
// url("/street2.webp") in _document's inline styles). Under Poki's nested deploy
// folder those resolve to the CDN root and 404. Rewrite them document-relative,
// depth-aware ('./x' at root, '../x' one level down) — but only when the target
// is a real exported file, so route links (href="/leaderboard") stay untouched
// for the client router.
async function rewriteHtmlAbsoluteRefs(stagedDir, archiveNames) {
    let rewrittenFiles = 0;
    for (const name of archiveNames) {
        if (!name.endsWith('.html')) continue;
        const depth = name.split('/').length - 1;
        const prefix = depth === 0 ? './' : '../'.repeat(depth);
        const htmlPath = path.join(stagedDir, name);
        const source = await readFile(htmlPath, 'utf8');
        const output = source.replace(
            /((?:src|href)="|url\("|url\(')\/([^"')]+)/g,
            (match, lead, target) => {
                const clean = target.split(/[?#]/, 1)[0];
                return archiveNames.has(clean) ? `${lead}${prefix}${target}` : match;
            },
        );
        if (output !== source) {
            await writeFile(htmlPath, output);
            rewrittenFiles += 1;
        }
    }
    return rewrittenFiles;
}

function validateEntryPage(entryHtml, archiveNames) {
    const referencedNextAssets = [...entryHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter((url) => /^(?:\.\/|\/)?_next\//.test(url))
        .map((url) => url.replace(/^(?:\.\/|\/)/, '').split(/[?#]/, 1)[0]);

    const missingAssets = referencedNextAssets.filter((asset) => !archiveNames.has(asset));
    if (missingAssets.length > 0) {
        throw new Error(
            `Poki index.html references assets missing from the archive:\n${missingAssets.join('\n')}`,
        );
    }
}

async function createZip(files, destination) {
    if (files.length > 0xffff) {
        throw new Error(`ZIP32 supports at most 65535 files; found ${files.length}`);
    }

    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const file of files) {
        const name = Buffer.from(file.archiveName, 'utf8');
        const data = await readFile(file.absolutePath);
        const compressed = deflateRawSync(data, { level: 9 });
        const useCompression = compressed.length < data.length;
        const contents = useCompression ? compressed : data;
        const compressionMethod = useCompression ? 8 : 0;
        const checksum = crc32(data);
        const fileStat = await stat(file.absolutePath);
        const { dosDate, dosTime } = toDosTimestamp(fileStat.mtime);

        if (name.length > 0xffff || data.length > 0xffffffff || contents.length > 0xffffffff) {
            throw new Error(`File is too large for ZIP32: ${file.archiveName}`);
        }

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(compressionMethod, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(contents.length, 18);
        localHeader.writeUInt32LE(data.length, 22);
        localHeader.writeUInt16LE(name.length, 26);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE((3 << 8) | 20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(compressionMethod, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(contents.length, 20);
        centralHeader.writeUInt32LE(data.length, 24);
        centralHeader.writeUInt16LE(name.length, 28);
        centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);

        localParts.push(localHeader, name, contents);
        centralParts.push(centralHeader, name);
        localOffset += localHeader.length + name.length + contents.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(files.length, 8);
    endRecord.writeUInt16LE(files.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(localOffset, 16);

    if (localOffset > 0xffffffff || centralDirectory.length > 0xffffffff) {
        throw new Error('Poki build is too large for a ZIP32 archive');
    }

    await writeFile(destination, Buffer.concat([...localParts, centralDirectory, endRecord]));
}

for (const outputPath of [stagedBuildDir, archivePath, temporaryArchivePath]) {
    assertSafeOutputPath(outputPath);
}

const exportStats = await stat(exportDir).catch(() => null);
if (!exportStats?.isDirectory()) {
    throw new Error(`Poki export not found at ${exportDir}. Run the Poki Next.js build first.`);
}

await mkdir(submissionDir, { recursive: true });
await rm(stagedBuildDir, { recursive: true, force: true });
await rm(temporaryArchivePath, { force: true });
await cp(exportDir, stagedBuildDir, { recursive: true });

const cssDir = path.join(stagedBuildDir, '_next', 'static', 'css');
const rewrittenCssFiles = await rewriteCssMediaUrls(cssDir);
// Regression gate: no staged CSS may still point at _next/static/media —
// any such ref resolves under css/ and 404s on Poki.
for (const entry of await readdir(cssDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith('.css')) continue;
    const contents = await readFile(path.join(cssDir, entry.name), 'utf8');
    if (/url\((['"]?)(?:\.\/|\/)?_next\/static\/media\//.test(contents)) {
        throw new Error(`CSS still references _next/static/media after rewrite: ${entry.name}`);
    }
}

const files = await collectFiles(stagedBuildDir);
const archiveNames = new Set(files.map((file) => file.archiveName));
if (!archiveNames.has('index.html')) {
    throw new Error('Poki export has no root index.html');
}
if (![...archiveNames].some((name) => name.startsWith('_next/static/'))) {
    throw new Error('Poki export has no _next/static assets');
}
if ([...archiveNames].some((name) => name.includes('\\'))) {
    throw new Error('Poki archive paths must use forward slashes');
}

const rewrittenHtmlFiles = await rewriteHtmlAbsoluteRefs(stagedBuildDir, archiveNames);

validateEntryPage(await readFile(path.join(stagedBuildDir, 'index.html'), 'utf8'), archiveNames);
await createZip(files, temporaryArchivePath);
await rm(archivePath, { force: true });
await rename(temporaryArchivePath, archivePath);

const archiveStats = await stat(archivePath);
console.log(
    `Created ${path.relative(projectRoot, archivePath)} (${files.length} files, ${(
        archiveStats.size /
        1024 /
        1024
    ).toFixed(1)} MiB) with Poki-compatible asset paths (${rewrittenCssFiles} CSS + ${rewrittenHtmlFiles} HTML files rewritten to relative refs).`,
);
