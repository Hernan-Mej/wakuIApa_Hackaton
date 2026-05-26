import { useState } from "react";
import { apiFetch } from "../api/client";
import type { GeocodeResult } from "../api/types";
import { colors, inputStyle, labelStyle, monoFont } from "../styles";

interface Props {
  latitude: number;
  longitude: number;
  address: string;
  onChange: (next: { latitude: number; longitude: number; address: string }) => void;
}

export default function LocationPicker({ latitude, longitude, address, onChange }: Props) {
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  async function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoMsg("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoStatus("loading");
    setGeoMsg("Obteniendo ubicación…");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const r = await apiFetch<GeocodeResult>(
            `/api/geocode/reverse?lat=${lat}&lon=${lon}`,
          );
          onChange({ latitude: lat, longitude: lon, address: r.display_name });
          setGeoStatus("ok");
          setGeoMsg(`Ubicación detectada (±${Math.round(pos.coords.accuracy)}m)`);
        } catch {
          onChange({ latitude: lat, longitude: lon, address });
          setGeoStatus("ok");
          setGeoMsg(`Coordenadas obtenidas. (No se pudo resolver dirección.)`);
        }
      },
      (err) => {
        setGeoStatus("error");
        const reason =
          err.code === 1 ? "Diste permiso denegado a la geolocalización." :
          err.code === 2 ? "Posición no disponible en este momento." :
          err.code === 3 ? "Se agotó el tiempo de espera." :
          err.message;
        setGeoMsg(reason);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function doSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    try {
      const results = await apiFetch<GeocodeResult[]>(
        `/api/geocode/forward?q=${encodeURIComponent(searchQuery)}`,
      );
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function pickResult(r: GeocodeResult) {
    onChange({ latitude: r.lat, longitude: r.lon, address: r.display_name });
    setSearchResults([]);
    setSearchQuery("");
    setGeoStatus("ok");
    setGeoMsg("Dirección elegida del buscador.");
  }

  const statusColor =
    geoStatus === "ok" ? colors.success :
    geoStatus === "error" ? colors.danger :
    geoStatus === "loading" ? colors.info : colors.textMuted;

  return (
    <div style={{
      padding: 14,
      background: colors.surfaceStrong,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12, gap: 10, flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 11, color: colors.textMuted, fontFamily: monoFont,
          letterSpacing: "1.5px", textTransform: "uppercase",
        }}>
          📍 Ubicación
        </span>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoStatus === "loading"}
          style={{
            background: colors.accentSoft,
            border: `1px solid ${colors.accentBorder}`,
            color: colors.accent,
            borderRadius: 8,
            padding: "6px 12px",
            cursor: geoStatus === "loading" ? "wait" : "pointer",
            fontSize: 12, fontWeight: 600,
            fontFamily: "inherit",
            opacity: geoStatus === "loading" ? 0.6 : 1,
          }}
        >
          {geoStatus === "loading" ? "📡 Obteniendo…" : "📍 Usar mi ubicación"}
        </button>
      </div>

      {/* Búsqueda por dirección */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearch())}
          placeholder="Buscar dirección (ej: 'Centro Histórico Riohacha')"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={doSearch}
          disabled={searchLoading || searchQuery.trim().length < 2}
          style={{
            background: colors.surfaceInput,
            border: `1px solid ${colors.borderStrong}`,
            color: colors.text,
            borderRadius: 8,
            padding: "0 14px",
            cursor: searchLoading ? "wait" : "pointer",
            fontFamily: "inherit", fontSize: 13,
            opacity: searchLoading || searchQuery.trim().length < 2 ? 0.5 : 1,
          }}
        >
          🔎
        </button>
      </div>

      {searchResults.length > 0 && (
        <div style={{
          marginBottom: 10,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          maxHeight: 180, overflowY: "auto",
        }}>
          {searchResults.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickResult(r)}
              style={{
                width: "100%", textAlign: "left", display: "block",
                background: "transparent", border: "none",
                borderBottom: i < searchResults.length - 1 ? `1px solid ${colors.border}` : "none",
                color: colors.text, padding: "8px 10px",
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}

      {/* Manual lat/lon */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Latitud</label>
          <input
            type="number" step="0.0001" value={latitude}
            onChange={(e) => onChange({ latitude: Number(e.target.value), longitude, address })}
            style={inputStyle}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={labelStyle}>Longitud</label>
          <input
            type="number" step="0.0001" value={longitude}
            onChange={(e) => onChange({ latitude, longitude: Number(e.target.value), address })}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Dirección (referencia)</label>
        <input
          type="text" value={address}
          onChange={(e) => onChange({ latitude, longitude, address: e.target.value })}
          placeholder="Ej: Barrio Cangrejito, Riohacha"
          style={inputStyle}
        />
      </div>

      {geoMsg && (
        <div style={{
          marginTop: 10, fontSize: 11, color: statusColor, fontFamily: monoFont,
        }}>
          {geoMsg}
        </div>
      )}
    </div>
  );
}
