import type Konva from "konva";
import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Ellipse, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text as KText, Transformer } from "react-konva";
import type { Layer as DesignLayer, TemplateConfig } from "@/api/types";
import { Button } from "@/components/ui/button";
import { paintText, type PreparedText, type Scale } from "@/lib/cardPainter";
import { snapPosition, type Guide, type RectMm } from "@/lib/geometry";
import { elementOf, elementsOf, expandGroups, useEditor, type Element } from "@/stores/editorStore";
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
  /** Server-rendered card (exact preview). When set, it replaces the drawn design. */
  exactImage: HTMLImageElement | null;
  prepared: ReadonlyMap<string, PreparedText>;
  /** Loaded image per image layer id. */
  layerImages: ReadonlyMap<string, HTMLImageElement>;
  scale: Scale;
  view: ViewOptions;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 8;
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

/** Source crop for `cover`: the centred part of the image with the box's aspect ratio. */
function coverCrop(img: HTMLImageElement, w: number, h: number) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const aspect = w / h;
  const [cw, ch] = sw / sh > aspect ? [sh * aspect, sh] : [sw, sw / aspect];
  return { x: (sw - cw) / 2, y: (sh - ch) / 2, width: cw, height: ch };
}

function ImageContent({ layer, img, w, h, k }: { layer: DesignLayer; img: HTMLImageElement | undefined; w: number; h: number; k: number }) {
  const r = Math.min(layer.corner_radius_mm * k, w / 2, h / 2);
  const fit = layer.image?.fit ?? "cover";
  let content: React.ReactNode;
  if (!img) {
    content = (
      <>
        <Rect width={w} height={h} fill="#e5e7eb" cornerRadius={r} />
        <Line points={[0, 0, w, h]} stroke="#9ca3af" strokeWidth={1} strokeScaleEnabled={false} />
        <Line points={[w, 0, 0, h]} stroke="#9ca3af" strokeWidth={1} strokeScaleEnabled={false} />
      </>
    );
  } else if (fit === "fill") {
    content = <KImage image={img} width={w} height={h} />;
  } else if (fit === "cover") {
    content = <KImage image={img} width={w} height={h} crop={coverCrop(img, w, h)} />;
  } else {
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * s;
    const ih = img.naturalHeight * s;
    content = <KImage image={img} x={(w - iw) / 2} y={(h - ih) / 2} width={iw} height={ih} />;
  }
  if (r <= 0) return <>{content}</>;
  return (
    <Group
      clipFunc={(ctx) => {
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, r);
        ctx.closePath();
      }}
    >
      {content}
    </Group>
  );
}

function ShapeContent({ layer, w, h, k }: { layer: DesignLayer; w: number; h: number; k: number }) {
  const st = layer.shape;
  if (!st) return null;
  const sw = st.stroke_width_mm * k;
  const stroke = st.stroke && sw > 0 ? st.stroke : undefined;
  if (st.type === "line") return stroke ? <Line points={[0, h / 2, w, h / 2]} stroke={stroke} strokeWidth={sw} lineCap="butt" /> : null;
  const common = { fill: st.fill ?? undefined, stroke, strokeWidth: stroke ? sw : 0, strokeEnabled: !!stroke, fillEnabled: !!st.fill };
  if (st.type === "ellipse") return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
  return <Rect width={w} height={h} cornerRadius={Math.min(layer.corner_radius_mm * k, w / 2, h / 2)} {...common} />;
}

