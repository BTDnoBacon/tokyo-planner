"use client";

import { useState } from "react";

interface Props {
  rate: number; // 1 KRW → JPY
}

export default function CurrencyCalculator({ rate }: Props) {
  const [krw, setKrw] = useState("");

  const jpy =
    krw !== "" && !isNaN(Number(krw))
      ? Math.round(Number(krw) * rate)
      : null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            min={0}
            value={krw}
            onChange={(e) => setKrw(e.target.value)}
            placeholder="원화 입력"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-400 transition-colors"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
            KRW
          </span>
        </div>
      </div>

      {jpy !== null && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5">
          <span className="text-sm font-semibold text-zinc-800">
            ¥{jpy.toLocaleString()}
          </span>
          <span className="text-xs text-zinc-400">JPY</span>
        </div>
      )}
    </div>
  );
}
