// Mô hình 3D nhóm Nội thất: ghế ăn, sofa, chậu cây, giường, bàn ăn, bồn cầu
import { Box, Cylinder, Extrude, Lathe, Repeat, Sphere, Torus, type RepeatItem } from "./parts";
import { ellipse, range, seeded, SIDES, type V2, type V3 } from "./shapes";
import { drawTexture } from "./textures";

const OAK = "#a86f3e";
const WALNUT = "#6a4430";
const PORCELAIN = "#f2f2ef";

/** Thanh tròn từ a tới b cho Repeat shape="cylinder" có size = [bán kính, 1, _] */
const rod = (a: V3, b: V3): RepeatItem => {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...d);
  return {
    p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    s: [1, length, 1],
    r: [0, Math.atan2(d[2], -d[0]), Math.acos(d[1] / length)],
  };
};

/** Chân gỗ vuông vuốt thon (trụ 4 cạnh xoay 45°, tô phẳng): position = điểm chạm sàn, tilt = nghiêng quanh x */
const TaperedLeg = ({
  position,
  h,
  top,
  bottom,
  tilt = 0,
  color = OAK,
}: {
  position: V3;
  h: number;
  top: number;
  bottom: number;
  tilt?: number;
  color?: string;
}) => (
  <group position={position} rotation={[tilt, 0, 0]}>
    <Cylinder
      rTop={top / Math.SQRT2}
      rBottom={bottom / Math.SQRT2}
      h={h}
      seg={4}
      position={[0, h / 2, 0]}
      rotation={[0, Math.PI / 4, 0]}
      color={color}
      finish="wood"
      flat
    />
  </group>
);

/**
 * Thanh cong của tựa lưng nhìn từ trên: cung bán kính R, tâm ở z = cz phía trước, phủ tới x = ±half, dày t.
 * Toạ độ hình (x, −z) để Extrude xoay [−π/2, 0, 0] nằm ngang và đùn theo trục y.
 */
const arcRail = (R: number, cz: number, half: number, t: number, n = 16): V2[] => {
  const span = Math.asin(half / R);
  const edge = (radius: number) =>
    range(n + 1).map((i): V2 => {
      const a = -span + (2 * span * i) / n;
      return [radius * Math.sin(a), radius * Math.cos(a) - cz];
    });
  return [...edge(R + t / 2), ...edge(R - t / 2).reverse()];
};

