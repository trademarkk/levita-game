import "server-only";

import { randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import type { TaskAchievementTag } from "@/lib/types";

type TemplateReward = {
  name: string;
  value: number;
  brands?: string[];
};

type TemplateCell = {
  number: number;
  type: "normal" | "treasure" | "surprise" | "setback" | "trap" | "accelerate";
  title?: string;
  description?: string;
  achievementTag?: TaskAchievementTag;
  effect?: "move" | "extra_roll";
  value?: number;
  reward?: TemplateReward;
};

type TemplateTask = {
  title: string;
  description: string;
  achievementTag: TaskAchievementTag | null;
};

const surprise = (number: number, description: string): TemplateCell => ({ number, type: "surprise", description });
const normal = (number: number): TemplateCell => ({ number, type: "normal" });
const accelerate = (number: number, value = 1): TemplateCell => ({ number, type: "accelerate", effect: "move", value });
const setback = (number: number, value = -1): TemplateCell => ({ number, type: "setback", effect: "move", value });
const task = (
  number: number,
  title: string,
  description: string,
  achievementTag?: TaskAchievementTag,
): TemplateCell => ({ number, type: "trap", title, description, achievementTag });
const treasure = (
  number: number,
  name: string,
  value: number,
  brands: string[] = [],
): TemplateCell => ({ number, type: "treasure", reward: { name, value, brands } });

// Snapshot of the approved test-room board on 2026-09-02. Keep this immutable:
// managers edit their room copy, never this source template.
export const defaultRoomCells: readonly TemplateCell[] = [
  surprise(1, "Интересный факт:\nМолодые львы, покинув родной прайд, нередко объединяются с братьями или другими родственниками. Такой союз называется коалицией."),
  accelerate(2),
  surprise(3, "Интересный факт:\nВ отличие от домашних кошек, львы не умеют постоянно мурлыкать. Строение горла позволяет им издавать куда более мощный звук — знаменитый рёв."),
  treasure(4, "Пополнение баланса телефона", 200),
  task(5, "Наш Прайд", "Сделай после тренировки общее фото с клиентами и отправь в общий чат💛", "client_photo"),
  surprise(6, "Интересный факт:\nТёмный язык жирафа может достигать примерно 45 сантиметров. Считается, что тёмная окраска помогает защищать его от яркого солнца во время долгого сбора листьев"),
  accelerate(7),
  normal(8),
  treasure(9, "Пополнение баланса", 300),
  surprise(10, "Интересный факт: \nПрайд — это настоящая львиная семья. Его основу обычно составляют родственные львицы, многие из которых остаются вместе на всю жизнь."),
  task(11, "Наш Прайд", "Сделай после тренировки общее фото с клиентами и отправь в общий чат💛", "client_photo"),
  surprise(12, "Интересный факт: \nТермитники обогащают почву питательными веществами и влагой. Вокруг них часто растёт более густая растительность, привлекающая антилоп, зебр и других травоядных"),
  treasure(14, "Пополнение баланса телефона", 300),
  task(15, "С заботой о новичках", "Сделай для нового клиента небольшой знак внимания: приветственную записку, памятку или красиво подготовь место для тренировки. Отправь фотографию результата в общий чат."),
  setback(16),
  surprise(17, "Интересный факт:\nПолосы зебры не только создают необычный рисунок. Исследования показывают, что они мешают слепням и другим кровососущим мухам правильно приземлиться на животное."),
  task(18, "Отзыв о студии", "В прайде нужно уметь взаимодействовать с его членами. Твоя задача - получить отзыв о студии на Яндекс Картах/ 2ГИС / Гугл Картах (на выбор)", "review"),
  normal(19),
  treasure(20, "Сертификат на маркетплейс", 400, ["Ozon", "Wildberries"]),
  surprise(22, "Интересный факт: \nВо время охоты львицы могут действовать как команда: одни направляют добычу, а другие ждут её в засаде."),
  accelerate(23),
  normal(24),
  setback(25),
  treasure(26, "Пополнение баланса телефона", 500),
  normal(27),
  surprise(28, "Интересный факт:\nСтраус — самая высокая и тяжёлая птица в мире. Он не летает, зато способен разгоняться примерно до 69 километров в час."),
  accelerate(29),
  normal(30),
  task(31, "Отзыв о студии", "В прайде нужно уметь взаимодействовать с его членами. Твоя задача - получить отзыв о студии на Яндекс Картах/ 2ГИС / Гугл Картах (на выбор)", "review"),
  treasure(32, "Сертификат на маркетплейс", 500, ["Ozon", "Wildberries"]),
  normal(33),
  setback(34),
  accelerate(35),
  task(36, "Наш Прайд", "Сделай после тренировки общее фото с клиентами и отправь в общий чат💛", "client_photo"),
  accelerate(37),
  treasure(38, "Сертификат на маркетплейс", 600, ["Ozon", "Wildberries"]),
  accelerate(39),
  surprise(40, "Интересный факт:\nЛьвиный рёв может разноситься по открытой саванне более чем на восемь километров. Так львы обозначают территорию и поддерживают связь с прайдом."),
  normal(41),
  setback(42),
  task(43, "Добрый посыл", "Выложи в общий чат кружок для своего прайда с добрыми пожеланиями и успехов на пути к вершине💛💛💛"),
  normal(44),
  accelerate(45),
  treasure(46, "Сертификат на маркетплейс", 700, ["Ozon", "Wildberries"]),
  normal(47),
  task(48, "Любимый клиент", "Запиши в общий чат команды кружок с любимым клиентом и попроси поделиться тем, что особенно понравилось на тренировке, добрыми словами и позитивной энергией на день"),
  task(50, "Лайфхак", "Поделись с командой в общем чате одним любым лайфхаком из своей жизни. Не важно каким, главное поделись)💛💛💛"),
  treasure(51, "Сертификат на маркетплейс", 800, ["Ozon", "Wildberries"]),
  normal(52),
  surprise(53, "Миф о страусах:\nСтраусы не прячут голову в песок от страха. Такой миф появился потому, что во время ухода за яйцами птица низко наклоняет голову и издалека её почти не видно."),
  task(54, "Отзыв о студии", "В прайде нужно уметь взаимодействовать с его членами. Твоя задача - получить отзыв о студии на Яндекс Картах/ 2ГИС / Гугл Картах (на выбор)", "review"),
  surprise(55, "Подводный парадокс:\nБегемот проводит много времени в воде, но фактически не плавает и плохо держится на поверхности. Обычно он идёт по дну или отталкивается от него, словно движется в замедленном прыжке"),
  treasure(57, "Большой сертификат на маркетплейс", 1500, ["Ozon", "Wildberries"]),
  task(58, "С заботой о новичках", "Сделай для нового клиента небольшой знак внимания: приветственную записку, памятку или красиво подготовь место для тренировки. Отправь фотографию результата в общий чат."),
] as const;

export const defaultRoomTasks: readonly TemplateTask[] = [
  {
    title: "Добрый отзыв о студии",
    achievementTag: "review",
    description: "Попроси клиентку, которая действительно довольна тренировкой, оставить честный положительный отзыв на Яндекс Картах, 2ГИС или Google Картах прямо при тебе. Выбери карточку той студии, которую она посещала, и не подсказывай готовый текст.",
  },
  {
    title: "Фото с клиенткой",
    achievementTag: "client_photo",
    description: "Сделай тёплое фото с клиенткой в студии и отправь его в общий чат. Перед съёмкой и публикацией обязательно получи её согласие.",
  },
  {
    title: "Общее фото после тренировки",
    achievementTag: "client_photo",
    description: "Сделай общее фото с группой после тренировки и отправь его в общий чат. Убедись, что все попавшие в кадр согласны на фото и публикацию.",
  },
  {
    title: "История маленькой победы",
    achievementTag: null,
    description: "Узнай у клиентки, какой небольшой результат она заметила благодаря занятиям, и поделись этой историей в общем чате без личных данных.",
  },
  {
    title: "Забота после занятия",
    achievementTag: null,
    description: "После тренировки уточни у новой клиентки её самочувствие и впечатления. Напиши руководителю короткий итог и важные пожелания клиентки.",
  },
  {
    title: "Идеальный порядок",
    achievementTag: null,
    description: "Проверь клиентскую зону, раздевалку и инвентарь по чек-листу. Пришли в общий чат фото аккуратно подготовленного пространства.",
  },
  {
    title: "Комплимент коллеге",
    achievementTag: null,
    description: "Отметь в общем чате конкретное действие коллеги, которое помогло клиентке или команде сегодня.",
  },
  {
    title: "Полезный контент",
    achievementTag: null,
    description: "Сними короткий полезный фрагмент о тренировке или студии для будущего контента. Не публикуй лица клиенток без их согласия.",
  },
  {
    title: "Встреча новой клиентки",
    achievementTag: null,
    description: "Лично помоги новой клиентке освоиться: покажи пространство, объясни порядок занятия и после уточни, всё ли было понятно.",
  },
  {
    title: "Идея для сервиса",
    achievementTag: null,
    description: "Предложи одно конкретное улучшение клиентского сервиса, которое можно проверить в течение недели, и отправь идею руководителю.",
  },
] as const;

export async function applyDefaultRoomTemplate(
  tx: Transaction,
  roomId: string,
  ownerMembershipId: string,
  now: string,
) {
  for (const templateTask of defaultRoomTasks) {
    await tx.execute({
      sql: `INSERT INTO task_templates
        (id, room_id, title, description, achievement_tag, requires_proof, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
      args: [randomUUID(), roomId, templateTask.title, templateTask.description, templateTask.achievementTag, now],
    });
  }

  for (const cell of defaultRoomCells) {
    const rewardId = cell.reward ? `custom-cell:${roomId}:${cell.number}` : null;
    if (cell.reward) {
      await tx.execute({
        sql: `INSERT INTO reward_catalog
          (id, room_id, name, category, value, brand_choices_json, quantity, is_active, created_at)
          VALUES (?, ?, ?, 'custom_cell', ?, ?, 12, 1, ?)`,
        args: [rewardId, roomId, cell.reward.name, cell.reward.value, JSON.stringify(cell.reward.brands || []), now],
      });
    }
    await tx.execute({
      sql: `INSERT INTO board_cell_configs
        (room_id, cell_number, type, title, description, task_achievement_tag, effect, move_value,
          reward_catalog_id, updated_by_membership_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        roomId,
        cell.number,
        cell.type,
        cell.title || null,
        cell.description || null,
        cell.achievementTag || null,
        cell.effect || null,
        cell.value ?? null,
        rewardId,
        ownerMembershipId,
        now,
      ],
    });
  }
}
