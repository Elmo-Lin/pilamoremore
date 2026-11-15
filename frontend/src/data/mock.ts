// Fictional demo data: a Pilates studio. All people, numbers and notes are invented.
// The generator is deterministic (seeded RNG) but dates are relative to the
// moment of seeding, so the demo always shows "recent" activity.
import type {
  AppData,
  Appointment,
  Coach,
  CoachStudentRelationship,
  DemoSession,
  ExerciseLog,
  ProgressMetric,
  SessionPackage,
  SessionTransaction,
  SetLog,
  Student,
  TrainingGoal,
  WorkoutSession,
} from '../types'
import { EXERCISES } from './exercises'

/** Bump to regenerate demo data already saved in visitors' browsers (e.g. after reshaping the samples). */
export const SCHEMA_VERSION = 3
export const COACH_ID = 'coach_vivian'
export const DEFAULT_DEMO_STUDENT_ID = 'stu_01'
const STUDIO_NAME = '光合皮拉提斯'
/** The demo is a studio of four teachers: Vivian owns it and teaches too; Amy, Joanne and Ken teach the students below. */
const AMY_ID = 'coach_amy'
const JOANNE_ID = 'coach_joanne'
const KEN_ID = 'coach_ken'
const TEACHERS: Record<string, string> = {
  stu_03: AMY_ID,
  stu_05: AMY_ID,
  stu_07: AMY_ID,
  stu_11: AMY_ID,
  stu_20: AMY_ID,
  stu_06: JOANNE_ID,
  stu_08: JOANNE_ID,
  stu_09: JOANNE_ID,
  stu_14: JOANNE_ID,
  stu_15: JOANNE_ID,
  stu_16: JOANNE_ID,
  stu_10: KEN_ID,
  stu_12: KEN_ID,
  stu_17: KEN_ID,
  stu_18: KEN_ID,
  stu_19: KEN_ID,
}
const teacherOf = (studentId: string) => TEACHERS[studentId] ?? COACH_ID

const HISTORY_WEEKS = 18
const DAY = 86400000
/** A private Pilates session. */
const CLASS_MIN = 55

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Session menus a teacher rotates through (demo data only: there are no plans in the app)
// ---------------------------------------------------------------------------

/** [move, sets, base reps, springs (null off the springs)] */
type Item = [exerciseId: string, sets: number, reps: number, springs: string | null]

type MenuId = 'reformerBasic' | 'reformerInter' | 'matFlow' | 'posture' | 'postnatal' | 'apparatus' | 'homeMat'

