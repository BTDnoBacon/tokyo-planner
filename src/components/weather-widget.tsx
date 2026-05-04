import { fetchTokyoWeather } from "@/lib/actions/weather";

export default async function WeatherWidget() {
  const result = await fetchTokyoWeather();

  if (!result.ok) {
    return (
      <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-xs text-zinc-400">
        날씨 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const { temp, feelsLike, description, icon, humidity, city } = result.data;

  return (
    <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-sky-500 font-medium">{city} 현재 날씨</p>
          <div className="flex items-end gap-1 mt-0.5">
            <span className="text-2xl font-semibold text-zinc-800">{temp}°</span>
            <span className="text-xs text-zinc-400 mb-0.5 capitalize">{description}</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://openweathermap.org/img/wn/${icon}@2x.png`}
          alt={description}
          width={48}
          height={48}
          className="opacity-90"
        />
      </div>
      <div className="mt-1 flex gap-3 text-xs text-zinc-400">
        <span>체감 {feelsLike}°</span>
        <span>습도 {humidity}%</span>
      </div>
    </div>
  );
}
