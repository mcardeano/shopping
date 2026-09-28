import { PLATFORM_LABEL } from "@/lib/format";

const DOT: Record<string, string> = {
  instagram: "bg-gradient-to-br from-[#E4A07D] to-[#B8657E]",
  tiktok: "bg-ink",
  website: "bg-olive",
  manual: "bg-terracotta",
  image: "bg-[#8A8374]",
  text: "bg-[#8A8374]",
  generated: "bg-olive",
};

/** "Saved from Instagram · @weeknight.bowls" */
export function SourceBadge({ platform, creator, url, compact }: { platform: string | null; creator?: string | null; url?: string | null; compact?: boolean }) {
  if (!platform) return null;
  const label = PLATFORM_LABEL[platform] ?? platform;
  const lead = platform === "manual" ? label : platform === "text" ? "Pasted text" : platform === "image" ? "From a screenshot" : `Saved from ${label}`;
  const text = compact ? label : `${lead}${creator ? ` · ${creator}` : ""}`;
  const content = (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
      <span className={`h-2 w-2 rounded-full ${DOT[platform] ?? "bg-muted"}`} />
      {text}
    </span>
  );
  if (url && !compact) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:underline">
        {content}
      </a>
    );
  }
  return content;
}
