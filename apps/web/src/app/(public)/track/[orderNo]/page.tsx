// apps/web/src/app/(public)/track/[orderNo]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const STATUS_STEPS = [
  { key: "PENDING",          label: "Order placed" },
  { key: "CONFIRMED",        label: "Confirmed" },
  { key: "PICKED_UP",        label: "Picked up" },
  { key: "IN_TRANSIT",       label: "In transit" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED",        label: "Delivered" },
];

interface TrackingData {
  orderNo: string;
  status: string;
  type: string;
  eta?: string;
  pickup: { address: string; actual?: string };
  delivery: { address: string; actual?: string };
  driver?: { name: string; phone: string };
  events: { status: string; message: string; lat?: number; lng?: number; ts: string }[];
  liveLocation?: { lat: number; lng: number };
}

export default function TrackingPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  // Use 'any' to avoid needing @types/google.maps
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/tracking/${orderNo}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLivePos(d.liveLocation ?? null); })
      .catch(() => setError("Order not found. Please check the tracking number."))
      .finally(() => setLoading(false));
  }, [orderNo]);

  useEffect(() => {
    if (!data) return;
    if (!["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(data.status)) return;
    const es = new EventSource(`/api/tracking/${orderNo}/stream`);
    es.onmessage = (e) => {
      try {
        const ping = JSON.parse(e.data);
        if (ping.lat && ping.lng) setLivePos({ lat: ping.lat, lng: ping.lng });
      } catch {}
    };
    return () => es.close();
  }, [data?.status, orderNo]);

  useEffect(() => {
    if (!mapRef.current || !data) return;
    if (typeof window === "undefined" || !(window as any).google) return;
    const g = (window as any).google;
    const deliveryCoords = data.liveLocation ?? { lat: 3.1390, lng: 101.6869 };
    mapInstance.current = new g.maps.Map(mapRef.current, {
      center: deliveryCoords, zoom: 14,
      disableDefaultUI: true, zoomControl: true,
    });
    markerRef.current = new g.maps.Marker({
      position: deliveryCoords,
      map: mapInstance.current,
    });
  }, [data]);

  useEffect(() => {
    if (!livePos || !markerRef.current || !mapInstance.current) return;
    const g = (window as any).google;
    const pos = new g.maps.LatLng(livePos.lat, livePos.lng);
    markerRef.current.setPosition(pos);
    mapInstance.current.panTo(pos);
  }, [livePos]);

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === data?.status);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unknown error"} />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">L</div>
        <span className="font-semibold text-sm">LogiTrack MY</span>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Tracking</p>
            <h1 className="text-2xl font-mono font-bold text-blue-400">{data.orderNo}</h1>
          </div>
          <StatusBadge status={data.status} />
        </div>

        {data.eta && data.status !== "DELIVERED" && (
          <div className="rounded-xl bg-blue-950 border border-blue-800 p-4 flex items-center gap-4">
            <div className="text-blue-400 text-2xl">📦</div>
            <div>
              <p className="text-xs text-blue-400 font-medium">Estimated delivery</p>
              <p className="text-lg font-semibold text-white">
                {new Date(data.eta).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}
              </p>
            </div>
          </div>
        )}

        {data.status === "DELIVERED" && (
          <div className="rounded-xl bg-green-950 border border-green-800 p-4 flex items-center gap-4">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-semibold text-green-400">Delivered!</p>
              <p className="text-sm text-green-600">
                {data.delivery.actual ? new Date(data.delivery.actual).toLocaleString("en-MY") : "Delivery complete"}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <div className="flex items-start">
            {STATUS_STEPS.map((step, i) => (
              <div key={step.key} className="flex-1 flex flex-col items-center relative">
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`absolute top-4 left-1/2 w-full h-0.5 ${i < currentStepIdx ? "bg-blue-600" : "bg-gray-700"}`} />
                )}
                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                  ${i < currentStepIdx ? "bg-blue-600 text-white" : i === currentStepIdx ? "bg-blue-500 text-white ring-4 ring-blue-900" : "bg-gray-800 text-gray-600 border border-gray-700"}`}>
                  {i < currentStepIdx ? "✓" : i + 1}
                </div>
                <p className={`text-center mt-2 text-xs ${i <= currentStepIdx ? "text-gray-300" : "text-gray-600"} hidden sm:block`}>
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {livePos && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Live location</p>
            <div ref={mapRef} className="w-full h-56 rounded-xl bg-gray-800 overflow-hidden" />
          </div>
        )}

        <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
          <div className="p-4 flex gap-3">
            <span className="text-yellow-500 mt-0.5">●</span>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Picked up from</p>
              <p className="text-sm text-gray-300">{data.pickup.address}</p>
            </div>
          </div>
          <div className="p-4 flex gap-3">
            <span className="text-green-500 mt-0.5">●</span>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Delivering to</p>
              <p className="text-sm text-gray-300">{data.delivery.address}</p>
            </div>
          </div>
        </div>

        {data.driver && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-semibold text-sm">
                {data.driver.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-sm">{data.driver.name}</p>
                <p className="text-xs text-gray-500">Your driver</p>
              </div>
            </div>
            <a href={`tel:${data.driver.phone}`}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-4 py-2 rounded-lg">
              📞 Call
            </a>
          </div>
        )}

        {data.events.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Tracking history</p>
            <div className="space-y-1">
              {[...data.events].reverse().map((ev, i) => (
                <div key={i} className="flex gap-4 py-3 border-b border-gray-900 last:border-0">
                  <div className="text-right min-w-[80px]">
                    <p className="text-xs text-gray-600">
                      {new Date(ev.ts).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 ${i === 0 ? "bg-blue-500" : "bg-gray-700"}`} />
                  </div>
                  <p className="text-sm text-gray-400 flex-1 pt-0.5">{ev.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-900 text-yellow-400",
    CONFIRMED: "bg-blue-900 text-blue-400",
    PICKED_UP: "bg-purple-900 text-purple-400",
    IN_TRANSIT: "bg-cyan-900 text-cyan-400",
    OUT_FOR_DELIVERY: "bg-emerald-900 text-emerald-400",
    DELIVERED: "bg-green-900 text-green-400",
    FAILED_ATTEMPT: "bg-red-900 text-red-400",
    RETURNED: "bg-gray-800 text-gray-400",
  };
  return (
    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${colors[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Loading tracking info…</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm space-y-4">
        <p className="text-4xl">📭</p>
        <h2 className="text-xl font-semibold text-gray-200">Tracking not found</h2>
        <p className="text-gray-500 text-sm">{message}</p>
      </div>
    </div>
  );
}
