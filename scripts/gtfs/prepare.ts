/**
 * 배포 빌드용 데이터 준비 — `pnpm build` 앞단에서 실행.
 *
 * data/engine/tokyo-rail.bin이 이미 있으면 아무것도 하지 않는다 (로컬 개발).
 * 없으면 (Vercel 등 클린 빌드 환경): TokyoGTFS zip 다운로드 → 압축 해제 → 파이프라인 실행.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { runPipeline } from "./pipeline";

const GTFS_URL = "https://mkuran.pl/gtfs/tokyo/rail.zip";
const GTFS_DIR = join(process.cwd(), "data/gtfs");
const ZIP_PATH = join(GTFS_DIR, "rail.zip");
const EXTRACT_DIR = join(GTFS_DIR, "extracted");
const BIN_PATH = join(process.cwd(), "data/engine/tokyo-rail.bin");

async function main() {
  if (existsSync(BIN_PATH)) {
    console.log(`시간표 데이터 존재 — 준비 생략 (${BIN_PATH})`);
    return;
  }

  if (!existsSync(ZIP_PATH)) {
    console.log(`TokyoGTFS 다운로드: ${GTFS_URL}`);
    const res = await fetch(GTFS_URL, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`GTFS 다운로드 실패: HTTP ${res.status}`);
    mkdirSync(GTFS_DIR, { recursive: true });
    writeFileSync(ZIP_PATH, new Uint8Array(await res.arrayBuffer()));
  }

  console.log("압축 해제 중…");
  const files = unzipSync(readFileSync(ZIP_PATH));
  mkdirSync(EXTRACT_DIR, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    writeFileSync(join(EXTRACT_DIR, name), data);
  }

  runPipeline();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
