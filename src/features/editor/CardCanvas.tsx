import type Konva from "konva";
import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image as KImage, Layer, Line, Rect, Shape, Stage, Text as KText, Transformer } from "react-konva";
import type { TemplateConfig } from "@/api/types";
import { Button } from "@/components/ui/button";
import { paintText, type PreparedText, type Scale } from "@/lib/cardPainter";
import { snapPosition, type Guide } from "@/lib/geometry";
import { useEditor } from "@/stores/editorStore";
import { Ruler, RULER_SIZE } from "./Ruler";

export interface ViewOptions {
  snap: boolean;
  gridMm: number;
  showFrames: boolean;
}

interface Props {
  config: TemplateConfig;
  widthPx: number;
  heightPx: number;
  image: HTMLImageElement | null;
  /** Server-rendered card (exact preview). When set, it replaces the base image and canvas text. */
  exactImage: HTMLImageElement | null;
  prepared: ReadonlyMap<string, PreparedText>;
  scale: Scale;
  view: ViewOptions;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 8;

export function CardCanvas({ config, widthPx, heightPx, image, exactImage, prepared, scale, view }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const frames = useRef(new Map<string, Konva.Rect>());
  const gesture = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const [fitted, setFitted] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spaceDown, setSpaceDown] = useState(false);

  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const updatePlaceholder = useEditor((s) => s.updatePlaceholder);

