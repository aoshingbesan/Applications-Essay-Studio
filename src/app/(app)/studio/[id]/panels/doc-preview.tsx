import { nodeText, type EssayDoc } from "@/lib/essay/doc";

/** Read-only rendering of a document as plain blocks (no HTML injection). */
export function DocPreview({ doc }: { doc: EssayDoc }) {
  return (
    <div className="essay-prose text-[0.98rem]">
      {doc.content.map((node, i) =>
        node.type === "heading" ? (
          <h3 key={i}>{nodeText(node)}</h3>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {nodeText(node)}
          </p>
        ),
      )}
    </div>
  );
}
