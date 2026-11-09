import { Html, MapControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import { buildLayout, type Plot, type WorldLayout } from "./layout";
import { peopleOf, type TeamView } from "./model";
import Office, { ARM, SkillBook, buildOffice } from "./Office";
import * as tex from "./textures";

export interface Courier {
  id: string;
  from: string;
  to: string;
  start: number;
  label: string;
}

export interface WorldProps {
  teams: TeamView[];
  company: string;
  selectedTeam: string | null;
  activeTeam: string | null;
  approvalTeams: string[];
  requestTeams: string[];
  couriers: Courier[];
  /** number of skills per team id */
  skills: Record<string, number>;
  onSelectTeam: (key: string | null) => void;
  /** When set, the camera is inside this department's office. */
  inside: string | null;
  onEnter: (team: string) => void;
  selectedPerson: string | null;
  onSelectPerson: (id: string | null) => void;
  paused?: boolean;
}

interface Focus {
  key: string;
  x: number;
  y: number;
  z: number;
  scale: number;
}

const COURIER_MS = 3200;

/** Labels are DOM inside the canvas wrapper: keep their clicks from reaching three.js as a "missed" click. */
export const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
  e.stopPropagation();
  fn();
};

export default function World(props: WorldProps) {
  return (
    <Canvas
      shadows
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      frameloop={props.paused ? "never" : "always"}
      onPointerMissed={() => (props.inside ? props.onSelectPerson(null) : props.onSelectTeam(null))}
      style={{ background: "transparent" }}
    >
      <OrthographicCamera makeDefault position={[30, 28, 30]} zoom={24} near={-200} far={400} />
      <hemisphereLight args={["#dff3ff", "#7a6a4a", 0.9]} />
      <directionalLight
        position={[18, 30, 10]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0008}
      />
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({
  teams,
  company,
  selectedTeam,
  activeTeam,
  approvalTeams,
  requestTeams,
  couriers,
  skills,
  onSelectTeam,
  inside,
  onEnter,
  selectedPerson,
  onSelectPerson,
}: WorldProps) {
  const layout = useMemo(() => buildLayout(teams), [teams]);
  const controls = useRef<any>(null);
  const plot = selectedTeam ? (layout.plots.find((p) => p.key === selectedTeam) ?? null) : null;
  const maxHours = Math.max(1, ...teams.map((t) => t.hours));
  const narrow = useThree((s) => s.size.width <= 900);
  const insideTeam = inside ? (teams.find((t) => t.key === inside) ?? null) : null;
  const office = useMemo(() => (insideTeam ? buildOffice(insideTeam, insideTeam.color) : null), [insideTeam]);

  // Skills learned by the team, shown as books above the first desks.
  const skilledPeople = useMemo(() => {
    if (!insideTeam) return {};
    const people = peopleOf(insideTeam);
    const n = skills[insideTeam.key] ?? 0;
    const out: Record<string, number> = {};
    for (let i = 0; i < n && people.length; i++) {
      const p = people[i % people.length]!;
      out[p.id] = (out[p.id] ?? 0) + 1;
    }
    return out;
  }, [insideTeam, skills]);

  const focus: Focus | null =
    office && insideTeam
      ? {
          key: `office-${insideTeam.key}`,
          x: 0,
          y: 0.6,
          z: 0,
          // the office is about W×D; the island is 2·radius wide, so scale the zoom so the room fills the view
          scale: ((layout.radius * 2.25) / (Math.max(office.W, office.D) * 1.25 + 2)) * (narrow ? 0.72 : 1),
        }
      : plot
        ? { key: plot.key, x: plot.x, y: 1.5, z: plot.z, scale: 1.8 }
        : null;

  if (insideTeam && office) {
    return (
      <>
        <MapControls ref={controls} makeDefault enableRotate={false} enableDamping screenSpacePanning minZoom={6} maxZoom={140} />
        <CameraRig focus={focus} controls={controls} radius={layout.radius} />
        <Office
          team={insideTeam}
          color={insideTeam.color}
          layout={office}
          active={activeTeam === insideTeam.key}
          activePerson={activeTeam === insideTeam.key ? (office.desks[0]?.person.id ?? null) : null}
          selectedPerson={selectedPerson}
          skilled={skilledPeople}
          onSelectPerson={(id) => onSelectPerson(id)}
        />
      </>
    );
  }

  return (
    <>
      <MapControls ref={controls} makeDefault enableRotate={false} enableDamping screenSpacePanning minZoom={6} maxZoom={90} />
      <CameraRig focus={focus} controls={controls} radius={layout.radius} />
      <Island layout={layout} />
      <Trees trees={layout.trees} />
      <Hq company={company} waiting={approvalTeams.length > 0} onClick={() => onSelectTeam(null)} />
      {teams.map((t) => {
        const p = layout.plots.find((x) => x.key === t.key);
        if (!p) return null;
        return (
          <Building
            key={t.key}
            team={t}
            plot={p}
            selected={selectedTeam === t.key}
            dimmed={Boolean(selectedTeam) && selectedTeam !== t.key}
            active={activeTeam === t.key}
            waiting={approvalTeams.includes(t.key)}
            request={requestTeams.includes(t.key)}
            beacon={t.hours / maxHours}
            skilled={(skills[t.key] ?? 0) > 0}
            onSelect={() => onSelectTeam(t.key)}
            onEnter={() => onEnter(t.key)}
          />
        );
      })}
      {couriers.map((c) => (
        <CourierCrate key={c.id} c={c} layout={layout} />
      ))}
    </>
  );
}

/* ---------------- camera ---------------- */

function CameraRig({ focus, controls, radius }: { focus: Focus | null; controls: RefObject<any>; radius: number }) {
  const { camera, size } = useThree();
  const goal = useRef({ target: new THREE.Vector3(), zoom: 24 });
  const key = useRef("");
  const moving = useRef(false);
  const offset = useMemo(() => new THREE.Vector3(30, 28, 30), []);
  useFrame(() => {
    const fit = Math.min(size.width * (size.width < 900 ? 1.05 : 0.9), size.height) / (radius * 2.25);
    const k = focus ? `${focus.key}-${Math.round(size.width)}` : `home-${Math.round(fit * 10)}`;
    if (k !== key.current) {
      key.current = k;
      moving.current = true;
      goal.current.zoom = focus ? Math.min(110, fit * focus.scale) : fit;
      goal.current.target.set(focus ? focus.x : 0, focus ? focus.y : 0, focus ? focus.z : 0);
    }
    const c = controls.current;
    if (!moving.current || !c) return;
    const cam = camera as THREE.OrthographicCamera;
    c.target.lerp(goal.current.target, 0.1);
    cam.position.copy(c.target).add(offset);
    cam.zoom += (goal.current.zoom - cam.zoom) * 0.1;
    cam.updateProjectionMatrix();
    c.update();
    if (c.target.distanceTo(goal.current.target) < 0.02 && Math.abs(cam.zoom - goal.current.zoom) < 0.05) moving.current = false;
  });
  return null;
}

/* ---------------- terrain ---------------- */

function Island({ layout }: { layout: WorldLayout }) {
  const { grass, paths, under1, under2 } = useMemo(() => {
    const grass: [number, number][] = [];
    const paths: [number, number][] = [];
    const under1: [number, number][] = [];
    const under2: [number, number][] = [];
    const R = layout.radius;
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, z);
        if (d <= R + 0.3) (layout.pathTiles.has(`${x},${z}`) ? paths : grass).push([x, z]);
        if (d <= R - 1.2) under1.push([x, z]);
        if (d <= R - 3.5) under2.push([x, z]);
      }
    }
    return { grass, paths, under1, under2 };
  }, [layout]);

  const grassMats = useMemo(() => {
    const side = new THREE.MeshLambertMaterial({ map: tex.grassSide() });
    const top = new THREE.MeshLambertMaterial({ map: tex.grassTop() });
    const bottom = new THREE.MeshLambertMaterial({ map: tex.dirt() });
    return [side, side, top, bottom, side, side];
  }, []);
  const pathMats = useMemo(() => {
    const side = new THREE.MeshLambertMaterial({ map: tex.dirt() });
    const top = new THREE.MeshLambertMaterial({ map: tex.path() });
    return [side, side, top, side, side, side];
  }, []);
  const dirtMat = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.dirt() }), []);
  const stoneMat = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.stoneBricks() }), []);

  return (
    <group>
      <Tiles cells={grass} y={-0.5} material={grassMats} receive />
      <Tiles cells={paths} y={-0.55} material={pathMats} receive />
      <Tiles cells={under1} y={-1.5} material={dirtMat} />
      <Tiles cells={under2} y={-2.5} material={stoneMat} />
    </group>
  );
}

