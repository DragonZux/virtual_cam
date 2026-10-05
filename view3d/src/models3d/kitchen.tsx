// Mô hình 3D nhóm Nhà bếp: chai, ly rượu vang, cốc, nĩa, dao, thìa, bát
import { Box, Cylinder, Extrude, Lathe, Sphere, Torus, Tube } from "./parts";
import { ellipse, type V2 } from "./shapes";
import { label } from "./textures";

/** Đồ ăn dạng dẹt (nĩa, dao, thìa) dựng nghiêng chéo để camera thấy rõ mặt phẳng */
const TILT: [number, number, number] = [0, 0, 0.95];

/** Chai nước nhựa trong: thân, nước bên trong, nhãn, nắp vặn */
export const Bottle = () => {
  const body: V2[] = [
    [0, 0.003],
    [0.026, 0],
    [0.033, 0.004],
    [0.036, 0.016],
    [0.036, 0.05],
    [0.0335, 0.06],
    [0.036, 0.07],
    [0.036, 0.15],
    [0.033, 0.172],
    [0.024, 0.196],
    [0.0165, 0.212],
    [0.0148, 0.226],
  ];
  const water: V2[] = [
    [0, 0.006],
    [0.03, 0.006],
    [0.033, 0.016],
    [0.033, 0.05],
    [0.031, 0.06],
    [0.033, 0.07],
    [0.033, 0.135],
    [0, 0.135],
  ];
  return (
    <group>
      <Lathe points={water} color="#7fbcf2" finish="glass" opacity={0.5} />
      <Lathe points={body} color="#d6ecff" finish="glass" />
      <Cylinder
        r={0.0368}
        h={0.055}
        open
        position={[0, 0.11, 0]}
        rotation={[0, Math.PI, 0]}
        color="#ffffff"
        map={label("AQUA", { bg: "#fb8020", fg: "#ffffff", aspect: 4.2, size: 0.5 })}
        finish="plastic"
        doubleSide
      />
      <Cylinder r={0.0165} h={0.006} position={[0, 0.229, 0]} color="#e6f2ff" finish="plastic" />
      <Cylinder r={0.0158} h={0.02} position={[0, 0.242, 0]} color="#2f7fd6" finish="plastic" seg={24} />
      <Cylinder r={0.0145} h={0.002} position={[0, 0.2525, 0]} color="#5a9be3" finish="plastic" seg={24} />
    </group>
  );
};

/** Ly vang thuỷ tinh: đế, chân mảnh, bầu ly có rượu đỏ */
export const WineGlass = () => {
  const glass: V2[] = [
    [0, 0.002],
    [0.034, 0.001],
    [0.036, 0.003],
    [0.03, 0.005],
    [0.006, 0.008],
    [0.0038, 0.02],
    [0.0036, 0.085],
    [0.006, 0.096],
    [0.02, 0.104],
    [0.034, 0.118],
    [0.041, 0.138],
    [0.04, 0.165],
    [0.036, 0.188],
    [0.0335, 0.2],
  ];
  const wine: V2[] = [
    [0, 0.098],
    [0.018, 0.105],
    [0.032, 0.118],
    [0.0385, 0.135],
    [0, 0.135],
  ];
  return (
    <group>
      <Lathe points={wine} color="#8a1538" finish="plastic" opacity={0.9} />
      <Lathe points={glass} color="#eef6ff" finish="glass" seg={64} />
      <Torus r={0.0335} tube={0.0012} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} color="#ffffff" finish="glass" />
    </group>
  );
};

/** Cốc sứ: thân cam, lòng trắng, quai, cà phê bên trong */
export const Cup = () => {
  const outer: V2[] = [
    [0, 0.001],
    [0.036, 0],
    [0.04, 0.004],
    [0.0415, 0.02],
    [0.042, 0.088],
    [0.0412, 0.0945],
    [0.0385, 0.0955],
  ];
  const inner: V2[] = [
    [0.0383, 0.0955],
    [0.0368, 0.09],
    [0.036, 0.016],
    [0.03, 0.01],
    [0, 0.0095],
  ];
  return (
    <group>
      <Lathe points={outer} color="#fb8020" finish="ceramic" />
      <Lathe points={inner} color="#fafafa" finish="ceramic" />
      <Cylinder r={0.0362} h={0.002} position={[0, 0.075, 0]} color="#5b3a22" finish="gloss" />
      <Torus
        r={0.026}
        tube={0.0065}
        arc={Math.PI * 1.15}
        rotation={[0, 0, -Math.PI * 0.575]}
        position={[0.04, 0.05, 0]}
        color="#fb8020"
        finish="ceramic"
      />
    </group>
  );
};