/** Ghế ăn gỗ sồi: đệm vải, chân vuông vuốt thon, giằng chữ H, tựa lưng cong có 4 nan dọc */
export const Chair = () => {
  const x = 0.19; // tâm chân theo x
  const front = 0.175;
  const back = -0.175;
  const seat = 0.45; // mặt trên ván ngồi
  const legH = seat - 0.032;
  // Tựa lưng cong (nhìn từ trên): cung bán kính R đi qua tâm hai trụ sau, giữa lùi về sau
  const R = 0.55;
  const cz = Math.sqrt(R * R - x * x);
  const rail = arcRail(R, cz, x + 0.012, 0.024);
  const slats = [-0.105, -0.035, 0.035, 0.105].map(
    (sx): RepeatItem => ({ p: [sx, 0.252, cz - Math.sqrt(R * R - sx * sx)], r: [0, -Math.asin(sx / R), 0] }),
  );
  const apronY = legH - 0.032;
  return (
    <group>
      {SIDES.map((s) => (
        <group key={s}>
          <TaperedLeg position={[s * x, 0, front]} h={legH} top={0.036} bottom={0.025} />
          {/* Chân sau choãi nhẹ ra sau */}
          <TaperedLeg
            position={[s * x, 0, back - 0.03]}
            tilt={Math.atan2(0.03, legH)}
            h={Math.hypot(legH, 0.03)}
            top={0.036}
            bottom={0.025}
          />
        </group>
      ))}
      {/* Yếm quanh dưới mặt ngồi */}
      <Repeat
        at={[
          { p: [0, apronY, front], s: [2 * x, 0.06, 0.02] },
          { p: [0, apronY, back], s: [2 * x, 0.06, 0.02] },
          ...SIDES.map((s): RepeatItem => ({ p: [s * x, apronY, 0], s: [0.02, 0.06, front - back] })),
        ]}
        color={OAK}
        finish="wood"
      />
      {/* Giằng chân chữ H */}
      <Repeat
        shape="cylinder"
        size={[0.0095, 1, 0]}
        seg={12}
        at={[
          rod([-x, 0.15, front], [-x, 0.15, back - 0.02]),
          rod([x, 0.15, front], [x, 0.15, back - 0.02]),
          rod([-x, 0.15, 0], [x, 0.15, 0]),
        ]}
        color={OAK}
        finish="wood"
      />
      {/* Ván ngồi + đệm vải */}
      <Box size={[0.46, 0.032, 0.43]} radius={0.01} position={[0, seat - 0.016, 0]} color={OAK} finish="wood" />
      <Box size={[0.4, 0.04, 0.34]} radius={0.018} position={[0, seat + 0.017, 0.035]} color="#5e7488" finish="fabric" />
      {/* Tựa lưng ngả sau ~7° */}
      <group position={[0, seat - 0.02, back]} rotation={[-0.12, 0, 0]}>
        {SIDES.map((s) => (
          <TaperedLeg key={s} position={[s * x, 0, 0]} h={0.47} top={0.028} bottom={0.036} />
        ))}
        <Extrude shape={rail} depth={0.08} bevel={0.004} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.41, 0]} color={OAK} finish="wood" />
        <Extrude shape={rail} depth={0.032} bevel={0.003} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} color={OAK} finish="wood" />
        <Repeat at={slats} size={[0.034, 0.25, 0.013]} radius={0.004} color={OAK} finish="wood" />
      </group>
    </group>
  );
};

const SOFA = "#7d8ea2";
const SOFA_CUSHION = "#8a9bae";

/** Sofa 3 chỗ vải xám xanh: đệm ngồi, đệm tựa, tay vịn bo tròn, chân gỗ, hai gối tựa (một gối cam) */
export const Couch = () => {
  const seats = [-0.56, 0, 0.56];
  return (
    <group>
      {SIDES.flatMap((sx) =>
        SIDES.map((sz) => (
          <Cylinder
            key={`${sx}:${sz}`}
            rTop={0.026}
            rBottom={0.017}
            h={0.1}
            position={[sx * 0.94, 0.05, sz * 0.34]}
            color={WALNUT}
            finish="wood"
            seg={20}
          />
        )),
      )}
      {/* Khung: đế, lưng, hai tay vịn */}
      <Box size={[1.96, 0.2, 0.88]} radius={0.05} position={[0, 0.2, 0]} color={SOFA} finish="fabric" />
      <Box size={[1.96, 0.5, 0.2]} radius={0.06} position={[0, 0.53, -0.34]} color={SOFA} finish="fabric" />
      {SIDES.map((s) => (
        <Box key={s} size={[0.22, 0.58, 0.9]} radius={0.1} position={[s * 0.96, 0.39, 0]} color={SOFA} finish="fabric" />
      ))}
      {/* Đệm ngồi + đệm tựa ngả sau */}
      {seats.map((x) => (
        <Box key={`seat${x}`} size={[0.55, 0.16, 0.68]} radius={0.07} position={[x, 0.37, 0.08]} color={SOFA_CUSHION} finish="fabric" />
      ))}
      {seats.map((x) => (
        <Box
          key={`back${x}`}
          size={[0.55, 0.46, 0.2]}
          radius={0.09}
          position={[x, 0.68, -0.17]}
          rotation={[-0.16, 0, 0]}
          color={SOFA_CUSHION}
          finish="fabric"
        />
      ))}
      {/* Gối tựa trang trí */}
      <Box size={[0.42, 0.42, 0.13]} radius={0.065} position={[0.58, 0.64, -0.01]} rotation={[-0.3, -0.25, 0.1]} color="#f0782a" finish="fabric" />
      <Box size={[0.4, 0.4, 0.13]} radius={0.065} position={[-0.6, 0.63, -0.02]} rotation={[-0.3, 0.3, -0.12]} color="#e6e0d4" finish="fabric" />
    </group>
  );
};

