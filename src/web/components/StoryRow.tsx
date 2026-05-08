import type { StoryDto } from "../api.ts";

const TYPE_ICONS: Record<StoryDto["type"], string> = {
  feature: "★",
  bug: "●",
  chore: "⚙",
  release: "▼",
};

export function StoryRow({ story }: { story: StoryDto }) {
  const icon = TYPE_ICONS[story.type];
  return (
    <div className="story" title={story.id}>
      <span className={`icon icon-${story.type}`}>{icon}</span>
      <span className="title">{story.title}</span>
      {story.points !== undefined ? (
        <span className="pts">[{story.points}]</span>
      ) : (
        <span className="pts" />
      )}
      <StatePill state={story.state} />
    </div>
  );
}

function StatePill({ state }: { state: StoryDto["state"] }) {
  if (state === "unstarted") {
    return <span className="pill pill-unstarted">unstarted</span>;
  }
  return <span className={`pill pill-${state}`}>{state}</span>;
}