export function CardCanvas({ config, widthPx, heightPx, image, exactImage, prepared, layerImages, scale, view }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const frames = useRef(new Map<string, Konva.Rect>());
  const gesture = useRef<string | null>(null);
  const drag = useRef<{ primary: string; ids: string[] } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const [fitted, setFitted] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spaceDown, setSpaceDown] = useState(false);

  const selectedIds = useEditor((s) => s.selectedIds);
  const { select, setSelection, setGeometry, moveBy } = useEditor.getState();

  const { pxPerMm: k } = scale;
  const card = { w: config.size.width_mm, h: config.size.height_mm, bleed: config.size.bleed_mm };
  const elements = useMemo(() => elementsOf(config), [config]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

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
      const f = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
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

  // Attach the transformer to the selected, unlocked frames.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => elementOf(config, id))
      .filter((e): e is Element => !!e && !e.locked)
      .map((e) => frames.current.get(e.id))
      .filter((n): n is Konva.Rect => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, config]);

  const rotateEnabled = selectedIds.length > 0 && selectedIds.every((id) => elementOf(config, id)?.kind !== "text");

  const snapTargets = (exclude: ReadonlySet<string>): RectMm[] => elements.filter((e) => !exclude.has(e.id) && !e.hidden).map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
  const snapOpts = { grid: view.gridMm, tolMm: 6 / (viewport.zoom * k), snap: view.snap };

  const pointerMm = () => {
    const p = stageRef.current?.getRelativePointerPosition();
    return p ? { x: p.x / k, y: p.y / k } : null;
  };

  const onFrameDown = (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const ids = expandGroups(config, [id]);
    if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
      const all = ids.every((x) => selected.has(x));
      setSelection(all ? selectedIds.filter((x) => !ids.includes(x)) : [...selectedIds, ...ids]);
    } else if (!selected.has(id)) {
      setSelection(ids);
    }
  };

  const onDragStart = (id: string) => {
    if (drag.current) return;
    const ids = selected.has(id) ? selectedIds : [id];
    drag.current = { primary: id, ids };
    gesture.current = `gesture:drag:${Date.now()}`;
  };

  const onDragMove = (id: string, node: Konva.Rect) => {
    const d = drag.current;
    if (!d || d.primary !== id) return;
    const cfg = useEditor.getState().config!;
    const e = elementOf(cfg, id);
    if (!e) return;
    const r = snapPosition(node.x() - (e.w * k) / 2, node.y() - (e.h * k) / 2, k, { w: e.w, h: e.h }, card, snapTargets(new Set(d.ids)), snapOpts);
    setGuides(r.guides);
    moveBy(d.ids, r.x - e.x, r.y - e.y, gesture.current ?? undefined);
    const next = useEditor.getState().config!;
    for (const x of d.ids) {
      const el = elementOf(next, x);
      const n = frames.current.get(x);
      if (el && n) n.position({ x: (el.x + el.w / 2) * k, y: (el.y + el.h / 2) * k });
    }
  };

  const onTransform = (id: string, node: Konva.Rect) => {
    const w = Math.max(1, node.width() * node.scaleX());
    const h = Math.max(1, node.height() * node.scaleY());
    node.setAttrs({ width: w, height: h, scaleX: 1, scaleY: 1, offsetX: w / 2, offsetY: h / 2 });
    setGeometry(id, { x: (node.x() - w / 2) / k, y: (node.y() - h / 2) / k, w: w / k, h: h / k, rotation: node.rotation() }, gesture.current ?? undefined);
  };

  const endGesture = () => {
    gesture.current = null;
    drag.current = null;
    setGuides([]);
  };

  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (spaceDown) return;
    if (e.target !== e.target.getStage() && e.target.name() !== "background") return;
    const p = pointerMm();
    const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
    if (!additive) select(null);
    if (p) marqueeStart.current = { ...p, additive };
  };
  const onStageMove = () => {
    const s = marqueeStart.current;
    const p = s && pointerMm();
    if (!s || !p) return;
    setMarquee({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onStageUp = () => {
    const s = marqueeStart.current;
    marqueeStart.current = null;
    if (!s || !marquee) return setMarquee(null);
    const m = marquee;
    setMarquee(null);
    if (m.w * k * viewport.zoom < 3 && m.h * k * viewport.zoom < 3) return;
    const hit = elements.filter((el) => !el.hidden && !el.locked && el.x < m.x + m.w && el.x + el.w > m.x && el.y < m.y + m.h && el.y + el.h > m.y).map((el) => el.id);
    const ids = expandGroups(config, hit);
    setSelection(s.additive ? [...selectedIds, ...ids] : ids);
  };

  const trim = card.bleed * k;
  const hair = 1 / viewport.zoom;
  const background = config.background ?? "#ffffff";

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-muted/60">
      <div className="absolute left-0 top-0 z-10 bg-background" style={{ width: RULER_SIZE, height: RULER_SIZE }} />
      <Ruler orientation="h" length={size.w} offset={viewport.x} pxPerMm={k * viewport.zoom} className="absolute top-0" style={{ left: RULER_SIZE }} />
      <Ruler orientation="v" length={size.h} offset={viewport.y} pxPerMm={k * viewport.zoom} className="absolute left-0" style={{ top: RULER_SIZE }} />
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
          onMouseDown={onStageDown}
          onMouseMove={onStageMove}
          onMouseUp={onStageUp}
        >
          <Layer>
            <Rect name="background" x={0} y={0} width={widthPx} height={heightPx} fill={background} shadowColor="#000" shadowOpacity={0.25} shadowBlur={12} />
            {exactImage ? (
              <KImage name="background" image={exactImage} x={0} y={0} width={widthPx} height={heightPx} />
            ) : (
              <>
                {image && <KImage name="background" image={image} x={0} y={0} width={widthPx} height={heightPx} />}
                {elements.map((el) => {
                  if (el.hidden) return null;
                  if (el.kind === "text") {
                    const prep = prepared.get(el.id);
                    if (!prep) return null;
                    return (
                      <Shape
                        key={el.id}
                        listening={false}
                        perfectDrawEnabled={false}
                        sceneFunc={(ctx) => paintText((ctx as unknown as { _context: CanvasRenderingContext2D })._context, prep, scale)}
                      />
                    );
                  }
                  const layer = el.layer!;
                  const w = el.w * k;
                  const h = el.h * k;
                  return (
                    <Group
                      key={el.id}
                      x={el.x * k + w / 2}
                      y={el.y * k + h / 2}
                      offsetX={w / 2}
                      offsetY={h / 2}
                      rotation={el.rotation}
                      opacity={layer.opacity}
                      listening={false}
                    >
                      {el.kind === "image" ? <ImageContent layer={layer} img={layerImages.get(el.id)} w={w} h={h} k={k} /> : <ShapeContent layer={layer} w={w} h={h} k={k} />}
                    </Group>
                  );
                })}
              </>
            )}
            {trim > 0 && (
              <Rect x={trim} y={trim} width={widthPx - 2 * trim} height={heightPx - 2 * trim} stroke="#ef4444" strokeWidth={hair} dash={[6 * hair, 4 * hair]} listening={false} />
            )}
          </Layer>
          <Layer>
            {elements.map((el) => {
              const prep = el.kind === "text" ? prepared.get(el.id) : undefined;
              const isSel = selected.has(el.id);
              const problem = !!prep && (prep.layout.overflow || prep.layout.missing.length > 0 || prep.missingFields.length > 0);
              const dataBound = el.kind === "text" || el.layer?.image?.mode === "field";
              const visible = (view.showFrames && dataBound) || isSel || problem;
              const w = el.w * k;
              const h = el.h * k;
              return (
                <Rect
                  key={`f-${el.id}`}
                  ref={(n) => {
                    if (n) frames.current.set(el.id, n);
                    else frames.current.delete(el.id);
                  }}
                  x={el.x * k + w / 2}
                  y={el.y * k + h / 2}
                  offsetX={w / 2}
                  offsetY={h / 2}
                  width={w}
                  height={h}
                  rotation={el.rotation}
                  fill="rgba(0,0,0,0)"
                  stroke={visible ? (problem ? "#ef4444" : el.groupId && isSel ? "#7c3aed" : "#2563eb") : undefined}
                  strokeWidth={isSel ? 1.5 : 1}
                  strokeScaleEnabled={false}
                  dash={isSel ? undefined : [4, 3]}
                  opacity={el.hidden ? 0.35 : 1}
                  draggable={!el.locked && !spaceDown}
                  onMouseDown={(e) => onFrameDown(el.id, e)}
                  onDblClick={() => setSelection([el.id])}
                  onDragStart={() => onDragStart(el.id)}
                  onDragMove={(e) => onDragMove(el.id, e.target as Konva.Rect)}
                  onDragEnd={endGesture}
                  onTransformStart={() => {
                    gesture.current ??= `gesture:transform:${Date.now()}`;
                  }}
                  onTransform={(e) => onTransform(el.id, e.target as Konva.Rect)}
                  onTransformEnd={endGesture}
                />
              );
            })}
            {view.showFrames &&
              elements.map((el) =>
                selected.has(el.id) || el.hidden || !(el.kind === "text" || el.layer?.image?.mode === "field") ? null : (
                  <KText key={`l-${el.id}`} x={el.x * k} y={el.y * k - 14 / viewport.zoom} text={el.name} fontSize={11 / viewport.zoom} fill="#2563eb" listening={false} />
                ),
              )}
            {guides.map((g, i) =>
              g.orientation === "v" ? (
                <Line key={i} points={[g.pos * k, -1e5, g.pos * k, 1e5]} stroke="#ec4899" strokeWidth={hair} listening={false} />
              ) : (
                <Line key={i} points={[-1e5, g.pos * k, 1e5, g.pos * k]} stroke="#ec4899" strokeWidth={hair} listening={false} />
              ),
            )}
            {marquee && (
              <Rect x={marquee.x * k} y={marquee.y * k} width={marquee.w * k} height={marquee.h * k} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={hair} listening={false} />
            )}
            <Transformer
              ref={trRef}
              rotateEnabled={rotateEnabled}
              rotationSnaps={ROTATION_SNAPS}
              rotationSnapTolerance={4}
              keepRatio={false}
              ignoreStroke
              flipEnabled={false}
              borderStroke="#2563eb"
              anchorStroke="#2563eb"
              anchorSize={8}
              boundBoxFunc={(oldBox, box) => (Math.abs(box.width) < 4 || Math.abs(box.height) < 4 ? oldBox : box)}
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
