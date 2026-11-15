import type { Exercise, MuscleGroup } from '../types'

/** The muscles the body map draws. Finer than MuscleGroup, which filters and balances. */
export type Muscle =
  | 'chest'
  | 'delts'
  | 'rearDelts'
  | 'traps'
  | 'lats'
  | 'lowerBack'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'

export const MUSCLE_NAME: Record<Muscle, string> = {
  chest: '胸大肌',
  delts: '三角肌',
  rearDelts: '後三角肌',
  traps: '斜方肌',
  lats: '背闊肌',
  lowerBack: '下背',
  biceps: '肱二頭肌',
  triceps: '肱三頭肌',
  forearms: '前臂',
  abs: '腹肌',
  obliques: '腹斜肌',
  glutes: '臀肌',
  quads: '股四頭肌',
  hamstrings: '膕繩肌',
  calves: '小腿',
}

export interface MuscleTargets {
  primary: Muscle[]
  secondary: Muscle[]
}

/** "quads glutes | hamstrings": the main movers, then the helpers. */
const t = (spec: string): MuscleTargets => {
  const [primary, secondary = ''] = spec.split('|')
  const list = (s: string) => s.split(' ').filter(Boolean) as Muscle[]
  return { primary: list(primary), secondary: list(secondary) }
}

/** What each built-in move works: the main movers, then the helpers. */
export const EXERCISE_MUSCLES: Record<string, MuscleTargets> = {
  px_footwork: t('quads glutes | hamstrings calves abs'),
  px_hundred_r: t('abs | obliques delts'),
  px_bridge_r: t('glutes hamstrings | lowerBack abs'),
  px_feetstraps: t('hamstrings | abs glutes quads'),
  px_shortspine: t('abs | hamstrings lowerBack'),
  px_coordination: t('abs | quads triceps'),
  px_backstroke: t('abs | delts quads'),
  px_rowing: t('delts | rearDelts triceps abs'),
  px_armsstraps: t('lats triceps | abs chest'),
  px_chestexp: t('lats rearDelts | triceps abs'),
  px_pullstraps: t('lats rearDelts | lowerBack triceps'),
  px_shortbox: t('abs obliques | lowerBack'),
  px_elephant: t('abs hamstrings | delts calves'),
  px_kneestretch: t('abs | delts quads glutes'),
  px_longstretch: t('abs delts | chest triceps glutes'),
  px_downstretch: t('lowerBack | delts abs glutes'),
  px_upstretch: t('abs | delts hamstrings'),
  px_stomachmassage: t('abs | quads calves'),
  px_semicircle: t('lowerBack glutes | abs hamstrings'),
  px_sidesplits: t('quads glutes | abs hamstrings'),
  px_frontsplits: t('quads hamstrings | glutes abs'),
  px_scooter: t('glutes | hamstrings quads abs'),
  px_mermaid_r: t('obliques | lats'),
  px_teaser_r: t('abs | obliques quads'),
  px_hundred: t('abs | obliques delts'),
  px_rollup: t('abs | obliques'),
  px_legcircles: t('abs | quads glutes'),
  px_rolling: t('abs | lowerBack'),
  px_singleleg: t('abs | obliques quads'),
  px_doubleleg: t('abs | delts quads'),
  px_criss: t('obliques | abs'),
  px_spinestretch: t('lowerBack | hamstrings abs'),
  px_saw: t('obliques | lowerBack hamstrings'),
  px_swan: t('lowerBack | glutes delts traps'),
  px_singlekick: t('hamstrings | glutes lowerBack'),
  px_sidekick: t('glutes | quads hamstrings obliques'),
  px_teaser: t('abs | obliques quads'),
  px_swimming: t('lowerBack glutes | delts hamstrings'),
  px_legpullfront: t('abs delts | glutes triceps'),
  px_sidebend: t('obliques | delts'),
  px_bridge: t('glutes hamstrings | abs lowerBack'),
  px_corkscrew: t('obliques abs'),
  px_seal: t('abs'),
  px_pushup: t('chest triceps | abs delts'),
  px_chair_footwork: t('quads calves | glutes abs'),
  px_chair_mountain: t('glutes quads | hamstrings abs'),
  px_chair_pike: t('abs | delts triceps'),
  px_chair_swan: t('lowerBack traps | delts glutes'),
  px_chair_triceps: t('triceps | delts abs'),
  px_cad_rollback: t('abs | lats'),
  px_cad_legsprings: t('hamstrings glutes | abs quads'),
  px_cad_armsprings: t('lats triceps | biceps abs'),
  px_cad_pushthrough: t('lats delts | lowerBack hamstrings'),
  px_cad_catstretch: t('lowerBack | abs lats'),
  px_barrel_swan: t('lowerBack | glutes'),
  px_barrel_side: t('obliques | lats'),
  px_barrel_horseback: t('glutes abs | quads'),
  px_ring_squeeze: t('quads | abs glutes'),
  px_ring_press: t('chest | delts triceps'),
  px_band_rotation: t('rearDelts | delts'),
  px_ball_bridge: t('glutes hamstrings | abs'),
  px_arm_weights: t('delts biceps | triceps traps'),
  px_jumpboard: t('quads calves | glutes hamstrings'),
  px_walk: t('quads calves | glutes hamstrings'),
  px_run: t('quads hamstrings calves | glutes'),
}

/** A custom exercise only has its group: light up what that group usually means. */
const BY_GROUP: Record<MuscleGroup, MuscleTargets> = {
  legs: t('quads hamstrings | glutes calves'),
  back: t('lats traps lowerBack | rearDelts biceps'),
  chest: t('chest | delts triceps'),
  shoulders: t('delts rearDelts | traps'),
  arms: t('biceps triceps | forearms'),
  glutes: t('glutes | hamstrings'),
  core: t('abs obliques'),
  cardio: t(''),
}

export const musclesOf = (e: Pick<Exercise, 'id' | 'muscleGroup'>): MuscleTargets => EXERCISE_MUSCLES[e.id] ?? BY_GROUP[e.muscleGroup]
