// The slime's 3D model (D793): "Slime Enemy" by Quaternius, public domain (CC0), from
// https://poly.pizza/m/eSLKTsbl7F. A rigged low-poly slime, solid colours (no textures), with
// Jump, Walk and Bite clips. Served from public/models/slime.glb (160 KB) and loaded once per
// page, with the scene's chunk, before a run starts (SlimeGame awaits it).
import type { AnimationClip, Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const SLIME_MODEL_URL = "/models/slime.glb";

/** The clips slimeFx plays, by the names in the file. */
const CLIPS = {
  jump: "MonsterArmature|Jump",
  walk: "MonsterArmature|Walk",
  bite: "MonsterArmature|Bite_InPlace",
} as const;

export type SlimeModel = {
  /** The model as loaded: cloned per slime (SkeletonUtils.clone), never added to the scene itself. */
  scene: Group;
  clips: Record<keyof typeof CLIPS, AnimationClip>;
};

/** A model from the file's bytes. Rejects a file without the clips slimeFx plays. */
export async function parseSlimeModel(data: ArrayBuffer): Promise<SlimeModel> {
  const gltf = await new GLTFLoader().parseAsync(data, "");
  const find = (name: string) => {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) throw new Error(`slime model: no clip ${name}`);
    return clip;
  };
  return { scene: gltf.scene, clips: { jump: find(CLIPS.jump), walk: find(CLIPS.walk), bite: find(CLIPS.bite) } };
}

let loading: Promise<SlimeModel> | null = null;
let loaded: SlimeModel | null = null;

/** Fetches and parses the model once per page; a failure is forgotten, so the next call tries again. */
export function loadSlimeModel(): Promise<SlimeModel> {
  loading ??= fetch(SLIME_MODEL_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`slime model: ${r.status}`);
      return r.arrayBuffer();
    })
    .then(parseSlimeModel)
    .then((m) => (loaded = m))
    .catch((e: unknown) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** The model, once `loadSlimeModel` has resolved; null before. */
export function slimeModelNow(): SlimeModel | null {
  return loaded;
}
