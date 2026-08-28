/**
 * 배포 빌드용 데이터 준비 — `pnpm build` 앞단에서 실행.
 *
 * data/engine/tokyo-rail.bin이 이미 있으면 아무것도 하지 않는다 (로컬 개발).
 * 없으면 (Vercel 등 클린 빌드 환경): TokyoGTFS zip 다운로드 → 압축 해제 → 파이프라인 실행.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";
import { runPipeline } from "./pipeline";
import { deserializeTimetable } from "../../src/lib/engine/format";

const GTFS_URL = "https://mkuran.pl/gtfs/tokyo/rail.zip";
const GTFS_DIR = join(process.cwd(), "data/gtfs");
const ZIP_PATH = join(GTFS_DIR, "rail.zip");
const EXTRACT_DIR = join(GTFS_DIR, "extracted");
const BIN_PATH = join(process.cwd(), "data/engine/tokyo-rail.bin");

/** 기존 bin의 서비스 캘린더가 아직 유효한지 — 만료·손상 시 재생성 유도 */
function binIsFresh(): boolean {
  try {
    const tt = deserializeTimetable(readFileSync(BIN_PATH));
    const jst = new Date(Date.now() + 9 * 3600 * 1000);
    const today =
      jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate();
    const maxEnd = Math.max(...tt.services.map((s) => s.endDate));
    if (maxEnd < today) {
      console.log(`시간표 데이터 만료 (서비스 종료일 ${maxEnd} < 오늘 ${today}) — 재생성`);
      return false;
    }
    return true;
  } catch {
    console.log("시간표 데이터 손상 — 재생성");
    return false;
  }
}

async function main() {
  const hadBin = existsSync(BIN_PATH);
  if (hadBin && binIsFresh()) {
    console.log(`시간표 데이터 유효 — 준비 생략 (${BIN_PATH})`);
    return;
  }

  // bin이 있었는데 만료/손상이면 로컬 zip도 오래된 것 — 새로 받는다
  if (!existsSync(ZIP_PATH) || hadBin) {
    console.log(`TokyoGTFS 다운로드: ${GTFS_URL}`);
    const res = await fetch(GTFS_URL, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`GTFS 다운로드 실패: HTTP ${res.status}`);
    mkdirSync(GTFS_DIR, { recursive: true });
    writeFileSync(ZIP_PATH, new Uint8Array(await res.arrayBuffer()));
  }

  console.log("압축 해제 중…");
  const files = unzipSync(readFileSync(ZIP_PATH));
  mkdirSync(EXTRACT_DIR, { recursive: true });
  const extractRoot = resolve(EXTRACT_DIR);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const dest = resolve(EXTRACT_DIR, name);
    // zip-slip 방어: 항목 경로가 추출 디렉토리를 벗어나면 거부
    if (dest !== extractRoot && !dest.startsWith(extractRoot + sep)) {
      throw new Error(`zip 항목이 추출 경로를 벗어남: ${name}`);
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
  }

  runPipeline();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
