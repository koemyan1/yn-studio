import React, { useEffect, useRef } from 'react';
import { mountCinematic, type CineCfg, type CineHandle } from './cinematic/cinematic';
import './cinematic/cinematic.css';

/* React shell around the framework-free cinematic invitation (envelope, cover and the sections below it). */
export function CinematicView({ cfg, replayKey = 0, onOpen, onOpened }: { cfg: CineCfg; replayKey?: number; onOpen?: () => void; onOpened?: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<CineHandle | null>(null);
  const hooks = useRef({ onOpen, onOpened }); hooks.current = { onOpen, onOpened };
  const latest = useRef(cfg); latest.current = cfg;
  useEffect(() => {
    if (!host.current) return;
    handle.current = mountCinematic(host.current, latest.current, { onOpen: () => hooks.current.onOpen?.(), onOpened: () => hooks.current.onOpened?.() });
    return () => { handle.current?.destroy(); handle.current = null; };
  }, [replayKey]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } handle.current?.update(cfg); }, [cfg]);
  return <div ref={host} className="cn-host" style={{ position: 'absolute', inset: 0 }} />;
}
