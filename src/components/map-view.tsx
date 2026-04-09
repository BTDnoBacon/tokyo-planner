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
      const result = await geocoderRef.current.geocode({ location: { lat, lng } });
      const addressComponents = result.results[0]?.address_components;

      // 가장 구체적인 이름 우선 (점포명 > 동네명 > 구명)
      const name =
        addressComponents?.find((c) =>
          c.types.includes("point_of_interest") ||
          c.types.includes("establishment") ||
          c.types.includes("premise")
        )?.long_name ??
        addressComponents?.find((c) =>
          c.types.includes("sublocality_level_2") ||
          c.types.includes("sublocality_level_1")
        )?.long_name ??
        result.results[0]?.formatted_address?.split(",")[0] ??
        `장소 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      addPlace({ name, lat, lng, stayMinutes: 60 });
    },
    [addPlace]
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
