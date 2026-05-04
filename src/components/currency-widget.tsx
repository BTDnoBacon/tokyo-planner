import { fetchKrwToJpy } from "@/lib/actions/currency";
import CurrencyCalculator from "./currency-calculator";

export default async function CurrencyWidget() {
  const result = await fetchKrwToJpy();

  if (!result.ok) {
    return (
      <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-xs text-zinc-400">
        환율 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const { rate, updatedAt } = result.data;
  const updateDate = new Date(updatedAt).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-amber-600 font-medium">KRW → JPY</p>
        <p className="text-xs text-zinc-400">{updateDate} 기준</p>
      </div>
      <p className="text-xs text-zinc-500 mt-0.5">
        100원 = <span className="font-semibold text-zinc-700">¥{(rate * 100).toFixed(2)}</span>
      </p>
      <CurrencyCalculator rate={rate} />
    </div>
  );
}