/** Nĩa inox 4 răng */
export const Fork = () => {
  const outline: V2[] = [
    [-0.102, 0],
    [-0.1, -0.0065],
    [-0.092, -0.0085],
    [-0.02, -0.0065],
    [0.03, -0.0035],
    [0.045, -0.0045],
    [0.062, -0.012],
    [0.07, -0.013],
    [0.116, -0.013],
    [0.116, -0.0088],
    [0.076, -0.0088],
    [0.076, -0.0058],
    [0.118, -0.0058],
    [0.118, -0.0014],
    [0.076, -0.0014],
    [0.076, 0.0014],
    [0.118, 0.0014],
    [0.118, 0.0058],
    [0.076, 0.0058],
    [0.076, 0.0088],
    [0.116, 0.0088],
    [0.116, 0.013],
    [0.07, 0.013],
    [0.062, 0.012],
    [0.045, 0.0045],
    [0.03, 0.0035],
    [-0.02, 0.0065],
    [-0.092, 0.0085],
    [-0.1, 0.0065],
  ];
  return (
    <group rotation={TILT}>
      <Extrude shape={outline} depth={0.0026} bevel={0.0007} color="#d4d8dd" finish="chrome" />
    </group>
  );
};

/** Dao bếp: lưỡi thép, chuôi gỗ có đinh tán */
export const Knife = () => {
  const blade: V2[] = [
    [-0.005, -0.012],
    [0.07, -0.0125],
    [0.11, -0.009],
    [0.135, -0.002],
    [0.145, 0.004],
    [0.12, 0.009],
    [0.05, 0.0105],
    [-0.005, 0.0105],
  ];
  return (
    <group rotation={TILT}>
      <Extrude shape={blade} depth={0.0022} bevel={0.0005} position={[0, 0.0005, 0]} color="#cfd4da" finish="chrome" />
      <Box size={[0.012, 0.026, 0.008]} radius={0.002} position={[-0.008, 0, 0]} color="#b9bec5" finish="metal" />
      <Box size={[0.105, 0.021, 0.014]} radius={0.006} position={[-0.066, -0.0005, 0]} color="#5a3824" finish="wood" />
      {[-0.035, -0.066, -0.097].map((x) => (
        <Cylinder key={x} r={0.0022} h={0.0152} rotation={[Math.PI / 2, 0, 0]} position={[x, -0.0005, 0]} color="#d9dde2" finish="chrome" seg={12} />
      ))}
    </group>
  );
};

/** Thìa inox: cán thon, lòng thìa lõm */
export const Spoon = () => {
  const handle: V2[] = [
    [-0.105, 0],
    [-0.103, -0.006],
    [-0.095, -0.0085],
    [-0.02, -0.0055],
    [0.03, -0.0028],
    [0.045, -0.0035],
    [0.045, 0.0035],
    [0.03, 0.0028],
    [-0.02, 0.0055],
    [-0.095, 0.0085],
    [-0.103, 0.006],
  ];
  return (
    <group rotation={TILT}>
      <Extrude shape={handle} depth={0.0026} bevel={0.0007} color="#d4d8dd" finish="chrome" />
      {/* Lòng thìa: chỏm cầu dẹt, mặt lõm quay về phía trước */}
      <Sphere
        r={1}
        thetaLength={Math.PI * 0.42}
        rotation={[0, 0, -Math.PI / 2]}
        scale={[0.012, 0.021, 0.0145]}
        position={[0.067, 0, -0.0035]}
        color="#d4d8dd"
        finish="chrome"
        doubleSide
      />
      <Extrude shape={ellipse(0.0215, 0.0148, 40, 0.067)} depth={0.0012} bevel={0.0004} position={[0, 0, -0.0012]} color="#c9ced4" finish="chrome" />
    </group>
  );
};

/** Bát sứ: chân đế, thành dày, viền xanh, cơm bên trong */
export const Bowl = () => {
  const shell: V2[] = [
    [0, 0.006],
    [0.03, 0.006],
    [0.031, 0],
    [0.04, 0],
    [0.042, 0.007],
    [0.064, 0.03],
    [0.075, 0.055],
    [0.0775, 0.063],
    [0.0745, 0.064],
    [0.071, 0.056],
    [0.061, 0.033],
    [0.04, 0.014],
    [0, 0.012],
  ];
  return (
    <group>
      <Lathe points={shell} color="#f4f1ea" finish="ceramic" seg={64} />
      <Torus r={0.0763} tube={0.0017} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0585, 0]} color="#2f6db5" finish="ceramic" />
      <Torus r={0.0606} tube={0.0013} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.026, 0]} color="#2f6db5" finish="ceramic" />
      {/* Cơm vun */}
      <Sphere r={1} thetaLength={Math.PI / 2} scale={[0.064, 0.022, 0.064]} position={[0, 0.042, 0]} color="#fbfaf5" finish="matte" />
      {/* Đôi đũa gác trên miệng bát */}
      <Tube path={[[-0.11, 0.07, 0.03], [0.1, 0.064, -0.01]]} r={0.0028} taper={[1, 0.65]} color="#8a5a35" finish="wood" />
      <Tube path={[[-0.11, 0.07, 0.042], [0.1, 0.064, 0.006]]} r={0.0028} taper={[1, 0.65]} color="#8a5a35" finish="wood" />
    </group>
  );
};