const MENUS: Record<MenuId, { name: string; items: Item[]; jumpBoard?: boolean }> = {
  reformerBasic: {
    name: '核心床基礎',
    items: [
      ['px_footwork', 3, 10, '3紅'],
      ['px_hundred_r', 1, 10, '1紅1藍'],
      ['px_bridge_r', 1, 8, '2紅'],
      ['px_feetstraps', 2, 8, '1紅1藍'],
      ['px_elephant', 1, 8, '1紅1藍'],
      ['px_kneestretch', 1, 8, '1紅1藍'],
      ['px_mermaid_r', 1, 4, '1紅'],
    ],
  },
  reformerInter: {
    name: '核心床進階',
    jumpBoard: true,
    items: [
      ['px_footwork', 3, 10, '3紅1藍'],
      ['px_hundred_r', 1, 10, '1紅1藍'],
      ['px_shortspine', 1, 5, '2紅'],
      ['px_coordination', 1, 6, '1紅'],
      ['px_rowing', 2, 6, '1藍'],
      ['px_longstretch', 1, 5, '1紅1藍'],
      ['px_downstretch', 1, 5, '1紅'],
      ['px_shortbox', 1, 8, '1藍'],
      ['px_scooter', 2, 8, '1紅'],
      ['px_teaser_r', 1, 4, '1藍'],
    ],
  },
  matFlow: {
    name: '墊上流動',
    items: [
      ['px_hundred', 1, 10, null],
      ['px_rollup', 1, 6, null],
      ['px_legcircles', 2, 5, null],
      ['px_rolling', 1, 8, null],
      ['px_singleleg', 1, 10, null],
      ['px_doubleleg', 1, 8, null],
      ['px_spinestretch', 1, 5, null],
      ['px_saw', 1, 4, null],
      ['px_swan', 1, 4, null],
      ['px_sidekick', 2, 8, null],
      ['px_teaser', 1, 4, null],
      ['px_seal', 1, 6, null],
    ],
  },
  posture: {
    name: '體態矯正',
    items: [
      ['px_footwork', 3, 10, '3紅'],
      ['px_bridge_r', 1, 8, '2紅'],
      ['px_chestexp', 1, 6, '1藍'],
      ['px_pullstraps', 1, 6, '1藍'],
      ['px_cad_catstretch', 1, 4, '1黃'],
      ['px_barrel_swan', 1, 5, null],
      ['px_band_rotation', 2, 10, null],
      ['px_mermaid_r', 1, 4, '1紅'],
    ],
  },
  postnatal: {
    name: '產後修復',
    items: [
      ['px_bridge', 1, 10, null],
      ['px_ring_squeeze', 2, 10, null],
      ['px_feetstraps', 2, 8, '1紅'],
      ['px_hundred', 1, 5, null],
      ['px_singleleg', 1, 8, null],
      ['px_ball_bridge', 1, 10, null],
      ['px_sidekick', 2, 8, null],
    ],
  },
  apparatus: {
    name: '小器械綜合',
    items: [
      ['px_chair_footwork', 2, 10, '1紅1藍'],
      ['px_chair_mountain', 2, 6, '1紅'],
      ['px_chair_pike', 1, 5, '1藍'],
      ['px_cad_rollback', 1, 6, '1黃'],
      ['px_cad_legsprings', 2, 8, '1藍'],
      ['px_cad_pushthrough', 1, 5, '1藍'],
      ['px_barrel_side', 2, 5, null],
      ['px_chair_triceps', 1, 8, '1藍'],
    ],
  },
  homeMat: {
    name: '在家墊上',
    items: [
      ['px_hundred', 1, 10, null],
      ['px_rollup', 1, 6, null],
      ['px_singleleg', 1, 10, null],
      ['px_criss', 1, 10, null],
      ['px_bridge', 1, 10, null],
      ['px_swimming', 1, 10, null],
      ['px_sidebend', 1, 4, null],
    ],
  },
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

interface Profile {
  student: Omit<Student, 'role' | 'createdAt' | 'joinedAt'>
  joinedWeeksAgo: number
  stoppedWeeksAgo?: number
  /** Weekdays (0=Sun) for private sessions / practice on their own. */
  coachedDays: number[]
  independentDays: number[]
  hour: number
  /** Menus the teacher rotates through (practice at home is always the home mat menu). */
  menus: MenuId[]
  /** Extra reps over each move's base on day one (0 = new to Pilates). */
  level: number
  /** Extra reps gained per week of practice. */
  repRate: number
  packageSize: 10 | 20
  pricePerSession: number
  targetRemaining: number
  bodyweight: number
  bodyweightTrend: number
  /** Leave the most recent private session un-deducted, to demo the separate action. */
  pendingLast?: boolean
  adjustments?: { weeksAgo: number; delta: number; reason: string }[]
  /** Stopped because they left to practise on their own (a self-practitioner now); the studio keeps their record. */
  leftToSelf?: boolean
  /** Roster filler: who teaches them, and lighter records (4 moves, no notes) to keep the demo small. */
  coachId?: string
  compact?: boolean
}

const PROFILES: Profile[] = [
  {
    student: {
      id: 'stu_01', name: 'Emily Chen', email: 'emily.chen@example.com', phone: '0912-345-678', gender: 'female',
      birthYear: 1994, heightCm: 162, goal: 'core', goalDetail: '改善久坐腰痠，半年內完成 V 字平衡',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '學習快，核心控制進步明顯。平日晚上時間穩定，週末偶爾出差。',
    },
    joinedWeeksAgo: 30, coachedDays: [2, 4], independentDays: [6], hour: 19, menus: ['reformerBasic', 'reformerInter'], level: 1, repRate: 0.08,
    packageSize: 20, pricePerSession: 2000, targetRemaining: 7, bodyweight: 54, bodyweightTrend: 0.02, pendingLast: true,
    adjustments: [{ weeksAgo: 6, delta: 1, reason: '老師臨時調課，補償 1 堂' }],
  },
  {
    student: {
      id: 'stu_02', name: 'Kevin Wang', email: 'kevin.wang@example.com', phone: '0928-112-334', gender: 'male',
      birthYear: 1988, heightCm: 175, goal: 'pain', goalDetail: '改善下背痛，彎腰綁鞋帶不再緊繃',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '工程師，久坐。髖屈肌很緊，課前先做髖部放鬆。偏好早上 7 點上課。',
    },
    joinedWeeksAgo: 40, coachedDays: [1, 3, 5], independentDays: [6], hour: 7, menus: ['posture', 'reformerBasic'], level: 0, repRate: 0.06,
    packageSize: 20, pricePerSession: 2000, targetRemaining: 2, bodyweight: 78, bodyweightTrend: -0.03,
  },
  {
    student: {
      id: 'stu_03', name: 'Grace Lee', email: 'grace.lee@example.com', phone: '0935-776-210', gender: 'female',
      birthYear: 1997, heightCm: 158, goal: 'posture', goalDetail: '改善圓肩與駝背，拍照時站得更挺',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '有在練瑜珈，柔軟度好但肩胛穩定較弱，先加強背部伸展。',
    },
    joinedWeeksAgo: 22, coachedDays: [1, 3, 5], independentDays: [0], hour: 12, menus: ['posture', 'reformerInter'], level: 1, repRate: 0.07,
    packageSize: 20, pricePerSession: 1800, targetRemaining: 12, bodyweight: 52, bodyweightTrend: -0.05,
  },
  {
    student: {
      id: 'stu_04', name: 'Eric Chang', email: 'eric.chang@example.com', phone: '0910-558-902', gender: 'male',
      birthYear: 1992, heightCm: 178, goal: 'flexibility', goalDetail: '大腿後側太緊，希望前彎能碰到腳尖',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '跑者，腿後側與髖很緊。脊椎前伸時容易聳肩，提醒放鬆。',
    },
    joinedWeeksAgo: 52, coachedDays: [2, 4, 6], independentDays: [0, 3], hour: 20, menus: ['reformerBasic', 'apparatus'], level: 0, repRate: 0.05,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 2, bodyweight: 72, bodyweightTrend: 0, pendingLast: true,
  },
  {
    student: {
      id: 'stu_05', name: 'Tiffany Liu', email: 'tiffany.liu@example.com', phone: '0921-300-457', gender: 'female',
      birthYear: 1985, heightCm: 165, goal: 'postnatal', goalDetail: '產後一年，修復腹直肌分離、找回核心力量',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '兩個孩子的媽媽，時間以平日上午為主。腹直肌分離約 2 指寬，先避免捲腹類動作。',
    },
    joinedWeeksAgo: 20, coachedDays: [1, 3, 5], independentDays: [6], hour: 10, menus: ['postnatal', 'reformerBasic'], level: 0, repRate: 0.07,
    packageSize: 10, pricePerSession: 2000, targetRemaining: 5, bodyweight: 60, bodyweightTrend: -0.1,
  },
  {
    student: {
      id: 'stu_06', name: 'Ryan Huang', email: 'ryan.huang@example.com', phone: '0987-221-064', gender: 'male',
      birthYear: 1999, heightCm: 172, goal: 'core', goalDetail: '打籃球常扭到腳，想加強核心與平衡',
      status: 'active', weeklyFrequency: 4,
      coachNotes: '大學研究生，自主練習頻率高。單腳平衡左右差異大，右側較弱。',
    },
    joinedWeeksAgo: 24, coachedDays: [1, 4], independentDays: [3, 6], hour: 18, menus: ['reformerInter', 'apparatus'], level: 2, repRate: 0.08,
    packageSize: 20, pricePerSession: 1800, targetRemaining: 15, bodyweight: 68, bodyweightTrend: 0.05,
    adjustments: [{ weeksAgo: 4, delta: -1, reason: '未提前取消且未到課，依約定扣除 1 堂' }],
  },
  {
    student: {
      id: 'stu_07', name: 'Cindy Wu', email: 'cindy.wu@example.com', phone: '0916-884-120', gender: 'female',
      birthYear: 1990, heightCm: 160, goal: 'posture', goalDetail: '改善圓肩姿勢，肩頸不再痠痛',
      status: 'active', weeklyFrequency: 2,
      coachNotes: '辦公室工作，每次課前做 10 分鐘胸椎活動。目前以每週兩堂為主。',
    },
    joinedWeeksAgo: 14, coachedDays: [2, 5], independentDays: [], hour: 14, menus: ['posture', 'matFlow'], level: 0, repRate: 0.06,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 3, bodyweight: 50, bodyweightTrend: 0,
  },
  {
    student: {
      id: 'stu_08', name: 'Jerry Tsai', email: 'jerry.tsai@example.com', phone: '0933-650-781', gender: 'male',
      birthYear: 1979, heightCm: 170, goal: 'flexibility', goalDetail: '維持柔軟度，配合週末登山',
      status: 'active', weeklyFrequency: 2,
      coachNotes: '週末常登山，週一上課以伸展為主，避免膝蓋負擔太大。',
    },
    joinedWeeksAgo: 35, coachedDays: [2, 5], independentDays: [4], hour: 7, menus: ['apparatus', 'reformerBasic'], level: 1, repRate: 0.04,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 8, bodyweight: 70, bodyweightTrend: -0.05,
  },
  {
    student: {
      id: 'stu_09', name: 'Leo Cheng', email: 'leo.cheng@example.com', phone: '0955-410-236', gender: 'male',
      birthYear: 1995, heightCm: 180, goal: 'core', goalDetail: '改善久坐腰痠',
      status: 'inactive', weeklyFrequency: 2,
      coachNotes: '方案用完後暫停，表示工作穩定後會回來。',
    },
    joinedWeeksAgo: 28, stoppedWeeksAgo: 5, coachedDays: [5], independentDays: [], hour: 20, menus: ['reformerBasic'], level: 0, repRate: 0.05,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 0, bodyweight: 78, bodyweightTrend: 0,
  },
  {
    student: {
      id: 'stu_10', name: 'Mandy Hsu', email: 'mandy.hsu@example.com', phone: '0975-302-118', gender: 'female',
      birthYear: 2001, heightCm: 166, goal: 'general', goalDetail: '維持體態，在家也能自己練',
      status: 'inactive', weeklyFrequency: 2,
      coachNotes: '工作調動暫停上課。剩餘 6 堂保留，之後回來上課可繼續使用。',
    },
    joinedWeeksAgo: 22, stoppedWeeksAgo: 3, coachedDays: [4], independentDays: [], hour: 17, menus: ['matFlow'], level: 1, repRate: 0.06,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 6, bodyweight: 54, bodyweightTrend: 0.02,
  },
  {
    student: {
      id: 'stu_11', name: 'Allen Lin', email: 'allen.lin@example.com', phone: '0918-907-643', gender: 'male',
      birthYear: 1993, heightCm: 173, goal: 'pain', goalDetail: '肩頸僵硬，轉頭時會卡卡的',
      status: 'active', weeklyFrequency: 2,
      coachNotes: '新學員，先以呼吸與動作學習為主，彈簧設定保守。',
    },
    joinedWeeksAgo: 3, coachedDays: [2, 5], independentDays: [], hour: 18, menus: ['reformerBasic', 'posture'], level: 0, repRate: 0.1,
    packageSize: 20, pricePerSession: 1800, targetRemaining: 16, bodyweight: 80, bodyweightTrend: -0.2,
  },
  {
    student: {
      id: 'stu_12', name: 'Olivia Lin', email: 'olivia.lin@example.com', phone: '0930-118-526', gender: 'female',
      birthYear: 1996, heightCm: 165, goal: 'core', goalDetail: '在家也能自己練墊上，每週穩定 4 次',
      status: 'active', weeklyFrequency: 4,
      coachNotes: '自主練習很規律，會自己記錄。捲上時頸部容易用力，提醒下巴微收。',
    },
    joinedWeeksAgo: 26, coachedDays: [1, 4], independentDays: [3, 6], hour: 20, menus: ['matFlow', 'reformerInter'], level: 2, repRate: 0.07,
    packageSize: 20, pricePerSession: 2000, targetRemaining: 9, bodyweight: 55, bodyweightTrend: 0,
  },
  {
    student: {
      id: 'stu_13', name: 'Sophia Kuo', email: 'sophia.kuo@example.com', phone: '0911-563-208', gender: 'female',
      birthYear: 1990, heightCm: 165, goal: 'posture', goalDetail: '臀腿線條，改善骨盆前傾',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '下班後上課，專注度高。橋式時容易用下背出力，提醒臀部先發力。',
    },
    joinedWeeksAgo: 18, coachedDays: [1, 3, 5], independentDays: [], hour: 18, menus: ['reformerInter', 'posture'], level: 1, repRate: 0.07,
    packageSize: 20, pricePerSession: 2000, targetRemaining: 7, bodyweight: 56, bodyweightTrend: 0,
  },
  {
    student: {
      id: 'stu_14', name: 'Daniel Yeh', email: 'daniel.yeh@example.com', phone: '0920-441-397', gender: 'male',
      birthYear: 1985, heightCm: 172, goal: 'pain', goalDetail: '舊有下背傷，想安全地恢復運動',
      status: 'active', weeklyFrequency: 2,
      coachNotes: '業務主管，常出差。舊有下背傷，避免大幅度屈曲，先從骨盆中立練起。',
    },
    joinedWeeksAgo: 30, coachedDays: [1, 4], independentDays: [], hour: 7, menus: ['posture', 'reformerBasic'], level: 0, repRate: 0.05,
    packageSize: 20, pricePerSession: 2200, targetRemaining: 11, bodyweight: 80, bodyweightTrend: -0.05,
  },
  {
    student: {
      id: 'stu_15', name: 'Ivy Chiang', email: 'ivy.chiang@example.com', phone: '0937-208-654', gender: 'female',
      birthYear: 1999, heightCm: 160, goal: 'general', goalDetail: '建立運動習慣，體力更好',
      status: 'active', weeklyFrequency: 2,
      coachNotes: '第一次接觸皮拉提斯，喜歡墊上流動。進步很快。',
    },
    joinedWeeksAgo: 22, coachedDays: [2, 4], independentDays: [6], hour: 19, menus: ['matFlow', 'reformerBasic'], level: 0, repRate: 0.09,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 4, bodyweight: 50, bodyweightTrend: 0,
  },
  {
    student: {
      id: 'stu_16', name: 'Marcus Liao', email: 'marcus.liao@example.com', phone: '0958-776-102', gender: 'male',
      birthYear: 1994, heightCm: 181, goal: 'flexibility', goalDetail: '重訓多年，想改善髖與胸椎活動度',
      status: 'active', weeklyFrequency: 4,
      coachNotes: '有重訓背景，力量好但活動度不足。提醒不要用蠻力，專注控制。',
    },
    joinedWeeksAgo: 25, coachedDays: [3, 6], independentDays: [1, 5], hour: 20, menus: ['apparatus', 'reformerInter'], level: 1, repRate: 0.05,
    packageSize: 20, pricePerSession: 1800, targetRemaining: 14, bodyweight: 85, bodyweightTrend: 0.03,
  },
  {
    student: {
      id: 'stu_17', name: 'Nina Su', email: 'nina.su@example.com', phone: '0912-930-571', gender: 'female',
      birthYear: 1993, heightCm: 163, goal: 'posture', goalDetail: '改善肩頸緊繃與骨盆前傾',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '設計師，長時間用電腦。每次上課先做胸椎活動度與核心穩定。',
    },
    joinedWeeksAgo: 21, coachedDays: [1, 3, 5], independentDays: [], hour: 12, menus: ['posture', 'matFlow'], level: 0, repRate: 0.06,
    packageSize: 20, pricePerSession: 1800, targetRemaining: 10, bodyweight: 53, bodyweightTrend: -0.05,
  },
  {
    student: {
      id: 'stu_18', name: 'Oscar Wen', email: 'oscar.wen@example.com', phone: '0926-114-839', gender: 'male',
      birthYear: 1979, heightCm: 170, goal: 'general', goalDetail: '醫師建議運動，改善血壓與體態',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '血壓偏高，避免長時間憋氣與頭低腳高的動作。',
    },
    joinedWeeksAgo: 24, coachedDays: [2, 4, 6], independentDays: [], hour: 8, menus: ['reformerBasic', 'apparatus'], level: 0, repRate: 0.05,
    packageSize: 10, pricePerSession: 2200, targetRemaining: 3, bodyweight: 84, bodyweightTrend: -0.25,
  },
  {
    student: {
      id: 'stu_19', name: 'Rachel Pan', email: 'rachel.pan@example.com', phone: '0981-652-430', gender: 'female',
      birthYear: 1988, heightCm: 168, goal: 'postnatal', goalDetail: '產後恢復核心力量，重拾運動習慣',
      status: 'active', weeklyFrequency: 2,
      coachNotes: '產後一年，腹直肌分離已改善。避免憋氣過度，先從呼吸與核心啟動開始。',
    },
    joinedWeeksAgo: 20, coachedDays: [3, 6], independentDays: [], hour: 10, menus: ['postnatal', 'reformerBasic'], level: 0, repRate: 0.07,
    packageSize: 20, pricePerSession: 2000, targetRemaining: 8, bodyweight: 59, bodyweightTrend: -0.1,
  },
  {
    student: {
      id: 'stu_20', name: 'Henry Lu', email: 'henry.lu@example.com', phone: '0935-287-916', gender: 'male',
      birthYear: 1991, heightCm: 176, goal: 'pain', goalDetail: '籃球舊傷，肩膀活動時會痛',
      status: 'active', weeklyFrequency: 3,
      coachNotes: '大學打籃球，肩膀有舊傷。手臂過頭的動作先降低彈簧，注意肩胛穩定。',
    },
    joinedWeeksAgo: 28, coachedDays: [2, 4], independentDays: [6], hour: 20, menus: ['posture', 'apparatus'], level: 0, repRate: 0.06,
    packageSize: 20, pricePerSession: 2000, targetRemaining: 6, bodyweight: 72, bodyweightTrend: 0.02,
  },
]

// ---------------------------------------------------------------------------
// Roster: the named students above, plus generated ones filling each teacher's week.
// A full-time teacher gives 6–8 private sessions a day, 5–6 days a week; each slot
// (weekday + hour) holds one student, who comes at the same hour on their days.
// ---------------------------------------------------------------------------

const WORKDAYS: Record<string, number[]> = {
  [COACH_ID]: [1, 2, 3, 4, 5, 6],
  [AMY_ID]: [0, 1, 2, 3, 4, 5], // covers Sundays
  [JOANNE_ID]: [1, 2, 3, 4, 5, 6],
  [KEN_ID]: [1, 2, 3, 4, 5, 6],
}
const CLASS_HOURS = [7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21]

const FIRST_NAMES = {
  female: ['Amber', 'Bella', 'Claire', 'Doris', 'Ella', 'Fiona', 'Gina', 'Hannah', 'Iris', 'Joyce', 'Karen', 'Linda', 'Megan', 'Nora', 'Olive', 'Peggy', 'Rita', 'Sandy', 'Tina', 'Vera', 'Wendy', 'Yvonne', 'Zoe', 'Annie', 'Betty', 'Cathy', 'Elaine', 'Jenny'],
  male: ['Aaron', 'Ben', 'Calvin', 'David', 'Edward', 'Frank', 'George', 'Howard', 'Ian', 'Jack', 'Kenny', 'Louis', 'Max', 'Neil', 'Owen', 'Peter', 'Ray', 'Sam', 'Tony', 'Victor'],
}
const LAST_NAMES = ['Chen', 'Lin', 'Huang', 'Chang', 'Lee', 'Wang', 'Wu', 'Liu', 'Tsai', 'Yang', 'Hsu', 'Cheng', 'Hsieh', 'Kuo', 'Hung', 'Tseng', 'Chiu', 'Liao', 'Lai', 'Chou', 'Yeh', 'Su', 'Chuang', 'Lu', 'Chiang', 'Ho', 'Kao', 'Lo', 'Pan', 'Fang']
const ROSTER_GOALS: [TrainingGoal, MenuId[], string][] = [
  ['general', ['reformerBasic', 'matFlow'], '維持體態，工作之餘保持健康'],
  ['core', ['reformerInter', 'reformerBasic'], '加強核心，改善腰痠'],
  ['posture', ['posture', 'reformerBasic'], '改善久坐造成的圓肩駝背'],
  ['flexibility', ['matFlow', 'apparatus'], '提升柔軟度，身體更輕盈'],
]
const ROSTER_NOTES = ['上班族，固定時段上課。', '動作學習穩定，可逐步增加難度。', '需要多提醒骨盆中立。', '柔軟度較差，伸展時間拉長。', '配合度高，很少請假。', '偶爾加班，可能臨時改時間。']

/** Generated students filling every free class slot of each teacher's week (deterministic). */
function buildRoster(): Profile[] {
  const rand = mulberry32(20261025)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const shuffle = <T,>(arr: T[]) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const names = new Set(PROFILES.map((p) => p.student.name))
  const roster: Profile[] = []
  for (const [coachId, days] of Object.entries(WORKDAYS)) {
    // Slots the teacher's named students already hold (those still coming).
    const taken = new Set(
      PROFILES.filter((p) => teacherOf(p.student.id) === coachId && p.student.status === 'active').flatMap((p) => p.coachedDays.map((d) => `${d}:${p.hour}`)),
    )
    const free = new Map<number, number[]>() // hour → weekdays still open at that hour
    for (const day of days) {
      let classes = CLASS_HOURS.filter((h) => taken.has(`${day}:${h}`)).length
      // 7–8 booked; with the odd cancellation, 6–8 sessions actually taught.
      const size = 7 + Math.floor(rand() * 2)
      for (const h of shuffle(CLASS_HOURS.filter((x) => !taken.has(`${day}:${x}`)))) {
        if (classes >= size) break
        free.set(h, [...(free.get(h) ?? []), day])
        classes++
      }
    }
    for (const [hour, open] of [...free].sort((a, b) => a[0] - b[0])) {
      let rest = [...open].sort()
      while (rest.length) {
        // Two or three visits a week, spread out (e.g. Mon/Wed/Fri); a lone slot is a once-a-week student.
        const visits = Math.min(rest.length, rest.length >= 5 && rand() < 0.5 ? 3 : 2)
        const chosen = rest.filter((_, i) => i % 2 === 0).slice(0, visits)
        for (const d of rest) if (chosen.length < visits && !chosen.includes(d)) chosen.push(d)
        rest = rest.filter((d) => !chosen.includes(d))
        // Most Pilates clients are women.
        const gender = rand() < 0.78 ? 'female' : 'male'
        let name = `${pick(FIRST_NAMES[gender])} ${pick(LAST_NAMES)}`
        while (names.has(name)) name = `${pick(FIRST_NAMES[gender])} ${pick(LAST_NAMES)}`
        names.add(name)
        const n = roster.length + 1
        const [goal, menus, goalDetail] = pick(ROSTER_GOALS)
        const female = gender === 'female'
        roster.push({
          student: {
            id: `stu_r${String(n).padStart(2, '0')}`,
            name,
            email: `${name.replace(' ', '.').toLowerCase()}@example.com`,
            phone: `09${10 + Math.floor(rand() * 89)}-${100 + Math.floor(rand() * 899)}-${100 + Math.floor(rand() * 899)}`,
            gender,
            birthYear: 1972 + Math.floor(rand() * 30),
            heightCm: female ? 152 + Math.floor(rand() * 18) : 165 + Math.floor(rand() * 20),
            goal,
            goalDetail,
            status: 'active',
            weeklyFrequency: chosen.length,
            coachNotes: pick(ROSTER_NOTES),
          },
          joinedWeeksAgo: 20 + Math.floor(rand() * 60),
          coachedDays: chosen.sort(),
          independentDays: [],
          hour,
          menus,
          level: Math.floor(rand() * 3),
          repRate: 0.04 + rand() * 0.05,
          packageSize: rand() < 0.5 ? 10 : 20,
          pricePerSession: pick([1800, 2000, 2200, 2400]),
          targetRemaining: 1 + Math.floor(rand() * 15),
          bodyweight: female ? 48 + Math.floor(rand() * 16) : 65 + Math.floor(rand() * 22),
          bodyweightTrend: (rand() - 0.5) * 0.2,
          coachId,
          compact: true,
        })
      }
    }
  }
  return roster
}

const ROSTER = buildRoster()

const COACHED_NOTES = [
  '核心啟動穩定，下次長伸展可以試著少一條彈簧。',
  '骨盆中立還需要提醒，橋式放慢節奏，一節一節往下。',
  '呼吸配合動作越來越順，肩頸放鬆很多。',
  '今天下背有點緊，改做較多伸展，降低強度。',
  'V 字平衡可以穩定停留 3 秒了！',
  '膝伸展時肩胛穩定度提升，下次加入單手變化。',
  '',
  '',
]
const INDEPENDENT_NOTES = ['在家跟著老師給的順序練。', '時間比較趕，只做前半段。', '', '', '']

/** 0–1 per move, so each move gains its next rep in a different week. */
const phaseOf = (exerciseId: string) => ([...exerciseId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 100) / 100

/** A move's reps on a given week: the base, the student's level, and slow progress (at most 5 more). */
const repsFor = (base: number, p: Profile, weekIndex: number, exerciseId: string) =>
  base + Math.min(5, p.level + Math.floor(p.repRate * weekIndex + phaseOf(exerciseId)))

// ---------------------------------------------------------------------------
// Offline demo: one studio, seen as its owner, a teacher or a student
// ---------------------------------------------------------------------------

/** The demo's one workspace: 光合皮拉提斯 (owner Vivian, teacher Amy, student Grace). */
export type DemoSpace = 'studio'

export type DemoPersona = 'owner' | 'studioCoach' | 'studioStudent'

/** Who each demo persona is (used by the demo page and the switcher). */
export const DEMO_PERSONAS: { space: DemoSpace; group: string; personas: { id: DemoPersona; title: string; who: string }[] }[] = [
  {
    space: 'studio',
    group: `工作室・${STUDIO_NAME}`,
    personas: [
      { id: 'owner', title: '經營者', who: 'Vivian・看整個工作室、管理老師' },
      { id: 'studioCoach', title: '工作室老師', who: 'Amy Lin・只看到自己的學員' },
      { id: 'studioStudent', title: '工作室老師的學員', who: 'Grace Lee・Amy 的學員' },
    ],
  },
]

export function demoSession(persona: DemoPersona): DemoSession {
  switch (persona) {
    case 'owner':
      return { role: 'owner', studentId: DEFAULT_DEMO_STUDENT_ID, space: 'studio' }
    case 'studioCoach':
      return { role: 'coach', studentId: DEFAULT_DEMO_STUDENT_ID, coachId: AMY_ID, space: 'studio' }
    case 'studioStudent':
      return { role: 'student', studentId: 'stu_03', space: 'studio' }
  }
}

export const demoHome = (p: DemoPersona) => (p === 'studioStudent' ? '/student' : '/coach')

export const demoPersonaTitle = (p: DemoPersona) => DEMO_PERSONAS.flatMap((g) => g.personas).find((x) => x.id === p)?.title ?? ''

/** Which persona a demo session is (for the switcher's current selection). */
export function demoPersonaOf(s: DemoSession | null): DemoPersona {
  if (s?.role === 'student') return 'studioStudent'
  return s?.coachId ? 'studioCoach' : 'owner'
}

export function generateDemoData(nowDate = new Date()): AppData {
  return generateMockData(nowDate)
}

export function generateMockData(nowDate = new Date()): AppData {
  const rand = mulberry32(20261020)
  let seq = 0
  const id = (prefix: string) => `${prefix}_${(++seq).toString(36).padStart(4, '0')}`
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]

  const now = nowDate.getTime()
  const today = new Date(nowDate)
  today.setHours(0, 0, 0, 0)
  // Window starts on the Monday HISTORY_WEEKS weeks ago.
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - ((windowStart.getDay() + 6) % 7) - (HISTORY_WEEKS - 1) * 7)

  const coach: Coach = {
    id: COACH_ID,
    role: 'coach',
    name: 'Vivian',
    email: 'vivian@example.com',
    phone: '0900-000-123',
    title: '皮拉提斯老師・經營者',
    studio: STUDIO_NAME,
    createdAt: new Date(now - 400 * DAY).toISOString(),
  }

  const students: Student[] = []
  const relationships: CoachStudentRelationship[] = []
  const workouts: WorkoutSession[] = []
  const packages: SessionPackage[] = []
  const transactions: SessionTransaction[] = []
  const metrics: ProgressMetric[] = []
  const appointments: Appointment[] = []

  /** One session of a menu: every set ticked off, reps for that week, the odd last set one short. */
  const sessionLogs = (menu: MenuId, p: Profile, weekIndex: number, compact: boolean): ExerciseLog[] => {
    const { items, jumpBoard } = MENUS[menu]
    const logs: ExerciseLog[] = []
    if (jumpBoard && !compact && rand() < 0.5) {
      const min = 5 + Math.floor(rand() * 4)
      logs.push({
        id: id('el'),
        exerciseId: 'px_jumpboard',
        sets: [{ id: id('set'), springs: null, weightKg: null, reps: null, rpe: null, completed: true, durationSec: min * 60, avgHeartRate: Math.round(128 + rand() * 18) }],
      })
    }
    for (const [exerciseId, sets, base, springs] of compact ? items.slice(0, 4) : items) {
      const reps = repsFor(base, p, weekIndex, exerciseId)
      const out: SetLog[] = []
      for (let s = 0; s < sets; s++) {
        out.push({
          id: id('set'),
          springs,
          weightKg: null,
          reps: s === sets - 1 && rand() < 0.2 ? Math.max(1, reps - 1) : reps,
          rpe: null,
          completed: true,
        })
      }
      logs.push({ id: id('el'), exerciseId, sets: out })
    }
    return logs
  }

  for (const p of [...PROFILES, ...ROSTER]) {
    const teacher = p.coachId ?? teacherOf(p.student.id)
    const joinedAt = new Date(today.getTime() - p.joinedWeeksAgo * 7 * DAY)
    const student: Student = {
      ...p.student,
      role: 'student',
      joinedAt: joinedAt.toISOString(),
      createdAt: joinedAt.toISOString(),
      ...(p.leftToSelf && p.stoppedWeeksAgo ? { leftAt: new Date(today.getTime() - p.stoppedWeeksAgo * 7 * DAY).toISOString() } : {}),
    }
    students.push(student)
    relationships.push({
      id: `rel_${student.id}`,
      coachId: teacher,
      studentId: student.id,
      status: student.status,
      startedAt: student.joinedAt,
    })

    const startMs = Math.max(windowStart.getTime(), joinedAt.getTime())
    const endMs = p.stoppedWeeksAgo ? today.getTime() - p.stoppedWeeksAgo * 7 * DAY : today.getTime() - 1
    let menuIdx = 0
    const studentWorkouts: WorkoutSession[] = []

    for (let t = startMs; t <= endMs; t += DAY) {
      const date = new Date(t)
      const weekday = date.getDay()
      const isCoached = p.coachedDays.includes(weekday)
      const isIndependent = p.independentDays.includes(weekday)
      if (!isCoached && !isIndependent) continue
      if (rand() < (isCoached ? 0.07 : 0.25)) continue

      // Weeks since they started Pilates (not since the window opened), for their reps.
      const weekIndex = Math.floor((t - joinedAt.getTime()) / (7 * DAY))
      const type = isCoached ? 'coached' : 'independent'
      const menu: MenuId = type === 'coached' ? p.menus[menuIdx++ % p.menus.length] : 'homeMat'
      const exercises = sessionLogs(menu, p, weekIndex, !!p.compact)
      // At home, sometimes only part of the routine.
      if (type === 'independent' && rand() < 0.3) exercises.splice(-2)

      const hour = type === 'coached' ? p.hour : pick([7, 12, 21])
      const startedAt = new Date(t)
      startedAt.setHours(hour, type === 'coached' ? 0 : pick([0, 15, 30]), 0, 0)
      const minutes = type === 'coached' ? CLASS_MIN : 25 + Math.floor(rand() * 15)
      const completedAt = new Date(startedAt.getTime() + minutes * 60000)
      studentWorkouts.push({
        id: id('wo'),
        studentId: student.id,
        coachId: type === 'coached' ? teacher : undefined,
        type,
        createdBy: type === 'coached' ? 'coach' : 'student',
        status: 'completed',
        title: MENUS[menu].name,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        updatedAt: completedAt.toISOString(),
        exercises,
        notes: p.compact ? '' : pick(type === 'coached' ? COACHED_NOTES : INDEPENDENT_NOTES),
      })
    }
    workouts.push(...studentWorkouts)

    // --- Session packages & transactions, derived from private sessions ---
    const coached = studentWorkouts.filter((w) => w.type === 'coached')
    const billable = p.pendingLast ? coached.slice(0, -1) : coached
    const adjustments = (p.adjustments ?? []).map((a) => ({
      ...a,
      at: new Date(today.getTime() - a.weeksAgo * 7 * DAY + 10 * 3600000).toISOString(),
    }))
    const adjSum = adjustments.reduce((s, a) => s + a.delta, 0)
    const needed = billable.length - adjSum + p.targetRemaining
    const preWindow = joinedAt.getTime() < windowStart.getTime()
    const capacities: number[] = []
    if (preWindow && needed > 0) {
      const regular = Math.floor((needed - 1) / p.packageSize)
      capacities.push(needed - regular * p.packageSize, ...Array(regular).fill(p.packageSize))
    } else {
      // New students: buy just enough packages to cover sessions so far.
      const count = Math.max(1, Math.ceil((billable.length - adjSum) / p.packageSize))
      for (let i = 0; i < count; i++) capacities.push(p.packageSize)
    }

    const pkgs: SessionPackage[] = capacities.map((cap, i) => {
      const carryOver = preWindow && i === 0
      return {
        id: id('pkg'),
        studentId: student.id,
        coachId: COACH_ID,
        name: carryOver ? '期初轉入堂數' : `${cap} 堂器械私人課`,
        totalSessions: cap,
        // Carried-over sessions keep their original price per session, so the monthly report values them too.
        priceTwd: cap * p.pricePerSession,
        purchaseDate: '',
        notes: carryOver ? '導入系統前購買、尚未上完的堂數，金額依原方案單價計算。' : undefined,
      }
    })
    const remaining = pkgs.map((pk) => pk.totalSessions)

    type Ev = { at: string; delta: number; reason: string; type: 'deduction' | 'adjustment'; workoutId?: string }
    const events: Ev[] = [
      ...billable.map((w) => ({
        at: w.completedAt!,
        delta: -1,
        reason: `${w.title} 上課扣堂`,
        type: 'deduction' as const,
        workoutId: w.id,
      })),
      ...adjustments.map((a) => ({ at: a.at, delta: a.delta, reason: a.reason, type: 'adjustment' as const })),
    ].sort((a, b) => a.at.localeCompare(b.at))

    for (const ev of events) {
      let i = remaining.findIndex((r) => r > 0)
      if (ev.delta > 0) i = i === -1 ? pkgs.length - 1 : i
      if (i === -1) continue
      if (!pkgs[i].purchaseDate) pkgs[i].purchaseDate = new Date(new Date(ev.at).getTime() - 2 * DAY).toISOString()
      remaining[i] += ev.delta
      transactions.push({
        id: id('tx'),
        packageId: pkgs[i].id,
        studentId: student.id,
        type: ev.type,
        delta: ev.delta,
        reason: ev.reason,
        workoutSessionId: ev.workoutId,
        createdAt: new Date(new Date(ev.at).getTime() + 5 * 60000).toISOString(),
        createdBy: 'coach',
      })
    }
    for (const pk of pkgs) {
      if (!pk.purchaseDate) pk.purchaseDate = new Date(Math.min(now - 3 * DAY, endMs)).toISOString()
    }
    pkgs[0].purchaseDate = new Date(Math.min(new Date(pkgs[0].purchaseDate).getTime(), startMs - DAY)).toISOString()
    packages.push(...pkgs)

    // --- Bodyweight metrics (weekly; named students only, to keep the demo small) ---
    let bw = p.bodyweight
    for (let t = startMs; !p.compact && t <= Math.min(endMs, now); t += 7 * DAY) {
      bw += p.bodyweightTrend + (rand() - 0.5) * 0.4
      metrics.push({
        id: id('met'),
        studentId: student.id,
        type: 'bodyweight',
        value: Math.round(bw * 10) / 10,
        unit: 'kg',
        recordedAt: new Date(t + 8 * 3600000).toISOString(),
      })
    }

    // --- Past two weeks on the schedule: each class done, logged by its session ---
    const recent = today.getTime() - 14 * DAY
    for (const w of studentWorkouts) {
      if (w.type !== 'coached' || new Date(w.startedAt).getTime() < recent) continue
      const at = new Date(w.startedAt)
      at.setMinutes(0, 0, 0)
      const appt: Appointment = {
        id: id('apt'),
        coachId: COACH_ID,
        studentId: student.id,
        startAt: at.toISOString(),
        durationMin: CLASS_MIN,
        location: STUDIO_NAME,
        status: 'completed',
      }
      appointments.push(appt)
      w.appointmentId = appt.id
    }

    // --- Today and the next 14 days, from the weekly schedule ---
    if (student.status === 'active') {
      for (let d = 0; d <= 14; d++) {
        const date = new Date(today.getTime() + d * DAY)
        if (!p.coachedDays.includes(date.getDay())) continue
        date.setHours(p.hour, 0, 0, 0)
        appointments.push({
          id: id('apt'),
          coachId: COACH_ID,
          studentId: student.id,
          startAt: date.toISOString(),
          durationMin: CLASS_MIN,
          location: STUDIO_NAME,
          status: 'scheduled',
        })
      }
    }
  }

  appointments.sort((a, b) => a.startAt.localeCompare(b.startAt))

  // One unfinished draft to demonstrate interrupted-session recovery.
  const draftStart = new Date(now - 95 * 60000).toISOString()
  const grace = PROFILES.find((p) => p.student.id === 'stu_03')!
  const draftLogs = sessionLogs('posture', grace, grace.joinedWeeksAgo, false).slice(0, 3)
  draftLogs.forEach((log, i) => log.sets.forEach((s, j) => (s.completed = i === 0 || (i === 1 && j === 0))))
  workouts.push({
    id: id('wo'),
    studentId: 'stu_03',
    coachId: COACH_ID,
    type: 'coached',
    createdBy: 'coach',
    status: 'draft',
    title: MENUS.posture.name,
    startedAt: draftStart,
    updatedAt: draftStart,
    notes: '',
    exercises: draftLogs,
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: nowDate.toISOString(),
    coach,
    students,
    relationships,
    exercises: EXERCISES,
    workouts,
    packages,
    transactions,
    metrics,
    appointments,
    goals: [],
    studio: {
      id: COACH_ID,
      kind: 'studio',
      name: coach.studio,
      ownerId: COACH_ID,
      // Four teachers, with seats to spare for trying invites.
      maxCoaches: 6,
      coaches: [
        { id: COACH_ID, role: 'owner', name: coach.name, email: coach.email, title: coach.title, status: 'active', createdAt: coach.createdAt },
        { id: AMY_ID, role: 'coach', name: 'Amy Lin', email: 'amy.lin@example.com', title: '器械皮拉提斯老師', status: 'active', createdAt: new Date(now - 200 * DAY).toISOString() },
        { id: JOANNE_ID, role: 'coach', name: 'Joanne Huang', email: 'joanne.huang@example.com', title: '墊上與孕產皮拉提斯老師', status: 'active', createdAt: new Date(now - 150 * DAY).toISOString() },
        { id: KEN_ID, role: 'coach', name: 'Ken Wu', email: 'ken.wu@example.com', title: '復健皮拉提斯老師', status: 'active', createdAt: new Date(now - 90 * DAY).toISOString() },
      ],
    },
  }
}
