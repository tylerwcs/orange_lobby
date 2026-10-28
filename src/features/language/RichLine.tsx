import { Fragment } from "react";
import { richParts } from "./rich";

/**
 * One line of dictionary wording with **bold** and {icon} marks (D739), so a step that mixes
 * words, bold button names and inline icons can live in `ms.ts` as plain text. An unknown
 * {name} is dropped rather than printed.
 */
export function RichLine({ text, bold, icons }: {
  text: string;
  bold: (children: React.ReactNode) => React.ReactNode;
  icons: Record<string, React.ReactNode>;
}) {
  return (
    <>
      {richParts(text).map((p, i) => (
        <Fragment key={i}>
          {p.kind === "bold" ? bold(p.value) : p.kind === "icon" ? icons[p.value] ?? null : p.value}
        </Fragment>
      ))}
    </>
  );
}
