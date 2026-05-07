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

      const result = await geocoderRef.current.geocode({ location: { lat, lng } });
      const results = result.results;
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

      const name =
        poiName ?? sublocalityName ?? localityName ??
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
  const { places } = usePlaces();
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
        <MapClickHandler />
        <PlaceMarkers />
        <RouteRenderers />
      </Map>
    </APIProvider>
  );
}
