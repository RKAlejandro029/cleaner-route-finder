"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CleanerRoute } from "@/types/route";
import { GeoPoint } from "@/types/booking";
import { stopLocation, stopLabel } from "@/lib/route-analysis/buildRoutes";

const AZ_CENTER: [number, number] = [-111.65, 33.55]; // roughly Phoenix/Mesa area

type Props = {
  routes: CleanerRoute[];
  newProperty: { location: GeoPoint; address: string } | null;
  previewGeometry?: GeoPoint[] | null;
  previewColor?: string;
  onMarkerDrag?: (location: GeoPoint) => void;
};

export default function RouteMap({
  routes,
  newProperty,
  previewGeometry,
  previewColor,
  onMarkerDrag,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const newMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap: free, no API key required, includes roads/labels/
      // places like a normal street map. "liberty" is their general-
      // purpose style (closest visually to Google/Apple Maps).
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: AZ_CENTER,
      zoom: 9,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw routes (markers + line geometry) whenever routes change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      routes.forEach((route) => {
        route.stops.forEach((stop, idx) => {
          const loc = stopLocation(stop);
          const el = document.createElement("div");
          el.style.width = "22px";
          el.style.height = "22px";
          el.style.borderRadius = "50%";
          el.style.background = route.color;
          el.style.border = "2px solid white";
          el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.color = "white";
          el.style.fontSize = "10px";
          el.style.fontWeight = "600";
          el.textContent = String(idx + 1);

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 14 }).setText(
                `${route.teamLabel}: ${stopLabel(stop)}`
              )
            )
            .addTo(map);
          markersRef.current.push(marker);
        });

        // Route line — prefer the real road-network geometry fetched
        // from OpenRouteService; fall back to a straight line between
        // stops only if that geometry isn't available (e.g. routing
        // failed for this team).
        const lineCoords = route.geometry
          ? route.geometry.map((p) => [p.lng, p.lat])
          : route.stops.map((s) => {
              const loc = stopLocation(s);
              return [loc.lng, loc.lat];
            });
        const sourceId = `route-${route.teamKey}`;
        const geoJson: GeoJSON.Feature = {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: lineCoords },
        };

        if (map.getSource(sourceId)) {
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geoJson);
        } else if (lineCoords.length >= 2) {
          map.addSource(sourceId, { type: "geojson", data: geoJson });
          map.addLayer({
            id: sourceId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": route.color,
              "line-width": 3,
              "line-opacity": 0.7,
            },
          });
        }
      });

      // Fit bounds to all points
      const allPoints = routes.flatMap((r) => r.stops.map(stopLocation));
      if (newProperty) allPoints.push(newProperty.location);
      const firstPoint = allPoints[0];
      if (firstPoint) {
        const bounds = allPoints.reduce(
          (b, p) => b.extend([p.lng, p.lat]),
          new maplibregl.LngLatBounds([firstPoint.lng, firstPoint.lat], [firstPoint.lng, firstPoint.lat])
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 300 });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [routes]);

  // Preview geometry (insertion candidate route)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const sourceId = "preview-route";
      if (!previewGeometry || previewGeometry.length < 2) {
        if (map.getLayer(sourceId)) map.removeLayer(sourceId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        return;
      }

      const geoJson: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: previewGeometry.map((p) => [p.lng, p.lat]),
        },
      };

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geoJson);
      } else {
        map.addSource(sourceId, { type: "geojson", data: geoJson });
        map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": previewColor ?? "#facc15",
            "line-width": 4,
            "line-dasharray": [1, 1],
          },
        });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [previewGeometry, previewColor]);

  // Draggable new-property marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!newProperty) {
      newMarkerRef.current?.remove();
      newMarkerRef.current = null;
      return;
    }

    if (!newMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "26px";
      el.style.height = "26px";
      el.style.borderRadius = "50% 50% 50% 0";
      el.style.transform = "rotate(-45deg)";
      el.style.background = "#facc15";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";

      newMarkerRef.current = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([newProperty.location.lng, newProperty.location.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(newProperty.address))
        .addTo(map);

      newMarkerRef.current.on("dragend", () => {
        const lngLat = newMarkerRef.current!.getLngLat();
        onMarkerDrag?.({ lat: lngLat.lat, lng: lngLat.lng });
      });
    } else {
      newMarkerRef.current.setLngLat([newProperty.location.lng, newProperty.location.lat]);
    }

    map.flyTo({ center: [newProperty.location.lng, newProperty.location.lat], zoom: 12, duration: 400 });
  }, [newProperty]);

  return <div ref={containerRef} className="w-full h-full min-h-[320px] rounded-lg overflow-hidden" />;
}
