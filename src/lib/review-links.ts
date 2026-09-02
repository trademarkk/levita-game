type ReviewBranch = "Мачуги" | "Ставропольская";

const links: Record<ReviewBranch, Array<{ label: string; url?: string }>> = {
  Мачуги: [
    { label: "Яндекс Карты", url: process.env.NEXT_PUBLIC_REVIEW_YANDEX_MACHUGI },
    { label: "2ГИС", url: process.env.NEXT_PUBLIC_REVIEW_2GIS_MACHUGI },
    { label: "Google Карты", url: process.env.NEXT_PUBLIC_REVIEW_GOOGLE_MACHUGI },
  ],
  Ставропольская: [
    { label: "Яндекс Карты", url: process.env.NEXT_PUBLIC_REVIEW_YANDEX_STAVROPOLSKAYA },
    { label: "2ГИС", url: process.env.NEXT_PUBLIC_REVIEW_2GIS_STAVROPOLSKAYA },
    { label: "Google Карты", url: process.env.NEXT_PUBLIC_REVIEW_GOOGLE_STAVROPOLSKAYA },
  ],
};

export function getReviewLinks(branch: string | null) {
  if (branch !== "Мачуги" && branch !== "Ставропольская") return [];
  return links[branch].filter((item): item is { label: string; url: string } => Boolean(item.url));
}