  const { pxPerMm } = scale;
  const card = { w: config.size.width_mm, h: config.size.height_mm, bleed: config.size.bleed_mm };

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(50, e.contentRect.width - RULER_SIZE), h: Math.max(50, e.contentRect.height - RULER_SIZE) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const pad = 32;
    const zoom = Math.min((size.w - pad * 2) / widthPx, (size.h - pad * 2) / heightPx);
    setViewport({ zoom, x: (size.w - widthPx * zoom) / 2, y: (size.h - heightPx * zoom) / 2 });
  }, [size, widthPx, heightPx]);

  useEffect(() => {
    if (!fitted && size.w > 50) {
      fit();
      setFitted(true);
    }
  }, [fit, fitted, size.w]);
  useEffect(() => setFitted(false), [widthPx, heightPx]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) =>
    setViewport((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const p = stageRef.current?.getPointerPosition();
      zoomAt(Math.exp(-e.evt.deltaY * 0.01), p?.x, p?.y);
    } else {
      setViewport((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  // Attach the transformer to the selected frame.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const p = config.placeholders.find((q) => q.id === selectedId);
    const node = selectedId ? frames.current.get(selectedId) : undefined;
    tr.nodes(node && p && !p.locked ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, config.placeholders]);

  const others = useMemo(
    () => (id: string) =>
      config.placeholders.filter((p) => p.id !== id && !p.hidden).map((p) => ({ x: p.x_mm, y: p.y_mm, w: p.box.width_mm, h: p.box.height_mm })),
    [config.placeholders],
  );

  const snapOpts = { grid: view.gridMm, tolMm: 6 / (viewport.zoom * pxPerMm), snap: view.snap };

  const onDragMove = (id: string, node: Konva.Rect) => {
    const p = config.placeholders.find((q) => q.id === id)!;
    const r = snapPosition(node.x(), node.y(), pxPerMm, { w: p.box.width_mm, h: p.box.height_mm }, card, others(id), snapOpts);
    node.position({ x: r.x * pxPerMm, y: r.y * pxPerMm });
    setGuides(r.guides);
    updatePlaceholder(id, { x_mm: r.x, y_mm: r.y }, gesture.current ?? undefined);
  };

  const onTransform = (id: string, node: Konva.Rect) => {
    const w = Math.max(1, node.width() * node.scaleX());
    const h = Math.max(1, node.height() * node.scaleY());
    node.setAttrs({ width: w, height: h, scaleX: 1, scaleY: 1 });
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    updatePlaceholder(
      id,
      (p) => ({ ...p, x_mm: r3(node.x() / pxPerMm), y_mm: r3(node.y() / pxPerMm), box: { width_mm: r3(w / pxPerMm), height_mm: r3(h / pxPerMm) } }),
      gesture.current ?? undefined,
    );
  };

  const startGesture = (id: string) => {
    gesture.current = `gesture:${id}:${Date.now()}`;
    select(id);
  };
  const endGesture = () => {
    gesture.current = null;
    setGuides([]);
  };

  const trim = card.bleed * pxPerMm;
  const hair = 1 / viewport.zoom;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-muted/60">
      <div className="absolute left-0 top-0 z-10 bg-background" style={{ width: RULER_SIZE, height: RULER_SIZE }} />
      <Ruler orientation="h" length={size.w} offset={viewport.x} pxPerMm={pxPerMm * viewport.zoom} className="absolute top-0" style={{ left: RULER_SIZE }} />
      <Ruler orientation="v" length={size.h} offset={viewport.y} pxPerMm={pxPerMm * viewport.zoom} className="absolute left-0" style={{ top: RULER_SIZE }} />
      <div className="absolute" style={{ left: RULER_SIZE, top: RULER_SIZE, cursor: spaceDown ? "grab" : undefined }}>
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
          x={viewport.x}
          y={viewport.y}
          draggable={spaceDown}
          onDragEnd={(e) => e.target === stageRef.current && setViewport((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))}
          onWheel={onWheel}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === "background") select(null);
          }}
        >
          <Layer>
            <Rect x={0} y={0} width={widthPx} height={heightPx} fill="#fff" shadowColor="#000" shadowOpacity={0.25} shadowBlur={12} listening={false} />
            {(exactImage ?? image) && <KImage name="background" image={(exactImage ?? image)!} x={0} y={0} width={widthPx} height={heightPx} />}
            {!exactImage &&
              config.placeholders.map((p) => {
                const prep = prepared.get(p.id);
                if (p.hidden || !prep) return null;
                return (
                  <Shape
                    key={`t-${p.id}`}
                    listening={false}
                    perfectDrawEnabled={false}
                    sceneFunc={(ctx) => paintText((ctx as unknown as { _context: CanvasRenderingContext2D })._context, prep, scale)}
                  />
                );
              })}
            {trim > 0 && (
              <Rect
                x={trim}
                y={trim}
                width={widthPx - 2 * trim}
                height={heightPx - 2 * trim}
                stroke="#ef4444"
                strokeWidth={hair}
                dash={[6 * hair, 4 * hair]}
                listening={false}
              />
            )}
          </Layer>
          <Layer>
            {config.placeholders.map((p) => {
              const prep = prepared.get(p.id);
              const selected = p.id === selectedId;
              const problem = prep && (prep.layout.overflow || prep.layout.missing.length > 0 || prep.missingFields.length > 0);
              const stroke = problem ? "#ef4444" : "#2563eb";
              const visible = view.showFrames || selected || problem;
              return (
                <Rect
                  key={`f-${p.id}`}
                  ref={(n) => {
                    if (n) frames.current.set(p.id, n);
                    else frames.current.delete(p.id);
                  }}
                  x={p.x_mm * pxPerMm}
                  y={p.y_mm * pxPerMm}
                  width={p.box.width_mm * pxPerMm}
                  height={p.box.height_mm * pxPerMm}
                  fill="rgba(0,0,0,0)"
                  stroke={visible ? stroke : undefined}
                  strokeWidth={selected ? 1.5 : 1}
                  strokeScaleEnabled={false}
                  dash={selected ? undefined : [4, 3]}
                  opacity={p.hidden ? 0.35 : 1}
                  draggable={!p.locked && !spaceDown}
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                    select(p.id);
                  }}
                  onDragStart={() => startGesture(p.id)}
                  onDragMove={(e) => onDragMove(p.id, e.target as Konva.Rect)}
                  onDragEnd={endGesture}
                  onTransformStart={() => startGesture(p.id)}
                  onTransform={(e) => onTransform(p.id, e.target as Konva.Rect)}
                  onTransformEnd={endGesture}
                />
              );
            })}
            {view.showFrames &&
              config.placeholders.map((p) =>
                p.id === selectedId || p.hidden ? null : (
                  <KText
                    key={`l-${p.id}`}
                    x={p.x_mm * pxPerMm}
                    y={p.y_mm * pxPerMm - 14 / viewport.zoom}
                    text={p.label || p.id}
                    fontSize={11 / viewport.zoom}
                    fill="#2563eb"
                    listening={false}
                  />
                ),
              )}
            {guides.map((g, i) =>
              g.orientation === "v" ? (
                <Line key={i} points={[g.pos * pxPerMm, -1e5, g.pos * pxPerMm, 1e5]} stroke="#ec4899" strokeWidth={hair} listening={false} />
              ) : (
                <Line key={i} points={[-1e5, g.pos * pxPerMm, 1e5, g.pos * pxPerMm]} stroke="#ec4899" strokeWidth={hair} listening={false} />
              ),
            )}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              keepRatio={false}
              ignoreStroke
              flipEnabled={false}
              borderStroke="#2563eb"
              anchorStroke="#2563eb"
              anchorSize={8}
              boundBoxFunc={(oldBox, box) => (box.width < 4 || box.height < 4 ? oldBox : box)}
            />
          </Layer>
        </Stage>
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border bg-background p-1 shadow-sm">
        <Button size="icon" variant="ghost" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
          <Minus />
        </Button>
        <button className="w-14 text-center text-xs tabular-nums" onClick={() => zoomAt(1 / viewport.zoom)} title="Zoom to 100% (1 image pixel = 1 screen pixel)">
          {Math.round(viewport.zoom * 100)}%
        </button>
        <Button size="icon" variant="ghost" onClick={() => zoomAt(1.25)} aria-label="Zoom in">
          <Plus />
        </Button>
        <Button size="icon" variant="ghost" onClick={fit} aria-label="Fit to screen">
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