function Tiles({
  cells,
  y,
  material,
  receive,
}: {
  cells: [number, number][];
  y: number;
  material: THREE.Material | THREE.Material[];
  receive?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    cells.forEach(([x, z], i) => {
      m.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} material={material} receiveShadow={Boolean(receive)} key={cells.length}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

function Trees({ trees }: { trees: [number, number][] }) {
  const log = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.logSide() }), []);
  const leaf = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.leaves() }), []);
  return (
    <group>
      {trees.map(([x, z], i) => {
        const h = 2 + (i % 2);
        return (
          <group key={`${x},${z}`} position={[x, 0, z]}>
            <mesh position={[0, h / 2, 0]} material={log} castShadow>
              <boxGeometry args={[0.6, h, 0.6]} />
            </mesh>
            <mesh position={[0, h + 0.4, 0]} material={leaf} castShadow>
              <boxGeometry args={[2.2, 1.2, 2.2]} />
            </mesh>
            <mesh position={[0, h + 1.3, 0]} material={leaf} castShadow>
              <boxGeometry args={[1.2, 0.8, 1.2]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ---------------- HQ ---------------- */

function Hq({ company, waiting, onClick }: { company: string; waiting: boolean; onClick: () => void }) {
  const stone = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.stoneBricks([3, 2]) }), []);
  const stoneTall = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.stoneBricks([1, 3]) }), []);
  const goldM = useMemo(
    () => new THREE.MeshLambertMaterial({ map: tex.gold(), emissive: "#7a5a00", emissiveIntensity: 0.25 }),
    [],
  );
  const gem = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (gem.current) {
      gem.current.rotation.y = clock.elapsedTime * 0.8;
      gem.current.position.y = 6.6 + Math.sin(clock.elapsedTime * 2) * 0.12;
    }
  });
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, 1, 0]} material={stone} castShadow receiveShadow>
        <boxGeometry args={[3, 2, 3]} />
      </mesh>
      <mesh position={[0, 3.5, 0]} material={stoneTall} castShadow>
        <boxGeometry args={[1.6, 3, 1.6]} />
      </mesh>
      <mesh position={[0, 5.25, 0]} material={goldM} castShadow>
        <boxGeometry args={[2, 0.5, 2]} />
      </mesh>
      <mesh ref={gem} position={[0, 6.6, 0]} material={goldM} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
      </mesh>
      {waiting && <Alert y={8.2} />}
      <Html position={[0, 2.3, 1.6]} center zIndexRange={[9, 0]}>
        <div className="ot3-sign ot3-sign-hq" onClick={stop(onClick)}>
          <b>HQ</b>
          {company && <span>{company}</span>}
        </div>
      </Html>
    </group>
  );
}

