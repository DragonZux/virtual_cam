// Mô hình 3D nhóm Ngoài trời: đèn giao thông, trụ cứu hoả, biển STOP, đồng hồ đỗ xe, ghế công viên
import { Box, Cylinder, Extrude, Lathe, Repeat, Sphere, Surface, Torus, Tube, type RepeatItem } from "./parts";
import { polygon, range, SIDES, type V2, type V3 } from "./shapes";
import { drawTexture, label } from "./textures";

const STEEL = "#8f959c";

/** n điểm cách đều trên vòng tròn bán kính r ở độ cao y (bu lông mặt bích) */
const ring = (n: number, r: number, y: number, start = 0): V3[] =>
  range(n).map((i): V3 => {
    const a = start + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

const SIGNAL = "#2a2d32";

/** Một mặt đèn tín hiệu (hướng +z): 3 thấu kính vòm có chụp che nắng; lit = đèn đang sáng (0 đỏ, 1 vàng, 2 xanh) */
const SignalFace = ({ lit }: { lit: number }) => {
  const lamps = [
    { on: "#ff3b2f", off: "#6e2420" },
    { on: "#ffc21a", off: "#7a6222" },
    { on: "#2bd46b", off: "#1f5c3c" },
  ];
  return (
    <group>
      {lamps.map((lamp, i) => (
        <group key={i} position={[0, 0.28 - i * 0.28, 0.11]}>
          <Cylinder r={0.11} h={0.012} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.004]} color="#16181b" finish="matte" seg={40} />
          {/* Thấu kính: chỏm cầu vòm nhẹ */}
          <Sphere
            r={0.2}
            thetaLength={0.52}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.002 - 0.2 * Math.cos(0.52)]}
            color={i === lit ? lamp.on : lamp.off}
            finish={i === lit ? "glow" : "gloss"}
            emissiveIntensity={2.2}
            seg={40}
          />
          {/* Chụp che nắng: nửa ống trên chìa ra trước */}
          <Cylinder
            r={0.122}
            h={0.12}
            open
            arcStart={Math.PI / 2 - 0.3}
            arc={Math.PI + 0.6}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.06]}
            color={SIGNAL}
            finish="matte"
            doubleSide
            seg={40}
          />
        </group>
      ))}
    </group>
  );
};

/** Đèn giao thông hai mặt trên cột: hộp đèn 3 ô, đèn đỏ đang sáng, chụp che nắng, đế bắt bu lông */
export const TrafficLight = () => {
  const poleTop = 1.25;
  const head = poleTop + 0.47; // tâm hộp đèn
  return (
    <group>
      {/* Đế: bản thép, bu lông, chân cột loe */}
      <Cylinder r={0.16} h={0.035} position={[0, 0.0175, 0]} color="#5d6268" finish="metal" seg={40} />
      <Repeat shape="cylinder" size={[0.014, 0.03, 0]} seg={6} at={ring(4, 0.12, 0.045, Math.PI / 4)} color={STEEL} finish="metal" />
      <Cylinder rTop={0.065} rBottom={0.095} h={0.14} position={[0, 0.105, 0]} color="#7d838b" finish="metal" seg={32} />
      <Cylinder r={0.055} h={poleTop} position={[0, poleTop / 2, 0]} color="#8a9098" finish="metal" seg={32} />
      <Cylinder r={0.075} h={0.06} position={[0, poleTop - 0.01, 0]} color={SIGNAL} finish="matte" seg={32} />
      {/* Hộp đèn: mặt trước và mặt sau đều có đèn */}
      <group position={[0, head, 0]}>
        <Box size={[0.32, 0.92, 0.22]} radius={0.04} color={SIGNAL} finish="matte" />
        <Box size={[0.34, 0.02, 0.24]} radius={0.008} position={[0, 0.465, 0]} color="#1f2125" finish="matte" />
        <SignalFace lit={0} />
        <group rotation={[0, Math.PI, 0]}>
          <SignalFace lit={0} />
        </group>
      </group>
    </group>
  );
};

const HYDRANT = "#c3302a";

/** Họng nước của trụ cứu hoả hướng theo +y cục bộ: cổ, đai, nắp, đai ốc ngũ giác */
const Outlet = ({ r, position, rotation }: { r: number; position: V3; rotation: V3 }) => (
  <group position={position} rotation={rotation}>
    <Cylinder r={r} h={0.07} position={[0, 0.035, 0]} color={HYDRANT} finish="gloss" seg={32} />
    <Cylinder r={r * 1.16} h={0.016} position={[0, 0.06, 0]} color={HYDRANT} finish="gloss" seg={32} />
    <Cylinder r={r * 1.1} h={0.042} position={[0, 0.089, 0]} color={HYDRANT} finish="gloss" seg={32} />
    <Cylinder r={r * 0.46} h={0.026} position={[0, 0.122, 0]} color={STEEL} finish="metal" seg={5} flat />
  </group>
);

