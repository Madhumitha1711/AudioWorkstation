export const DEFAULTS = {
  floor: -60,
  gateOpen: -32,
  gateClose: -38,
  attack: 2,
  release: 30,
  hold: 10,
};
export const DEFAULT_SIDECHAIN = { external: false, listen: false, hpf: 20 };

const ADDR = {
  floor: '/NOISE_GATE_STUDIO/Floor',
  gateOpen: '/NOISE_GATE_STUDIO/Gate_Open',
  gateClose: '/NOISE_GATE_STUDIO/Gate_Close',
  attack: '/NOISE_GATE_STUDIO/Attack',
  release: '/NOISE_GATE_STUDIO/Release',
  hold: '/NOISE_GATE_STUDIO/Hold',
  sidechain: {
    external: '/NOISE_GATE_STUDIO/External_Sidechain',
    listen: '/NOISE_GATE_STUDIO/SC_Listen',
    hpf: '/NOISE_GATE_STUDIO/SC_HPF',
  },
};

export function pushFaustParams(node, params, sidechain) {
  node.setParamValue(ADDR.floor, params.floor);
  node.setParamValue(ADDR.gateOpen, params.gateOpen);
  node.setParamValue(ADDR.gateClose, Math.min(params.gateClose, params.gateOpen));
  node.setParamValue(ADDR.attack, params.attack);
  node.setParamValue(ADDR.release, params.release);
  node.setParamValue(ADDR.hold, params.hold);
  node.setParamValue(ADDR.sidechain.external, sidechain.external ? 1 : 0);
  node.setParamValue(ADDR.sidechain.listen, sidechain.listen ? 1 : 0);
  node.setParamValue(ADDR.sidechain.hpf, sidechain.hpf);
}

export const METER_FLOOR_DB = -60;