/** Lá lưỡi hổ hình mác nhọn rộng w, cao h, gốc ở y = 0 (đơn vị dm: lá được thu 0.1 lần cho vân lá đủ mịn) */
const swordLeaf = (w: number, h: number): V2[] => {
  const side: V2[] = (
    [
      [0.3, 0],
      [0.46, 0.12],
      [0.5, 0.36],
      [0.47, 0.62],
      [0.37, 0.8],
      [0.21, 0.92],
      [0.07, 0.985],
    ] as V2[]
  ).map(([x, y]): V2 => [x * w, y * h]);
  return [...side.map(([x, y]): V2 => [-x, y]), [0, h], ...[...side].reverse()];
};

/** Vằn ngang lượn sóng của lá lưỡi hổ (1 ô ảnh = 1 dm, khép kín ở mép để lặp) */
const snakeLeaf = () =>
  drawTexture("furniture:snake-leaf", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#2c5532";
    ctx.fillRect(0, 0, w, h);
    const bands = 3;
    for (const i of range(bands)) {
      const y0 = (i / bands) * h;
      ctx.fillStyle = i % 2 ? "#5f8c52" : "#6a9a5c";
      ctx.beginPath();
      for (const k of range(33)) {
        const x = (k / 32) * w;
        const y = y0 + Math.sin((k / 32) * Math.PI * 4 + i) * h * 0.04;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (const k of range(33).reverse()) {
        const x = (k / 32) * w;
        ctx.lineTo(x, y0 + h * 0.1 + Math.sin((k / 32) * Math.PI * 4 + i + 0.9) * h * 0.035);
      }
      ctx.closePath();
      ctx.fill();
    }
  });