/* ---------------- buildings ---------------- */

function Building({
  team,
  plot,
  selected,
  dimmed,
  active,
  waiting,
  request,
  beacon,
  skilled,
  onSelect,
  onEnter,
}: {
  team: TeamView;
  plot: Plot;
  selected: boolean;
  dimmed: boolean;
  active: boolean;
  waiting: boolean;
  request: boolean;
  beacon: number;
  skilled: boolean;
  onSelect: () => void;
  onEnter: () => void;
}) {
  const h = plot.floors;
  const wall = useMemo(
    () => new THREE.MeshLambertMaterial({ map: tex.planks(plot.color, [3, h]), transparent: true }),
    [plot.color, h],
  );
  const roof = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.roofTiles("#5a4a42", [3, 1]), transparent: true }), []);
  const win = useMemo(
    () => new THREE.MeshLambertMaterial({ map: tex.windowTex(), emissive: "#ffd36b", emissiveIntensity: 0.2 }),
    [],
  );
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const o = dimmed ? 0.45 : 1;
    wall.opacity = o;
    roof.opacity = o;
    win.emissiveIntensity = active ? 0.6 + Math.sin(t * 6) * 0.4 : 0.2;
    if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = selected ? 0.9 : 0;
  });

  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? "pointer" : "";
  };
  const windows: [number, number][] = [];
  for (let f = 0; f < h; f++) for (const x of [-0.75, 0.75]) windows.push([x, f + 0.6]);
  const click = () => (selected ? onEnter() : onSelect());

  return (
    <group position={[plot.x, 0, plot.z]}>
      <group rotation={[0, plot.face, 0]}>
        <group
          onClick={(e) => {
            e.stopPropagation();
            click();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEnter();
          }}
          onPointerOver={hover(true)}
          onPointerOut={hover(false)}
        >
          <mesh position={[0, h / 2, 0]} material={wall} castShadow receiveShadow>
            <boxGeometry args={[3, h, 3]} />
          </mesh>
          <mesh position={[0, h + 0.2, 0]} material={roof} castShadow>
            <boxGeometry args={[3.5, 0.4, 3.5]} />
          </mesh>
          <mesh position={[0, h + 0.6, 0]} material={roof} castShadow>
            <boxGeometry args={[2.3, 0.4, 2.3]} />
          </mesh>
          {windows.map(([x, y], i) => (
            <mesh key={i} position={[x, y, 1.51]} material={win}>
              <planeGeometry args={[0.7, 0.6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.55, 1.52]}>
            <planeGeometry args={[0.7, 1.1]} />
            <meshLambertMaterial color={selected ? "#ffd36b" : "#3b2a1a"} />
          </mesh>
        </group>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0.6]}>
          <ringGeometry args={[2.6, 2.85, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} />
        </mesh>
        <Workers team={team} z={2.6} active={active} color={plot.color} show={!dimmed} showNames={selected} skilled={skilled} onSelect={onSelect} />
      </group>
      <Beacon height={1.5 + beacon * 6} y={h + 0.8} color={plot.color} active={active} dimmed={dimmed} />
      {active && <Sparks y={h + 1} color={plot.color} />}
      {waiting && <Alert y={h + 2.4} />}
      {/* One label per building (swapping two drei <Html> roots on select trips React 19's unmount checks). */}
      <Html position={[0, h + 1.3, 0]} center zIndexRange={[9, 0]}>
        {selected ? (
          <button className="ot3-enter" onClick={stop(onEnter)}>
            🚪 Step inside
          </button>
        ) : (
          <div
            className={`ot3-sign ${dimmed ? "ot3-sign-dim" : ""}`}
            onClick={stop(onSelect)}
            style={{ ["--team" as string]: plot.color }}
          >
            <b>
              {team.emoji} {team.name}
            </b>
            <span>
              {team.headcount} people · ⚡ {team.hours} h/wk
            </span>
            {active && <em className="ot3-live">agent working…</em>}
            {waiting && <em className="ot3-wait">! needs your approval</em>}
            {request && !active && <em className="ot3-req">✉ request in progress</em>}
          </div>
        )}
      </Html>
    </group>
  );
}

function Beacon({ height, y, color, active, dimmed }: { height: number; y: number; color: string; active: boolean; dimmed: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = dimmed ? 0.08 : active ? 0.45 + Math.sin(clock.elapsedTime * 8) * 0.2 : 0.28;
  });
  return (
    <mesh ref={ref} position={[0, y + height / 2, 0]}>
      <boxGeometry args={[0.45, height, 0.45]} />
      <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function Sparks({ y, color }: { y: number; color: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    g.current?.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.8 + i / 6) % 1;
      c.position.set(Math.sin(i * 2.1) * 1.1, y + t * 3, Math.cos(i * 1.7) * 1.1);
      c.scale.setScalar(1 - t);
    });
  });
  return (
    <group ref={g}>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function Alert({ y }: { y: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.rotation.y = clock.elapsedTime * 2;
    g.current.position.y = y + Math.sin(clock.elapsedTime * 4) * 0.2;
  });
  return (
    <group ref={g} position={[0, y, 0]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.35, 0.9, 0.35]} />
        <meshBasicMaterial color="#ffcc22" />
      </mesh>
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[0.35, 0.35, 0.35]} />
        <meshBasicMaterial color="#ffcc22" />
      </mesh>
    </group>
  );
}

