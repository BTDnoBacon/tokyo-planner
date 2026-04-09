"use server";

interface CurrencyResult {
  rate: number;      // 1 KRW → JPY
  updatedAt: string; // 업데이트 시각 (ISO)
}

type CurrencyResponse =
  | { ok: true; data: CurrencyResult }
  | { ok: false; error: string };

export async function fetchKrwToJpy(): Promise<CurrencyResponse> {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "API 키가 설정되지 않았습니다." };
  }

  try {
    const res = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/pair/KRW/JPY`,
      { next: { revalidate: 3600 } } // 1시간 캐시
    );

    if (!res.ok) {
      return { ok: false, error: `환율 API 오류 (${res.status})` };
    }

    const json = await res.json();

    if (json.result !== "success") {
      return { ok: false, error: json["error-type"] ?? "알 수 없는 오류" };
    }

    return {
      ok: true,
      data: {
        rate: json.conversion_rate,
        updatedAt: json.time_last_update_utc,
      },
    };
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했습니다." };
  }
}