/** Trụ cứu hoả đỏ kiểu cổ điển: mặt bích đế + bu lông, thân trụ, mặt bích trên, chỏm vòm, đai ốc vặn, hai họng bên và họng chính phía trước */
export const FireHydrant = () => {
  const body: V2[] = [
    [0, 0.04],
    [0.135, 0.04],
    [0.138, 0.05],
    [0.122, 0.07],
    [0.114, 0.095],
    [0.11, 0.2],
    [0.11, 0.47],
    [0.116, 0.49],
    [0.14, 0.495],
    [0.143, 0.525],
    [0.126, 0.532],
    [0.118, 0.555],
    [0.113, 0.6],
    [0.097, 0.635],
    [0.068, 0.66],
    [0.032, 0.673],
    [0, 0.676],
  ];
  return (
    <group>
      <Cylinder r={0.168} h={0.04} position={[0, 0.02, 0]} color={HYDRANT} finish="gloss" seg={48} />
      <Repeat shape="cylinder" size={[0.011, 0.022, 0]} seg={6} at={ring(8, 0.15, 0.047, 0.2)} color={STEEL} finish="metal" />
      <Lathe points={body} color={HYDRANT} finish="gloss" seg={48} />
      <Repeat shape="cylinder" size={[0.009, 0.018, 0]} seg={6} at={ring(8, 0.131, 0.534, 0.2)} color={STEEL} finish="metal" />
      {/* Đai ốc vặn trên đỉnh */}
      <Cylinder r={0.042} h={0.018} position={[0, 0.68, 0]} color={HYDRANT} finish="gloss" seg={24} />
      <Cylinder r={0.032} h={0.04} position={[0, 0.707, 0]} color={STEEL} finish="metal" seg={5} flat />
      {/* Hai họng bên + họng lớn phía trước */}
      {SIDES.map((s) => (
        <Outlet key={s} r={0.044} position={[s * 0.1, 0.4, 0]} rotation={[0, 0, (-s * Math.PI) / 2]} />
      ))}
      <Outlet r={0.062} position={[0, 0.34, 0.095]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
};

/** Mặt biển STOP: bát giác đỏ viền trắng, chữ trắng — vẽ khớp UV của circleGeometry 8 cạnh */
const stopFace = () =>
  drawTexture("outdoor:stop-face", 512, 512, (ctx, w, h) => {
    const c = w / 2;
    ctx.fillStyle = "#f5f5f2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c8102e";
    ctx.beginPath();
    range(8).forEach((i) => {
      const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
      const x = c + Math.cos(a) * c * 0.9;
      const y = c + Math.sin(a) * c * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f7f7f5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = h * 0.3;
    ctx.font = `800 ${size}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    const width = ctx.measureText("STOP").width;
    if (width > w * 0.74) {
      size *= (w * 0.74) / width;
      ctx.font = `800 ${size}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    }
    ctx.fillText("STOP", c, c + size * 0.04);
  });

/** Biển báo STOP: tấm nhôm bát giác đỏ viền trắng trên cột thép mạ kẽm, mặt sau xám kim loại có đai ôm cột */
export const StopSign = () => {
  const r = 0.38; // bán kính đỉnh bát giác (rộng ~0.7 m)
  const y = 1.5; // tâm biển
  return (
    <group>
      <Box size={[0.18, 0.02, 0.18]} radius={0.004} position={[0, 0.01, -0.04]} color="#7d8288" finish="metal" />
      <Cylinder r={0.03} h={y + 0.3} position={[0, (y + 0.3) / 2, -0.04]} color="#a9aeb4" finish="metal" seg={24} />
      <group position={[0, y, 0]}>
        <Extrude shape={polygon(8, r, Math.PI / 8)} depth={0.006} bevel={0.002} color="#b4b9bf" finish="metal" />
        <mesh position={[0, 0, 0.006]}>
          <circleGeometry args={[r, 8, Math.PI / 8]} />
          <Surface color="#ffffff" map={stopFace()} finish="plastic" />
        </mesh>
        {/* Bu lông ở viền trắng + đai ôm cột phía sau */}
        <Repeat
          shape="cylinder"
          size={[0.011, 0.006, 0]}
          seg={16}
          at={SIDES.map((s): RepeatItem => ({ p: [0, s * 0.334, 0.008], r: [Math.PI / 2, 0, 0] }))}
          color="#d4d8dd"
          finish="chrome"
        />
        <Repeat at={SIDES.map((s): V3 => [0, s * 0.334, -0.04])} size={[0.085, 0.032, 0.072]} radius={0.006} color="#8d9298" finish="metal" />
      </group>
    </group>
  );
};

/** Mặt số đồng hồ đỗ xe (nửa trên ảnh = nửa đĩa trong vòm kính): vạch phút, kim, cờ đỏ EXPIRED */
const meterDial = () =>
  drawTexture("outdoor:meter-dial", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#f3f0e6";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineCap = "round";
    for (const i of range(13)) {
      const a = Math.PI * (0.12 + (i / 12) * 0.76);
      const major = i % 3 === 0;
      ctx.lineWidth = major ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * w * 0.42, cy - Math.sin(a) * w * 0.42);
      ctx.lineTo(cx - Math.cos(a) * w * (major ? 0.32 : 0.36), cy - Math.sin(a) * w * (major ? 0.32 : 0.36));
      ctx.stroke();
    }
    ctx.fillStyle = "#d9302c";
    ctx.beginPath();
    ctx.roundRect(w * 0.27, h * 0.24, w * 0.46, h * 0.13, 6);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    ctx.font = `700 ${h * 0.075}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("EXPIRED", cx, h * 0.307);
    // Kim chỉ
    ctx.strokeStyle = "#1f1f1f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + w * 0.22, cy - h * 0.2);
    ctx.stroke();
  });

/** Đồng hồ thu phí đỗ xe: cột trên đế bê tông, đầu đồng hồ có vòm kính hai mặt số, khe xu, tay vặn, biển P xanh */
export const ParkingMeter = () => {
  const top = 1.18; // mép trên thân đầu đồng hồ (chân vòm kính)
  const hw = 0.12; // nửa bề ngang đầu đồng hồ
  const hd = 0.085; // nửa bề sâu
  const dome = hd / hw; // vòm dẹt theo z cho khớp thân
  return (
    <group>
      <Cylinder r={0.12} h={0.045} position={[0, 0.0225, 0]} color="#a8a49c" finish="matte" seg={40} />
      <Cylinder r={0.036} h={0.86} position={[0, 0.45, 0]} color="#4a5058" finish="metal" seg={24} />
      <Cylinder rTop={0.058} rBottom={0.042} h={0.06} position={[0, 0.875, 0]} color="#4a5058" finish="metal" seg={24} />
      {/* Thân đầu đồng hồ */}
      <Box size={[hw * 2, 0.29, hd * 2]} radius={0.04} position={[0, top - 0.145, 0]} color="#56616d" finish="gloss" />
      {/* Vòm kính + viền crôm + mặt số hai phía */}
      <Torus r={hw} tube={0.009} rotation={[Math.PI / 2, 0, 0]} scale={[1, dome, 1]} position={[0, top, 0]} color="#d4d8dd" finish="chrome" seg={40} />
      {SIDES.map((s) => (
        <mesh key={s} position={[0, top + 0.002, s * 0.003]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <circleGeometry args={[0.105, 32, 0, Math.PI]} />
          <Surface color="#ffffff" map={meterDial()} finish="matte" />
        </mesh>
      ))}
      <Box size={[hw * 1.7, 0.004, hd * 1.4]} position={[0, top + 0.001, 0]} color="#2f343a" finish="matte" />
      <Sphere r={hw} thetaLength={Math.PI / 2} scale={[1, 0.92, dome]} position={[0, top, 0]} color="#e8f2fb" finish="glass" seg={40} />
      {/* Mặt trước: khe bỏ xu trên tấm crôm + biển P */}
      <Box size={[0.09, 0.036, 0.006]} radius={0.003} position={[0, top - 0.055, hd + 0.001]} color="#c9ced4" finish="chrome" />
      <Box size={[0.05, 0.008, 0.004]} position={[0, top - 0.055, hd + 0.0045]} color="#1a1c1f" finish="matte" />
      <mesh position={[0, top - 0.17, hd + 0.001]}>
        <planeGeometry args={[0.1, 0.1]} />
        <Surface color="#ffffff" map={label("P", { bg: "#1f5fbf", fg: "#fafafa", aspect: 1, size: 0.72, border: "#fafafa" })} finish="plastic" />
      </mesh>
      {/* Tay vặn bên phải */}
      <Cylinder r={0.028} h={0.022} rotation={[0, 0, Math.PI / 2]} position={[hw + 0.006, top - 0.09, 0]} color="#c9ced4" finish="chrome" seg={24} />
      <Box size={[0.016, 0.08, 0.02]} radius={0.007} position={[hw + 0.022, top - 0.09, 0]} color="#c9ced4" finish="chrome" />
      {/* Mặt sau: cửa két tiền có ổ khoá */}
      <Box size={[0.16, 0.14, 0.006]} radius={0.004} position={[0, top - 0.155, -hd - 0.0005]} color="#626e7a" finish="gloss" />
      <Cylinder r={0.014} h={0.008} rotation={[Math.PI / 2, 0, 0]} position={[0, top - 0.155, -hd - 0.004]} color="#d4d8dd" finish="chrome" seg={20} />
    </group>
  );
};

const IRON = "#2a2d31";
const TEAK = "#a46a3c";

/** Khung gang một đầu ghế: chân trước, chân sau liền thanh tựa ngả, thanh đỡ mặt ngồi, tay vịn cuộn đầu */
const BenchEnd = ({ x }: { x: number }) => (
  <group position={[x, 0, 0]}>
    <Tube
      path={[
        [0, 0, 0.215],
        [0, 0.22, 0.2],
        [0, 0.44, 0.195],
        [0, 0.625, 0.215],
      ]}
      r={0.022}
      color={IRON}
      finish="metal"
    />
    <Tube
      path={[
        [0, 0, -0.255],
        [0, 0.22, -0.205],
        [0, 0.43, -0.185],
        [0, 0.66, -0.24],
        [0, 0.88, -0.295],
      ]}
      r={0.022}
      color={IRON}
      finish="metal"
    />
    <Tube
      path={[
        [0, 0.425, 0.25],
        [0, 0.415, 0.03],
        [0, 0.405, -0.2],
      ]}
      r={0.02}
      color={IRON}
      finish="metal"
    />
    <Tube
      path={[
        [0, 0.62, -0.225],
        [0, 0.645, 0],
        [0, 0.648, 0.2],
        [0, 0.632, 0.272],
        [0, 0.6, 0.272],
        [0, 0.588, 0.24],
      ]}
      r={0.02}
      color={IRON}
      finish="metal"
    />
    <Repeat
      at={[
        [0, 0.008, 0.215],
        [0, 0.008, -0.255],
      ]}
      size={[0.05, 0.016, 0.07]}
      radius={0.005}
      color={IRON}
      finish="metal"
    />
  </group>
);

/** Ghế công viên: 4 nan gỗ mặt ngồi, 3 nan tựa lưng ngả, hai khung gang có tay vịn, bu lông bắt nan */
export const Bench = () => {
  const ends = [-0.72, 0.72];
  // Mặt ngồi dốc nhẹ ra sau theo thanh đỡ
  const seatY = (z: number) => 0.425 + ((0.25 - z) / 0.45) * -0.02 + 0.036;
  const seat = [0.2, 0.095, -0.01, -0.115].map((z): V3 => [0, seatY(z), z]);
  const lean = 0.24; // góc ngả tựa lưng
  const back = [0.56, 0.68, 0.8].map((y): V3 => [0, y, -0.185 - Math.tan(lean) * (y - 0.43) + 0.036]);
  const normal: V3 = [0, Math.sin(lean), Math.cos(lean)];
  const bolts: RepeatItem[] = [
    ...seat.flatMap(([, y, z]) => ends.map((x): RepeatItem => ({ p: [x, y + 0.017, z] }))),
    ...back.flatMap(([, y, z]) =>
      ends.map((x): RepeatItem => ({ p: [x, y + normal[1] * 0.015, z + normal[2] * 0.015], r: [Math.PI / 2 - lean, 0, 0] })),
    ),
  ];
  return (
    <group>
      {ends.map((x) => (
        <BenchEnd key={x} x={x} />
      ))}
      <Repeat at={seat} size={[1.66, 0.032, 0.085]} radius={0.008} color={TEAK} finish="wood" />
      <Repeat at={back.map((p): RepeatItem => ({ p, r: [-lean, 0, 0] }))} size={[1.66, 0.085, 0.028]} radius={0.008} color={TEAK} finish="wood" />
      <Repeat shape="cylinder" size={[0.007, 0.004, 0]} seg={12} at={bolts} color="#3a3d42" finish="metal" />
    </group>
  );
};