/** Chậu cây lưỡi hổ: chậu đất nung có vành + đĩa lót, đất, sỏi, 16 lá mác nhọn viền vàng */
export const PottedPlant = () => {
  const pot: V2[] = [
    [0, 0.015],
    [0.098, 0.015],
    [0.103, 0.022],
    [0.128, 0.222],
    [0.143, 0.225],
    [0.147, 0.232],
    [0.147, 0.264],
    [0.142, 0.27],
    [0.132, 0.27],
    [0.128, 0.263],
    [0.125, 0.236],
  ];
  const saucer: V2[] = [
    [0, 0],
    [0.128, 0],
    [0.134, 0.004],
    [0.152, 0.026],
    [0.147, 0.028],
    [0.128, 0.008],
    [0, 0.008],
  ];
  const soil = 0.242;
  const rand = seeded(7);
  const leaves = range(16).map((i) => {
    const t = rand(); // 0 = lá giữa cao, thẳng; 1 = lá ngoài thấp, ngả ra
    return {
      turn: (i / 16) * Math.PI * 2 + rand() * 0.35,
      face: (rand() - 0.5) * 1.1,
      offset: 0.012 + t * 0.06,
      tilt: 0.05 + t * 0.36,
      h: 7.4 - t * 3.2 + (rand() - 0.5) * 0.8,
      w: 0.62 + rand() * 0.22,
    };
  });
  const pebbles: RepeatItem[] = range(12).map((i) => {
    const a = i * 2.39 + rand();
    const r = 0.05 + rand() * 0.065;
    return { p: [Math.cos(a) * r, soil + 0.002, Math.sin(a) * r], s: [1, 0.6, 0.8 + rand() * 0.4] };
  });
  return (
    <group>
      <Lathe points={saucer} color="#b85d34" finish="matte" />
      <Lathe points={pot} color="#c4693d" finish="matte" seg={56} />
      <Cylinder r={0.126} h={0.012} position={[0, soil - 0.006, 0]} color="#3b2a1e" finish="matte" seg={40} />
      <Repeat shape="sphere" size={[0.009, 0, 0]} seg={8} at={pebbles} color="#cfc8bb" finish="matte" />
      {leaves.map((leaf, i) => (
        <group key={i} rotation={[0, leaf.turn, 0]}>
          <group position={[0, soil - 0.01, leaf.offset]} rotation={[leaf.tilt, 0, 0]}>
            <group rotation={[0, leaf.face, 0]} scale={0.1}>
              {/* Viền vàng phía sau, phiến xanh có vằn dày hơn nhô ra hai mặt */}
              <Extrude shape={swordLeaf(leaf.w, leaf.h)} depth={0.035} bevel={0.012} color="#cfc45e" finish="organic" />
              <Extrude
                shape={swordLeaf(leaf.w * 0.78, leaf.h * 0.965)}
                depth={0.07}
                bevel={0.012}
                color="#ffffff"
                map={snakeLeaf()}
                finish="organic"
              />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
};

/** Giường đôi: khung gỗ óc chó, đầu giường bọc nệm chần sọc, nệm, chăn, khăn gấp cuối giường, hai gối */
export const Bed = () => {
  const legs: V3[] = SIDES.flatMap((sx) => SIDES.map((sz): V3 => [sx * 0.78, 0.06, sz * 0.97 + 0.02]));
  const channels: V3[] = range(8).map((i): V3 => [-0.7 + i * 0.2, 0.79, -1.0]);
  return (
    <group>
      <Repeat shape="cylinder" at={legs} size={[0.03, 0.12, 0]} seg={16} color={WALNUT} finish="wood" />
      <Box size={[1.7, 0.22, 2.1]} radius={0.025} position={[0, 0.23, 0.02]} color={WALNUT} finish="wood" />
      {/* Đầu giường: tấm gỗ + nệm chần sọc đứng */}
      <Box size={[1.78, 0.98, 0.07]} radius={0.025} position={[0, 0.61, -1.06]} color={WALNUT} finish="wood" />
      <Repeat at={channels} size={[0.196, 0.6, 0.06]} radius={0.028} color="#c2b4a2" finish="fabric" />
      {/* Nệm, chăn phủ, mép ga gấp ngược, khăn phủ cuối giường */}
      <Box size={[1.6, 0.22, 2.0]} radius={0.05} position={[0, 0.45, 0.02]} color="#ece8e1" finish="fabric" />
      <Box size={[1.7, 0.27, 1.46]} radius={0.04} position={[0, 0.485, 0.31]} color="#8ea4b9" finish="fabric" />
      <Box size={[1.72, 0.045, 0.2]} radius={0.02} position={[0, 0.62, -0.38]} color="#f5f3ee" finish="fabric" />
      <Box size={[1.74, 0.3, 0.44]} radius={0.025} position={[0, 0.483, 0.74]} color="#d4923a" finish="fabric" />
      {SIDES.map((s) => (
        <Box
          key={s}
          size={[0.66, 0.15, 0.42]}
          radius={0.07}
          position={[s * 0.38, 0.64, -0.78]}
          rotation={[-0.4, 0, 0]}
          color="#f7f5f1"
          finish="fabric"
        />
      ))}
    </group>
  );
};

/** Bàn ăn gỗ sồi: mặt bàn bo cạnh, chân vuông vuốt thon, khăn trải giữa, 4 đĩa kèm dao nĩa, bát trái cây, đôi chân nến */
export const DiningTable = () => {
  const top = 0.75;
  const legH = top - 0.04;
  const plates: [number, number][] = [
    [-0.42, 0.27],
    [0.42, 0.27],
    [-0.42, -0.27],
    [0.42, -0.27],
  ];
  const plate: V2[] = [
    [0, 0.001],
    [0.06, 0],
    [0.068, 0.006],
    [0.11, 0.015],
    [0.128, 0.02],
    [0.126, 0.023],
    [0.108, 0.019],
    [0.066, 0.01],
    [0, 0.009],
  ];
  const bowl: V2[] = [
    [0, 0.002],
    [0.05, 0],
    [0.055, 0.01],
    [0.11, 0.05],
    [0.14, 0.088],
    [0.134, 0.091],
    [0.105, 0.058],
    [0.05, 0.021],
    [0, 0.019],
  ];
  const candlestick: V2[] = [
    [0, 0],
    [0.034, 0],
    [0.034, 0.006],
    [0.012, 0.016],
    [0.008, 0.07],
    [0.012, 0.09],
    [0.018, 0.105],
    [0.016, 0.112],
    [0, 0.112],
  ];
  const cutlery: V3[] = plates.flatMap(([x, z]) => SIDES.map((s): V3 => [x + s * 0.165, top + 0.004, z]));
  const fruit = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, top + y, Math.sin(a) * r];
  return (
    <group>
      {SIDES.flatMap((sx) =>
        SIDES.map((sz) => <TaperedLeg key={`${sx}:${sz}`} position={[sx * 0.7, 0, sz * 0.36]} h={legH} top={0.06} bottom={0.04} />),
      )}
      <Repeat
        at={[
          ...SIDES.map((s): RepeatItem => ({ p: [0, legH - 0.045, s * 0.36], s: [1.36, 0.09, 0.022] })),
          ...SIDES.map((s): RepeatItem => ({ p: [s * 0.7, legH - 0.045, 0], s: [0.022, 0.09, 0.66] })),
        ]}
        color={OAK}
        finish="wood"
      />
      <Box size={[1.6, 0.04, 0.9]} radius={0.014} position={[0, top - 0.02, 0]} color={OAK} finish="wood" />
      {/* Khăn trải dọc bàn, buông hai đầu */}
      <Box size={[1.606, 0.004, 0.32]} position={[0, top + 0.002, 0]} color="#e3d9c6" finish="fabric" />
      {SIDES.map((s) => (
        <Box key={s} size={[0.004, 0.14, 0.32]} position={[s * 0.803, top - 0.068, 0]} color="#e3d9c6" finish="fabric" />
      ))}
      {plates.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, top, z]}>
          <Lathe points={plate} color={PORCELAIN} finish="ceramic" seg={40} />
          <Torus r={0.121} tube={0.0024} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0212, 0]} color="#2f6d8c" finish="ceramic" seg={40} radialSeg={6} />
        </group>
      ))}
      <Repeat at={cutlery} size={[0.016, 0.004, 0.19]} radius={0.0015} color="#d4d8dd" finish="chrome" />
      {/* Bát trái cây giữa bàn */}
      <Lathe points={bowl} position={[0, top + 0.004, 0]} color="#2f6d8c" finish="ceramic" seg={40} />
      <Repeat shape="sphere" size={[0.042, 0, 0]} at={[fruit(0.3, 0.06, 0.06), fruit(2.4, 0.06, 0.06), fruit(4.3, 0.055, 0.065), [0, top + 0.115, 0]]} color="#f08a24" finish="organic" />
      <Repeat shape="sphere" size={[0.04, 0, 0]} at={[fruit(1.35, 0.085, 0.072), fruit(5.4, 0.08, 0.075)]} color="#9cc04a" finish="organic" />
      {/* Đôi chân nến đồng hai bên bát */}
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.32, top + 0.004, 0]}>
          <Lathe points={candlestick} color="#c9a45c" finish="metal" seg={24} />
          <Cylinder r={0.011} h={0.15} position={[0, 0.185, 0]} color="#f6f1e4" finish="matte" seg={16} />
          <Sphere r={0.008} scale={[1, 1.9, 1]} position={[0, 0.272, 0]} color="#ffb347" finish="glow" emissiveIntensity={1.4} seg={12} />
        </group>
      ))}
    </group>
  );
};

