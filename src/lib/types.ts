export type Role = "owner" | "manager" | "player" | "observer";

export type SeasonStatus = "active" | "completed" | "expired";

export type CellType =
  | "normal"
  | "treasure"
  | "surprise"
  | "setback"
  | "trap"
  | "accelerate"
  | "finish";

export type TaskAchievementTag = "review" | "client_photo";

export type BoardCell = {
  number: number;
  type: CellType;
  value?: number;
  effect?: "move" | "extra_roll";
};

export type ManagedBoardCell = BoardCell & {
  custom: boolean;
  title: string;
  description: string;
  rewardCatalogId: string | null;
  rewardName: string;
  rewardValue: number;
  rewardQuantity: number;
  rewardBrandChoices: string[];
  taskAchievementTag: TaskAchievementTag | null;
};

export type AchievementKind = "sales" | "rhythm" | "chapter" | "treasure" | "adventure" | "task";

export type AchievementView = {
  key: string;
  title: string;
  description: string;
  story: string;
  symbol: string;
  kind: AchievementKind;
  color: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
  cosmeticTier: number;
};

export type Viewer = {
  userId: string;
  membershipId: string;
  roomId: string;
  displayName: string;
  avatarKey: string;
  branch: string | null;
  role: Role;
};

export type GameState = {
  generatedAt: string;
  viewer: Viewer;
  room: {
    id: string;
    name: string;
    maxPlayers: number;
  };
  season: {
    id: string;
    name: string;
    status: SeasonStatus;
    endsAt: string;
    winnerMembershipId: string | null;
    finalPrize: string;
  };
  boardCells: BoardCell[];
  players: Array<{
    membershipId: string;
    displayName: string;
    avatarKey: string;
    role: Role;
    position: number;
    availableRolls: number;
    nextRollExpiresAt: string | null;
    blocked: boolean;
    cosmeticTier: number;
  }>;
  myJourney: {
    totalSales: number;
    achievements: AchievementView[];
    nearestAchievementKeys: string[];
    activeRolls: Array<{
      id: string;
      expiresAt: string | null;
      paused: boolean;
    }>;
  };
  myPendingTask: null | {
    id: string;
    title: string;
    description: string;
    assignedAt: string;
  };
  myRewards: Array<{
    id: string;
    name: string;
    value: number;
    brandChoice: string | null;
    brandChoices: string[];
    status: "pending" | "issued";
    grantedAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
    reactions: Array<{
      key: "applause" | "roar" | "fire" | "crown";
      count: number;
      mine: boolean;
    }>;
  }>;
};
