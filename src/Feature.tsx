import { useEffect, useState } from "react";
import type { MeshConfig, YRoom } from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Fix = { name: string; lat: number; lon: number; accuracy: number; ts: number };
type Crumb = { lat: number; lon: number; ts: number };
type Checkpoint = { lat: number; lon: number; radius: number; label: string };

const NAME_KEY = (prefix: string) => `${prefix}:displayName`;
const SHARE_KEY = (prefix: string) => `${prefix}:sharing`;
const COLORS = ["#6366f1", "#22d3ee", "#a3e635", "#f472b6", "#fb923c", "#facc15"];
const MIN_CRUMB_DISTANCE_M = 15;

function colorFor(peerId: string): string {
  let h = 0;
  for (let i = 0; i < peerId.length; i++) h = (h * 31 + peerId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="rt-screen">
        <h1>route share</h1>
        <p className="rt-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [sharing, setSharing] = useState(
    () => localStorage.getItem(SHARE_KEY(config.storagePrefix)) === "1",
  );
  const [permError, setPermError] = useState<string | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    localStorage.setItem(SHARE_KEY(config.storagePrefix), sharing ? "1" : "0");
  }, [sharing, config.storagePrefix]);

  useEffect(() => {
    const fixes = room.doc.getMap<Fix>("fixes");
    const trails = room.doc.getMap<Crumb[]>("trails");
    const meta = room.doc.getMap<Checkpoint>("meta");
    const onChange = () => rerender((n) => n + 1);
    fixes.observe(onChange);
    trails.observe(onChange);
    meta.observe(onChange);
    return () => {
      fixes.unobserve(onChange);
      trails.unobserve(onChange);
      meta.unobserve(onChange);
    };
  }, [room]);

  const fixes = room.doc.getMap<Fix>("fixes");
  const trails = room.doc.getMap<Crumb[]>("trails");
  const meta = room.doc.getMap<Checkpoint>("meta");
  const checkpoint = meta.get("checkpoint") ?? null;

  // Geolocation watch
  useEffect(() => {
    if (!sharing || !name.trim()) {
      fixes.delete(room.peerId);
      return;
    }
    if (!("geolocation" in navigator)) {
      setPermError("geolocation not supported");
      setSharing(false);
      return;
    }
    setPermError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: Fix = {
          name: name.trim(),
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        fixes.set(room.peerId, fix);
        const trail = (trails.get(room.peerId) ?? []).slice();
        const last = trail[trail.length - 1];
        if (!last || haversine(last, { lat: fix.lat, lon: fix.lon }) >= MIN_CRUMB_DISTANCE_M) {
          trail.push({ lat: fix.lat, lon: fix.lon, ts: fix.ts });
          if (trail.length > 300) trail.shift();
          trails.set(room.peerId, trail);
        }
      },
      (err) => {
        setPermError(err.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      fixes.delete(room.peerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, name, room]);

  const fixList: Array<Fix & { peerId: string }> = [];
  fixes.forEach((v, k) => fixList.push({ ...v, peerId: k }));
  fixList.sort((a, b) => a.name.localeCompare(b.name));

  // Map projection
  const W = 360;
  const H = 320;
  const lats: number[] = [];
  const lons: number[] = [];
  fixList.forEach((f) => {
    lats.push(f.lat);
    lons.push(f.lon);
  });
  trails.forEach((trail) => {
    trail.forEach((c) => {
      lats.push(c.lat);
      lons.push(c.lon);
    });
  });
  if (checkpoint) {
    lats.push(checkpoint.lat);
    lons.push(checkpoint.lon);
  }

  let project = (_lat: number, _lon: number) => ({ x: 0, y: 0 });
  if (lats.length > 0) {
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const dLat = maxLat - minLat || 0.001;
    const dLon = maxLon - minLon || 0.001;
    const pad = 0.15;
    const lo = minLon - dLon * pad;
    const hi = maxLon + dLon * pad;
    const lo2 = minLat - dLat * pad;
    const hi2 = maxLat + dLat * pad;
    project = (lat, lon) => ({
      x: ((lon - lo) / (hi - lo)) * W,
      y: H - ((lat - lo2) / (hi2 - lo2)) * H,
    });
  }

  const setCheckpointHere = () => {
    const myFix = fixes.get(room.peerId);
    if (!myFix) return;
    meta.set("checkpoint", {
      lat: myFix.lat,
      lon: myFix.lon,
      radius: 50,
      label: "checkpoint",
    });
  };

  const clearCheckpoint = () => meta.delete("checkpoint");

  const clearMyTrail = () => trails.delete(room.peerId);

  // who has reached the checkpoint
  const atCheckpoint = checkpoint
    ? fixList
        .map((f) => ({
          peerId: f.peerId,
          name: f.name,
          dist: haversine(f, checkpoint),
        }))
        .filter((x) => x.dist <= checkpoint.radius)
    : [];

  return (
    <div className="rt-screen">
      <header className="rt-header">
        <h1>route share</h1>
        <p className="rt-status">
          {fixList.length} {fixList.length === 1 ? "person" : "people"} sharing ·{" "}
          {room.peerCount + 1} present
        </p>
      </header>

      <div className="rt-privacy">
        <p>
          opt-in. routes are kept in-memory in the mesh — close all tabs and it's gone. nothing
          leaves the device except via the peer mesh.
        </p>
      </div>

      <div className="rt-controls">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          maxLength={48}
          aria-label="your name"
          className="rt-name-input"
        />
        <button
          type="button"
          className={`rt-share ${sharing ? "is-on" : ""}`}
          onClick={() => setSharing((s) => !s)}
          disabled={!name.trim()}
        >
          {sharing ? "✓ sharing" : "share my route"}
        </button>
      </div>

      {permError && <p className="rt-error">⚠ {permError}</p>}

      <div className="rt-map">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <rect width={W} height={H} fill="#0e1117" />

          {checkpoint &&
            (() => {
              const c = project(checkpoint.lat, checkpoint.lon);
              return (
                <g key="cp">
                  <circle cx={c.x} cy={c.y} r={14} fill="rgba(99,102,241,0.18)" />
                  <circle cx={c.x} cy={c.y} r={5} fill="#6366f1" />
                  <text x={c.x + 9} y={c.y - 7} fill="rgba(255,255,255,0.7)" fontSize="10">
                    ⚑ {checkpoint.label}
                  </text>
                </g>
              );
            })()}

          {Array.from(trails.entries()).map(([peerId, trail]) => {
            if (!trail || trail.length < 2) return null;
            const pts = trail.map((c) => project(c.lat, c.lon));
            const d = pts
              .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(" ");
            return (
              <path
                key={peerId}
                d={d}
                fill="none"
                stroke={colorFor(peerId)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            );
          })}

          {fixList.map((f) => {
            const p = project(f.lat, f.lon);
            const me = f.peerId === room.peerId;
            return (
              <g key={f.peerId}>
                <circle cx={p.x} cy={p.y} r={me ? 7 : 5} fill={colorFor(f.peerId)} />
                <text
                  x={p.x + 9}
                  y={p.y + 4}
                  fill="#e5e7eb"
                  fontSize="11"
                  fontWeight={me ? 700 : 400}
                >
                  {f.name}
                  {me ? " (you)" : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rt-actions">
        <button type="button" onClick={setCheckpointHere} disabled={!fixes.get(room.peerId)}>
          ⚑ set checkpoint here
        </button>
        {checkpoint && (
          <button type="button" onClick={clearCheckpoint}>
            clear checkpoint
          </button>
        )}
        <button type="button" onClick={clearMyTrail}>
          clear my trail
        </button>
      </div>

      {checkpoint && (
        <section className="rt-checkpoint-status">
          <h2 className="rt-section-title">at checkpoint ({checkpoint.radius}m radius)</h2>
          {atCheckpoint.length === 0 ? (
            <p className="rt-empty">nobody there yet</p>
          ) : (
            <ul>
              {atCheckpoint.map((c) => (
                <li key={c.peerId}>
                  ✓ {c.name} ({Math.round(c.dist)}m)
                </li>
              ))}
            </ul>
          )}
          {atCheckpoint.length === fixList.length && fixList.length > 0 && (
            <p className="rt-all-here">🎉 everyone's at the checkpoint!</p>
          )}
        </section>
      )}
    </div>
  );
}