/* ---------------- workers outside the door (one per role) ---------------- */

const SKIN = ["#f1c7a0", "#d9a27a", "#a8724f", "#7c4f34"];

function Workers({
  team,
  z,
  active,
  color,
  show,
  showNames,
  skilled,
  onSelect,
}: {
  team: TeamView;
  z: number;
  active: boolean;
  color: string;
  show: boolean;
  showNames: boolean;
  skilled: boolean;
  onSelect: () => void;
}) {
  if (!show) return null;
  const roles = team.roles.slice(0, 5);
  const n = roles.length;
  return (
    <group position={[0, 0, z]}>
      {roles.map((r, i) => (
        <Worker
          key={r.key}
          x={(i - (n - 1) / 2) * (n > 3 ? 1.1 : 1.35)}
          tagY={2.25 + (i % 2) * 0.55}
          color={color}
          skin={SKIN[(i + team.key.length) % SKIN.length]!}
          active={active}
          name={r.name}
          hours={r.hours}
          showName={showNames}
          phase={i}
          skilled={skilled && i === 0}
          onClick={onSelect}
        />
      ))}
    </group>
  );
}

function Worker({
  x,
  tagY,
  color,
  skin,
  active,
  name,
  hours,
  showName,
  phase,
  skilled,
  onClick,
}: {
  x: number;
  tagY: number;
  color: string;
  skin: string;
  active: boolean;
  name: string;
  hours: number;
  showName: boolean;
  phase: number;
  skilled: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const body = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (body.current) body.current.position.y = active ? Math.abs(Math.sin(t * 6)) * 0.12 : Math.sin(t * 2) * 0.03;
    const swing = active ? Math.sin(t * 10) * 0.9 : Math.sin(t * 1.5) * 0.08;
    if (armL.current) armL.current.rotation.x = swing;
    if (armR.current) armR.current.rotation.x = -swing;
  });
  return (
    <group
      position={[x, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      <group ref={body} scale={0.85}>
        <mesh position={[-0.13, 0.3, 0]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.24]} />
          <meshLambertMaterial color="#2f3b55" />
        </mesh>
        <mesh position={[0.13, 0.3, 0]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.24]} />
          <meshLambertMaterial color="#2f3b55" />
        </mesh>
        <mesh position={[0, 0.92, 0]} castShadow>
          <boxGeometry args={[0.5, 0.64, 0.28]} />
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh ref={armL} position={[-0.36, 0.95, 0]} castShadow geometry={ARM}>
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh ref={armR} position={[0.36, 0.95, 0]} castShadow geometry={ARM}>
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshLambertMaterial color={skin} />
        </mesh>
        <mesh position={[0, 1.79, 0]}>
          <boxGeometry args={[0.54, 0.12, 0.54]} />
          <meshLambertMaterial color="#3a2a1e" />
        </mesh>
        <mesh position={[-0.11, 1.52, 0.255]}>
          <planeGeometry args={[0.08, 0.08]} />
          <meshBasicMaterial color="#1b1f2a" />
        </mesh>
        <mesh position={[0.11, 1.52, 0.255]}>
          <planeGeometry args={[0.08, 0.08]} />
          <meshBasicMaterial color="#1b1f2a" />
        </mesh>
      </group>
      {skilled && <SkillBook phase={phase} />}
      {showName && hover && (
        <Html position={[0, tagY, 0]} center zIndexRange={[9, 0]}>
          <div className="ot3-nametag" onClick={stop(onClick)}>
            {name}
            <small>⚡{hours}h</small>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ---------------- courier crate (handoff between teams) ---------------- */

function CourierCrate({ c, layout }: { c: Courier; layout: WorldLayout }) {
  const g = useRef<THREE.Group>(null);
  const crateMat = useMemo(() => new THREE.MeshLambertMaterial({ map: tex.crate() }), []);
  const curve = useMemo(() => {
    const pts = layout.route(c.from, c.to).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return pts.length ? new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.2) : null;
  }, [c.from, c.to, layout]);
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  useFrame(() => {
    if (!g.current || !curve) return;
    const t = Math.min(1, (performance.now() - c.start) / COURIER_MS);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const p = curve.getPoint(e);
    g.current.position.set(p.x, p.y + Math.abs(Math.sin(t * Math.PI * 8)) * 0.25, p.z);
    g.current.rotation.y = t * Math.PI * 2;
    g.current.visible = t < 1;
  });
  if (!curve) return null;
  return (
    <group ref={g}>
      <mesh material={crateMat} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
      </mesh>
      <Html position={[0, 1.1, 0]} center zIndexRange={[12, 10]}>
        <div className="ot3-courier">📦 {c.label}</div>
      </Html>
    </group>
  );
}
