"use client";

import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useRef } from "react";
import { usePlaces } from "@/lib/places-context";

const TOKYO_CENTER = { lat: 35.6762, lng: 139.6503 };
const MAP_ID = "tokyo-planner-map";

// 클릭 좌표 → 장소명 변환 후 추가
function MapClickHandler() {
  const map = useMap();
  const geocodingLib = useMapsLibrary("geocoding");
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const { addPlace } = usePlaces();

  useEffect(() => {
    if (geocodingLib) {
      geocoderRef.current = new geocodingLib.Geocoder();
    }
  }, [geocodingLib]);

  const handleClick = useCallback(
    async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !geocoderRef.current) return;

      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      // 역지오코딩으로 장소명 가져오기
      const result = await geocoderRef.current.geocode({
        location: { lat, lng },
      });
      const results = result.results;
      const allComponents = results.flatMap(
        (r: google.maps.GeocoderResult) => r.address_components,
      );

      // 1순위: establishment/POI 타입 컴포넌트 이름 (역, 랜드마크 등)
      const poiName = allComponents.find(
        (c: google.maps.GeocoderAddressComponent) =>
          c.types.includes("establishment") ||
          c.types.includes("point_of_interest"),
      )?.long_name;

      // 2순위: sublocality_level_2 (동네명) — 한국어로 오는 경우 우선
      const sublocalityName = allComponents.find(
        (c: google.maps.GeocoderAddressComponent) =>
          c.types.includes("sublocality_level_2"),
      )?.long_name;

      // 3순위: locality (구명)
      const localityName = allComponents.find(
        (c: google.maps.GeocoderAddressComponent) =>
          c.types.includes("locality"),
      )?.long_name;

      const name =
        poiName ??
        sublocalityName ??
        localityName ??
        `장소 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      addPlace({ name, lat, lng, stayMinutes: 60 });
    },
    [addPlace],
  );

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("click", handleClick);
    return () => listener.remove();
  }, [map, handleClick]);

  return null;
}

function PlaceMarkers() {
  const { places, removePlace } = usePlaces();

  return (
    <>
      {places.map((place) => (
        <AdvancedMarker
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
          title={place.name}
        >
          <Pin
            background="#ef4444"
            borderColor="#b91c1c"
            glyphColor="#fff"
            glyph={String(place.order)}
          />
        </AdvancedMarker>
      ))}
    </>
  );
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
        <MapClickHandler />
        <PlaceMarkers />
      </Map>
    </APIProvider>
  );
}
