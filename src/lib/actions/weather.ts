"use server";

interface WeatherResult {
  temp: number;       // 섭씨
  feelsLike: number;
  description: string;
  icon: string;       // OpenWeatherMap 아이콘 코드
  humidity: number;
  city: string;
}

type WeatherResponse =
  | { ok: true; data: WeatherResult }
  | { ok: false; error: string };

export async function fetchTokyoWeather(): Promise<WeatherResponse> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "API 키가 설정되지 않았습니다." };
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=Tokyo&units=metric&lang=kr&appid=${apiKey}`,
      { next: { revalidate: 1800 } } // 30분 캐시
    );

    if (!res.ok) {
      return { ok: false, error: `날씨 API 오류 (${res.status})` };
    }

    const json = await res.json();

    return {
      ok: true,
      data: {
        temp: Math.round(json.main.temp),
        feelsLike: Math.round(json.main.feels_like),
        description: json.weather[0].description,
        icon: json.weather[0].icon,
        humidity: json.main.humidity,
        city: json.name,
      },
    };
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했습니다." };
  }
}
