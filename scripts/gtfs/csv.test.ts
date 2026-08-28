import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvRecords } from "./csv";

describe("parseCsv", () => {
  it("기본 행 파싱", () => {
    expect([...parseCsv("a,b,c\n1,2,3\n")]).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("CRLF와 마지막 개행 없는 파일", () => {
    expect([...parseCsv("a,b\r\n1,2")]).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("빈 필드와 trailing 빈 필드", () => {
    expect([...parseCsv("a,,c\n,,\n")]).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("따옴표 필드: 쉼표 포함", () => {
    expect([...parseCsv('name,note\n"신주쿠, 서쪽 출구",x\n')]).toEqual([
      ["name", "note"],
      ["신주쿠, 서쪽 출구", "x"],
    ]);
  });

  it("따옴표 필드: 이스케이프된 따옴표", () => {
    expect([...parseCsv('a\n"say ""hi"""\n')]).toEqual([["a"], ['say "hi"']]);
  });

  it("따옴표 필드: 내부 개행", () => {
    expect([...parseCsv('a,b\n"line1\nline2",x\n')]).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("빈 줄 무시", () => {
    expect([...parseCsv("a\n\n1\n")]).toEqual([["a"], ["1"]]);
  });
});

describe("parseCsvRecords", () => {
  it("헤더 기반 컬럼 접근 + 없는 컬럼은 빈 문자열", () => {
    const rows = [...parseCsvRecords("stop_id,stop_name\nS1,신주쿠\n")];
    expect(rows).toHaveLength(1);
    expect(rows[0].get("stop_name")).toBe("신주쿠");
    expect(rows[0].get("없는컬럼")).toBe("");
  });

  it("헤더 공백 trim", () => {
    const rows = [...parseCsvRecords("stop_id, stop_name\nS1,신주쿠\n")];
    expect(rows[0].get("stop_name")).toBe("신주쿠");
  });
});
