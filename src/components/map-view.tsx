"use client";

import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaces } from "@/lib/places-context";

const TOKYO_CENTER = { lat: 35.6762, lng: 139.6503 };
const MAP_ID = "tokyo-planner-map";

/** 이름을 못 얻었을 때의 통일된 폴백 (검색·POI·지도 클릭 공용) */
function fallbackPlaceName(lat: number, lng: number): string {
  return `장소 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

// 장소 검색 — Places Autocomplete. 선택하면 장소 추가 + 지도 이동
function PlaceSearch() {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const { addPlace, activeDayIndex } = usePlaces();
  const [notFound, setNotFound] = useState(false);

  // 비동기 콜백이 "검색 시점"의 일차에 기록하도록
  const dayRef = useRef(activeDayIndex);
  useEffect(() => {
    dayRef.current = activeDayIndex;
  }, [activeDayIndex]);

  useEffect(() => {
    if (!placesLib || !map || !inputRef.current) return;
    const service = new placesLib.PlacesService(map);
    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["name", "geometry.location"],
      // 도쿄권 편향 (엄격 제한은 아님 — 근교 검색 허용)
      bounds: new google.maps.LatLngBounds({ lat: 35.4, lng: 139.3 }, { lat: 35.95, lng: 140.1 }),
    });

    const commit = (loc: google.maps.LatLng, name: string | undefined, day: number) => {
      addPlace({ name: name ?? fallbackPlaceName(loc.lat(), loc.lng()), lat: loc.lat(), lng: loc.lng() }, day);
      map.panTo(loc);
      if ((map.getZoom() ?? 0) < 14) map.setZoom(15);
      if (inputRef.current) inputRef.current.value = "";
      setNotFound(false);
    };

    const listener = autocomplete.addListener("place_changed", () => {
      const day = dayRef.current;
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (loc) {
        commit(loc, place.name, day);
        return;
      }
      // 제안 선택 없이 Enter — 입력 텍스트로 검색 폴백
      const query = place.name?.trim();
      if (!query) return;
      service.findPlaceFromQuery(
        { query, fields: ["name", "geometry.location"], locationBias: map.getCenter() ?? undefined },
        (results, status) => {
          const found = results?.[0]?.geometry?.location;
          if (status === google.maps.places.PlacesServiceStatus.OK && found) {
            commit(found, results![0].name, day);
          } else {
            setNotFound(true);
          }
        }
      );
    });
    return () => {
      listener.remove();
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [placesLib, map, addPlace]);

  if (!placesLib) return null;
  return (
    <div className="absolute top-3 left-1/2 z-10 w-64 -translate-x-1/2 md:w-80">
      <input
        ref={inputRef}
        type="text"
        placeholder="🔍 장소 검색 (예: 시부야 스카이)"
        onInput={() => setNotFound(false)}
        className="w-full rounded-full border border-zinc-200 bg-white/95 px-4 py-2 text-sm shadow-md outline-none focus:border-red-400 transition-colors"
      />
      {notFound && (
        <p className="mt-1 rounded-full bg-white/95 px-3 py-1 text-center text-xs text-red-400 shadow">
          검색 결과가 없습니다
        </p>
      )}
    </div>
  );
}

function MapClickHandler() {
  const map = useMap();
  const geocodingLib = useMapsLibrary("geocoding");
  const placesLib = useMapsLibrary("places");
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const { addPlace, activeDayIndex } = usePlaces();

  useEffect(() => {
    if (geocodingLib) {
      geocoderRef.current = new geocodingLib.Geocoder();
    }
  }, [geocodingLib]);

  useEffect(() => {
    if (placesLib && map) {
      placesServiceRef.current = new placesLib.PlacesService(map);
    }
  }, [placesLib, map]);

  const handleClick = useCallback(
    async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;

      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const day = activeDayIndex; // 클릭 시점의 일차 — 비동기 응답이 늦어도 여기에 기록

      // POI(가게·명소) 클릭이면 기본 정보창을 항상 억제하고, 가능하면 실제 장소 이름 조회
      const placeId = (e as google.maps.IconMouseEvent).placeId;
      if (placeId) {
        e.stop();
        if (placesServiceRef.current) {
          placesServiceRef.current.getDetails(
            { placeId, fields: ["name", "geometry.location"] },
            (place, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && place?.name) {
                const loc = place.geometry?.location;
                addPlace({ name: place.name, lat: loc?.lat() ?? lat, lng: loc?.lng() ?? lng }, day);
              } else {
                console.warn("Places getDetails 실패:", status);
                addPlace({ name: fallbackPlaceName(lat, lng), lat, lng }, day);
              }
            }
          );
          return;
        }
        // places 라이브러리 미로드 — 지오코딩 폴백으로 계속
      }

      if (!geocoderRef.current) {
        addPlace({ name: fallbackPlaceName(lat, lng), lat, lng }, day);
        return;
      }

      // geocode()는 ZERO_RESULTS 등에서 reject — 좌표 이름 폴백으로 처리
      let results: google.maps.GeocoderResult[] = [];
      try {
        results = (await geocoderRef.current.geocode({ location: { lat, lng } })).results;
      } catch {
        /* 결과 없음/쿼터 초과 — 아래 폴백 이름 사용 */
      }
      const allComponents = results.flatMap(
        (r: google.maps.GeocoderResult) => r.address_components,
      );

      const poiName = allComponents.find(
        (c: google.maps.GeocoderAddressComponent) =>
          c.types.includes("establishment") || c.types.includes("point_of_interest"),
      )?.long_name;

      const sublocalityName = allComponents.find(
        (c: google.maps.GeocoderAddressComponent) =>
          c.types.includes("sublocality_level_2"),
      )?.long_name;

      const localityName = allComponents.find(
        (c: google.maps.GeocoderAddressComponent) =>
          c.types.includes("locality"),
      )?.long_name;

      const name = poiName ?? sublocalityName ?? localityName ?? fallbackPlaceName(lat, lng);

      addPlace({ name, lat, lng }, day);
    },
    [addPlace, activeDayIndex],
  );

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("click", handleClick);
    return () => listener.remove();
  }, [map, handleClick]);

  return null;
}

function PlaceMarkers() {
  const { places } = usePlaces();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  return (
    <>
      {places.map((place) => (
        <AdvancedMarker
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
        >
          <div
            className="relative flex flex-col items-center"
            onMouseEnter={() => setHoveredId(place.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {hoveredId === place.id && (
              <div className="absolute bottom-full mb-1.5 whitespace-nowrap rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs text-white shadow-lg pointer-events-none z-10">
                {place.name}
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
              </div>
            )}
            {/* 커스텀 핀 — Pin 컴포넌트 대신 div로 구현해 mouse 이벤트 정상 작동 */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 border-2 border-red-700 text-white text-xs font-bold shadow-md">
              {place.order}
            </div>
            <div className="w-0.5 h-2 bg-red-700" />
            <div className="w-1.5 h-1.5 rounded-full bg-red-700" />
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
}

// 전철 구간 폴리라인 (자체 엔진 결과, 노선색)
function TransitPathRenderers() {
  const map = useMap();
  const { transitPaths } = usePlaces();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;
    const polylines: google.maps.Polyline[] = [];
    Object.values(transitPaths).forEach((paths) => {
      paths.forEach((path) => {
        polylines.push(
          new google.maps.Polyline({
            map,
            path: path.points,
            strokeColor: path.color,
            strokeWeight: 4,
            strokeOpacity: 0.85,
          })
        );
      });
    });
    polylinesRef.current = polylines;
    return () => {
      polylines.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, transitPaths]);

  return null;
}

// 저장된 DirectionsResult를 지도에 렌더링
function RouteRenderers() {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const { directionsResults } = usePlaces();
  const renderersRef = useRef<globalThis.Map<string, google.maps.DirectionsRenderer>>(new globalThis.Map());

  useEffect(() => {
    if (!map || !routesLib) return;

    const currentKeys = new Set(Object.keys(directionsResults));
    const existingKeys = new Set(renderersRef.current.keys());

    // 삭제된 경로 renderer 제거
    existingKeys.forEach((key) => {
      if (!currentKeys.has(key)) {
        renderersRef.current.get(key)?.setMap(null);
        renderersRef.current.delete(key);
      }
    });

    // 새 경로 renderer 추가/업데이트
    currentKeys.forEach((key) => {
      const dirResult = directionsResults[key];
      if (!renderersRef.current.has(key)) {
        const renderer = new routesLib.DirectionsRenderer({
          suppressMarkers: true, // 핀은 PlaceMarkers에서 표시
          polylineOptions: {
            strokeColor: "#3b82f6",
            strokeWeight: 4,
            strokeOpacity: 0.8,
          },
        });
        renderer.setMap(map);
        renderersRef.current.set(key, renderer);
      }
      renderersRef.current.get(key)!.setDirections(dirResult);
    });

    const renderers = renderersRef.current;
    return () => {
      renderers.forEach((r) => r.setMap(null));
      renderers.clear();
    };
  }, [map, routesLib, directionsResults]);

  return null;
}

export default function MapView() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId={MAP_ID}
        defaultCenter={TOKYO_CENTER}
        defaultZoom={13}
        disableDefaultUI={false}
        gestureHandling="greedy"
        className="w-full h-full"
      >
        <PlaceSearch />
        <MapClickHandler />
        <PlaceMarkers />
        <RouteRenderers />
        <TransitPathRenderers />
      </Map>
    </APIProvider>
  );
}
