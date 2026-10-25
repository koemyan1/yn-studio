import React, { useEffect, useRef } from 'react';
import { mountCinematic, type CineCfg, type CineHandle, type EditHit } from './cinematic/cinematic';
import './cinematic/cinematic.css';

export type { EditHit } from './cinematic/cinematic';
export type CineViewHandle = { open(): void; place(): { sec: string; x: number; y: number } | null };

/* React shell around the framework-free cinematic invitation (envelope, cover and the sections below it).
   `edit` turns on the admin preview editor: every marked element can be hovered and clicked, and the click is reported through `onEdit`
   (the element is highlighted; `selected` is the key the host is currently editing, '' for none). */
export function CinematicView({ cfg, replayKey = 0, onOpen, onOpened, edit = false, selected = '', onEdit, onXform, apiRef }: {
  cfg: CineCfg; replayKey?: number; onOpen?: () => void; onOpened?: () => void;
  edit?: boolean; selected?: string; onEdit?: (hit: EditHit) => void; onXform?: (key: string, patch: Record<string, number | boolean>) => void; apiRef?: React.MutableRefObject<CineViewHandle | null>;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<CineHandle | null>(null);
  const hooks = useRef({ onOpen, onOpened, onEdit, onXform }); hooks.current = { onOpen, onOpened, onEdit, onXform };
  const latest = useRef(cfg); latest.current = cfg;
  const editRef = useRef({ edit, selected }); editRef.current = { edit, selected };
  useEffect(() => {
    if (!host.current) return;
    const h = mountCinematic(host.current, latest.current, { onOpen: () => hooks.current.onOpen?.(), onOpened: () => hooks.current.onOpened?.(), onEdit: hit => hooks.current.onEdit?.(hit), onXform: (k, p) => hooks.current.onXform?.(k, p) });
    handle.current = h;
    if (editRef.current.edit) { h.setEdit(true); if (editRef.current.selected) h.select(editRef.current.selected); }
    if (apiRef) apiRef.current = { open: () => h.open(), place: () => h.place() };
    return () => { h.destroy(); if (handle.current === h) handle.current = null; if (apiRef) apiRef.current = null; };
  }, [replayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } handle.current?.update(cfg); }, [cfg]);
  useEffect(() => { handle.current?.setEdit(edit); if (edit) handle.current?.select(selected || null); }, [edit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (edit) handle.current?.select(selected || null); }, [selected, edit]);
  return <div ref={host} className="cn-host" style={{ position: 'absolute', inset: 0 }} />;
}