/** Bồn cầu sứ trắng: bệ thon, lòng bồn có nước, két nước có nút xả, bệ ngồi, nắp đang mở dựng vào két */
export const Toilet = () => {
  const bowl: V2[] = [
    [0, 0],
    [0.105, 0],
    [0.11, 0.008],
    [0.1, 0.05],
    [0.092, 0.12],
    [0.1, 0.2],
    [0.125, 0.27],
    [0.15, 0.33],
    [0.165, 0.37],
    [0.172, 0.39],
    [0.17, 0.4],
    [0.16, 0.404],
    [0.146, 0.4],
    [0.13, 0.38],
    [0.11, 0.345],
    [0.08, 0.3],
    [0.05, 0.27],
    [0.025, 0.252],
    [0, 0.248],
  ];
  // Mặt cắt dọc [z, y] của khối sau, thu vào 0.045 cho phần vát tròn
  const rear: V2[] = [
    [-0.045, 0.045],
    [-0.045, 0.12],
    [-0.065, 0.2],
    [-0.093, 0.27],
    [-0.122, 0.33],
    [-0.15, 0.36],
    [-0.23, 0.36],
    [-0.23, 0.045],
  ];
  const bowlZ = 0.11; // tâm lòng bồn (lệch về trước, két ở sau)
  const stretch = 1.3; // lòng bồn thuôn dài theo z
  const tankZ = -0.205;
  return (
    <group>
      <Lathe points={bowl} scale={[1, 1, stretch]} position={[0, 0, bowlZ]} color={PORCELAIN} finish="ceramic" seg={56} />
      {/* Khối sau đỡ két (dựng theo mặt cắt dọc, vát tròn): mép trước ôm lưng lòng bồn, mép sau thẳng dưới két */}
      <Extrude shape={rear} depth={0.15} bevel={0.045} rotation={[0, -Math.PI / 2, 0]} color={PORCELAIN} finish="ceramic" />
      {/* Nước trong lòng bồn */}
      <Cylinder r={0.079} h={0.004} scale={[1, 1, stretch]} position={[0, 0.3, bowlZ]} color="#cfe6ee" finish="glass" opacity={0.75} seg={40} />
      {/* Két nước + nắp két + nút xả */}
      <Box size={[0.38, 0.33, 0.17]} radius={0.035} position={[0, 0.57, tankZ]} color={PORCELAIN} finish="ceramic" />
      <Box size={[0.4, 0.03, 0.19]} radius={0.012} position={[0, 0.747, tankZ]} color={PORCELAIN} finish="ceramic" />
      <Cylinder r={0.026} h={0.01} position={[0, 0.766, tankZ]} color="#d4d8dd" finish="chrome" seg={32} />
      <Box size={[0.003, 0.004, 0.05]} position={[0, 0.771, tankZ]} color="#8a9099" finish="metal" />
      {/* Bệ ngồi hình vành elip */}
      <Extrude
        shape={ellipse(0.176, 0.226, 48)}
        holes={[ellipse(0.112, 0.15, 40, 0, -0.012)]}
        depth={0.02}
        bevel={0.006}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.418, bowlZ]}
        color="#f7f7f5"
        finish="plastic"
      />
      {/* Bản lề xám + nắp dựng đứng, ngả nhẹ vào két */}
      {SIDES.map((s) => (
        <Cylinder key={s} r={0.012} h={0.045} rotation={[0, 0, Math.PI / 2]} position={[s * 0.075, 0.43, -0.105]} color="#c3c8ce" finish="metal" seg={16} />
      ))}
      <group position={[0, 0.43, -0.098]} rotation={[-Math.PI / 2 - 0.03, 0, 0]}>
        <Extrude
          shape={ellipse(0.176, 0.226, 48)}
          depth={0.016}
          bevel={0.006}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0.228]}
          color="#f7f7f5"
          finish="plastic"
        />
      </group>
      {/* Nắp chụp bu lông hai bên chân bệ */}
      {SIDES.map((s) => (
        <Sphere key={s} r={0.016} position={[s * 0.104, 0.034, bowlZ]} scale={[1, 0.75, 1]} color={PORCELAIN} finish="ceramic" seg={16} />
      ))}
    </group>
  );
};
