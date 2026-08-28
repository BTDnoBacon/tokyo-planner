/**
 * GTFS용 CSV 파서 (RFC 4180).
 *
 * stop_times.txt가 120MB/121만 행이라 성능이 중요하다 — 따옴표가 없는 행(대부분)은
 * split(",") 빠른 경로로, 따옴표가 있는 행만 문자 단위 파싱으로 처리한다.
 * 따옴표 필드 안의 개행도 지원한다.
 */

export function* parseCsv(content: string): Generator<string[]> {
  const len = content.length;
  let pos = 0;
  while (pos < len) {
    let nl = content.indexOf("\n", pos);
    if (nl === -1) nl = len;
    let line = content.slice(pos, nl);
    if (line.endsWith("\r")) line = line.slice(0, -1);

    if (!line.includes('"')) {
      pos = nl + 1;
      if (line.length > 0) yield line.split(",");
      continue;
    }

    // 따옴표 경로 — 필드 내 개행이 있으면 다음 줄까지 이어서 파싱
    const row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = pos;
    while (i < len) {
      const ch = content[i];
      if (inQuotes) {
        if (ch === '"') {
          if (content[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && content[i + 1] === "\n") i++;
        i++;
        break;
      } else {
        field += ch;
        i++;
      }
    }
    row.push(field);
    pos = i;
    yield row;
  }
}

/** 헤더 행 기반으로 각 행을 컬럼명→값 lookup 함수와 함께 순회 */
export function* parseCsvRecords(
  content: string
): Generator<{ get: (col: string) => string; row: string[] }> {
  let header: Map<string, number> | null = null;
  for (const row of parseCsv(content)) {
    if (header === null) {
      header = new Map(row.map((name, i) => [name.trim(), i]));
      continue;
    }
    const h = header;
    yield {
      row,
      get: (col: string) => {
        const idx = h.get(col);
        return idx === undefined ? "" : (row[idx] ?? "");
      },
    };
  }
}
